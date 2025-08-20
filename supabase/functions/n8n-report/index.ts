import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-n8n-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface N8nPayload {
  session_id: string;
  model?: string;
  totalRisk?: number;
  answersCount?: number;
  report_markdown: string;
  report_json?: any;
  report_title?: string;
  risk_category?: string;
}

// Verify HMAC signature (accept hex OR base64, 'sha256=' prefix allowed)
async function verifySignature(
  payload: string,
  signature: string | null,
  secret: string | null,
): Promise<boolean> {
  if (!secret) return true;      // geen secret ingesteld → skip verificatie
  if (!signature) return false;  // secret wel ingesteld maar geen signature mee

  const provided = signature.replace(/^sha256=/, "").trim();

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(mac);

  // Verwachte MAC als hex
  const expectedHex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  // Verwachte MAC als base64
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const expectedB64 = btoa(bin);

  // timing-safe vergelijking
  const safeEq = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return res === 0;
  };

  return safeEq(provided, expectedHex) || safeEq(provided, expectedB64);
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Supabase client (service role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const signingSecret = Deno.env.get("N8N_SIGNING_SECRET"); // bv. 'svalneratlas'

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Raw body + signature header
    const bodyText = await req.text();               // exact dezelfde bytes als n8n tekent
    const signature = req.headers.get("x-n8n-signature");

    // HMAC check (alleen als secret gezet is)
    if (signingSecret && !(await verifySignature(bodyText, signature, signingSecret))) {
      console.error("Invalid signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // JSON parse
    let payload: N8nPayload;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error("Invalid JSON:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vereiste velden
    if (!payload.session_id) {
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payload.report_markdown) {
      return new Response(JSON.stringify({ error: "report_markdown is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Session check
    const { data: session, error: sessionError } = await supabase
      .from("atad2_sessions")
      .select("session_id, user_id")
      .eq("session_id", payload.session_id)
      .single();

    if (sessionError || !session) {
      console.error("Session not found:", sessionError);
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // risk_category valideren (optioneel)
    const validRiskCategories = ["low", "medium", "high", "insufficient_information"];
    const riskCategory =
      payload.risk_category && validRiskCategories.includes(payload.risk_category)
        ? payload.risk_category
        : null; // backward compatible

    // Insert report
    const { data: report, error: insertError } = await supabase
      .from("atad2_reports")
      .insert({
        session_id: payload.session_id,
        model: payload.model,
        total_risk: payload.totalRisk,
        answers_count: payload.answersCount,
        report_title: payload.report_title || "ATAD2 Report",
        report_md: payload.report_markdown,
        report_json: payload.report_json,
        risk_category: riskCategory,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert report:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Report created successfully:", report.id);

    return new Response(JSON.stringify({ ok: true, report }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
