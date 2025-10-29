import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    const { session_id, memo_markdown, user_full_name, user_first_name, user_last_name } = await req.json()

    if (!session_id || !memo_markdown) {
      return new Response('Missing session_id or memo_markdown', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    console.log(`Parsing memo for session: ${session_id}`)
    console.log('User data received:', { user_full_name, user_first_name, user_last_name })

    // Call the n8n webhook
    const n8nResponse = await fetch('https://lennartwilming.app.n8n.cloud/webhook/parse-memo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id,
        memo_markdown,
        user_full_name,
        user_first_name,
        user_last_name
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