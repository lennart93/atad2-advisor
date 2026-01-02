import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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
    const { data: expiredSessions, error: fetchError } = await supabase
      .from('atad2_sessions')
      .select('session_id, taxpayer_name, docx_downloaded_at')
      .not('docx_downloaded_at', 'is', null)
      .lt('docx_downloaded_at', cutoffTime)
    
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
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Deleted ${expiredSessions.length} expired sessions`,
        deleted_count: expiredSessions.length,
        deleted_sessions: expiredSessions.map(s => ({
          session_id: s.session_id,
          taxpayer_name: s.taxpayer_name
        }))
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