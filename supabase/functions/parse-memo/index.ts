import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://app-atad2-prod.azurewebsites.net";

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log(`${req.method} ${req.url}`)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      })
    }

    const body = await req.json()
    const { session_id, memo_markdown, user_full_name, user_first_name, user_last_name } = body

    if (!session_id || typeof session_id !== 'string' || !memo_markdown || typeof memo_markdown !== 'string') {
      return new Response('Missing or invalid session_id or memo_markdown', {
        status: 400,
        headers: corsHeaders
      })
    }

    // Validate optional string fields
    const safeString = (val: unknown): string => (typeof val === 'string' ? val.slice(0, 200) : '')

    console.log(`Parsing memo for session: ${session_id}`)
    console.log('User data received:', { user_full_name, user_first_name, user_last_name })

    // Call the n8n webhook
    const n8nResponse = await fetch('https://n8n.atad2.tax/webhook/parse-memo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id,
        memo_markdown,
        user_full_name: safeString(user_full_name),
        user_first_name: safeString(user_first_name),
        user_last_name: safeString(user_last_name)
      })
    })

    if (!n8nResponse.ok) {
      console.error(`N8N webhook error: ${n8nResponse.status}`)
      return new Response(`Parse service error: ${n8nResponse.status}`, { 
        status: 502, 
        headers: corsHeaders 
      })
    }

    const result = await n8nResponse.json()
    console.log('N8N response received successfully')

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(`Server error: ${error.message}`, { 
      status: 500, 
      headers: corsHeaders 
    })
  }
})