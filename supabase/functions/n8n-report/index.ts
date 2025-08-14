import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-n8n-signature',
};

interface N8nPayload {
  session_id: string;
  model?: string;
  totalRisk?: number;
  answersCount?: number;
  report_markdown: string;
  report_json?: any;
  report_title?: string;
}

// Verify HMAC signature if signing secret is configured
function verifySignature(payload: string, signature: string | null, secret: string | null): boolean {
  if (!secret) return true; // Skip verification if no secret configured
  if (!signature) return false; // Reject if signature expected but not provided
  
  try {
    const encoder = new TextEncoder();
    const key = encoder.encode(secret);
    const data = encoder.encode(payload);
    
    // Create HMAC-SHA256
    return crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ).then(cryptoKey => 
      crypto.subtle.sign('HMAC', cryptoKey, data)
    ).then(signature_buffer => {
      const expected = Array.from(new Uint8Array(signature_buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Compare signatures (remove 'sha256=' prefix if present)
      const provided = signature.replace(/^sha256=/, '');
      return expected === provided;
    }).catch(() => false);
  } catch {
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const signingSecret = Deno.env.get('N8N_SIGNING_SECRET');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body and signature
    const bodyText = await req.text();
    const signature = req.headers.get('x-n8n-signature');
    
    // Verify signature if configured
    if (signingSecret && !(await verifySignature(bodyText, signature, signingSecret))) {
      console.error('Invalid signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse JSON payload
    let payload: N8nPayload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error('Invalid JSON:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required fields
    if (!payload.session_id) {
      return new Response(JSON.stringify({ error: 'session_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!payload.report_markdown) {
      return new Response(JSON.stringify({ error: 'report_markdown is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if session exists
    const { data: session, error: sessionError } = await supabase
      .from('atad2_sessions')
      .select('session_id, user_id')
      .eq('session_id', payload.session_id)
      .single();

    if (sessionError || !session) {
      console.error('Session not found:', sessionError);
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert report record
    const { data: report, error: insertError } = await supabase
      .from('atad2_reports')
      .insert({
        session_id: payload.session_id,
        model: payload.model,
        total_risk: payload.totalRisk,
        answers_count: payload.answersCount,
        report_title: payload.report_title || 'ATAD2 Report',
        report_md: payload.report_markdown,
        report_json: payload.report_json,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert report:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create report' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Report created successfully:', report.id);

    return new Response(JSON.stringify({ ok: true, report }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});