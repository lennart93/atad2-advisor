import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://app-atad2-prod.azurewebsites.net";

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cleanup-secret',
}

// Constant-time string comparison so the shared-secret check does not leak
// length/first-mismatch timing.
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Authorize the caller BEFORE any service-role work. This endpoint runs with
  // the service_role key and performs destructive cross-tenant deletes, so it
  // must not be reachable by anyone who knows the URL. The scheduler/cron must
  // send `x-cleanup-secret: <CLEANUP_SECRET>`. Fail closed: reject if the secret
  // is unset or does not match.
  // DEPLOY REQUIREMENT: set CLEANUP_SECRET on the VM and configure whatever
  // invokes this function (cron / scheduler) to send the matching header.
  const expectedSecret = Deno.env.get('CLEANUP_SECRET') ?? ''
  const providedSecret = req.headers.get('x-cleanup-secret') ?? ''
  if (!expectedSecret || !timingSafeEqualStr(expectedSecret, providedSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    console.log('Starting cleanup of expired sessions...')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // Calculate the cutoff time (24 hours ago)
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    
    console.log(`Cutoff time: ${cutoffTime}`)
    
    // Find sessions where docx was downloaded more than 24 hours ago
    // OR sessions older than 30 days without a download
    const staleTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: expiredSessions, error: fetchError } = await supabase
      .from('atad2_sessions')
      .select('session_id, taxpayer_name, docx_downloaded_at')
      .or(`and(docx_downloaded_at.not.is.null,docx_downloaded_at.lt.${cutoffTime}),and(docx_downloaded_at.is.null,created_at.lt.${staleTime})`)
    
    if (fetchError) {
      console.error('Error fetching expired sessions:', fetchError)
      throw fetchError
    }
    
    console.log(`Found ${expiredSessions?.length || 0} expired sessions to delete`)
    
    if (!expiredSessions || expiredSessions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No expired sessions to delete',
          deleted_count: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Delete each expired session (cascade will handle answers and reports)
    const sessionIds = expiredSessions.map(s => s.session_id)
    
    // First delete reports (they reference sessions)
    const { error: reportsError } = await supabase
      .from('atad2_reports')
      .delete()
      .in('session_id', sessionIds)
    
    if (reportsError) {
      console.error('Error deleting reports:', reportsError)
    }
    
    // Then delete answers
    const { error: answersError } = await supabase
      .from('atad2_answers')
      .delete()
      .in('session_id', sessionIds)
    
    if (answersError) {
      console.error('Error deleting answers:', answersError)
    }
    
    // Finally delete sessions
    const { error: deleteError, count } = await supabase
      .from('atad2_sessions')
      .delete()
      .in('session_id', sessionIds)
    
    if (deleteError) {
      console.error('Error deleting sessions:', deleteError)
      throw deleteError
    }
    
    console.log(`Successfully deleted ${expiredSessions.length} expired sessions`)
    
    // Log deleted sessions for audit
    for (const session of expiredSessions) {
      console.log(`Deleted: ${session.taxpayer_name} (session: ${session.session_id}, downloaded: ${session.docx_downloaded_at})`)
    }
    
    // Return counts only. Do NOT include session_id / taxpayer_name in the
    // response body: that would disclose confidential client identities to the
    // caller. Per-session detail stays in the server-side audit log above.
    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${expiredSessions.length} expired sessions`,
        deleted_count: expiredSessions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Cleanup error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})