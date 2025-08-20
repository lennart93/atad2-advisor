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

// Optional HMAC-check (alleen actief als N8N_SIGNING_SECRET gezet is)
async function verifySignature(payload: string, signature: string | null, secret: string | null): Promise<boolean> {
  if (!secret) return true;
  if (!signature) return false;
  const provided = signature.replace(/^sha256=/, "").trim();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(mac);
  const expectedHex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const expectedB64 = btoa(bin);
  const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i=0;i<a.length;i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
  return safeEq(provided, expectedHex) || safeEq(provided, expectedB64);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const signingSecret = Deno.env.get("N8N_SIGNING_SECRET") ?? null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Lees raw body (exact wat n8n verstuurt)
    const bodyText = await req.text();
    const signature = req.headers.get("x-n8n-signature");

    // HMAC (alleen als secret aanwezig is)
    if (signingSecret && !(await verifySignature(bodyText, signature, signingSecret))) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse
    let payload: N8nPayload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Vereist: session_id
    if (!payload.session_id || !String(payload.session_id).trim()) {
      return new Response(JSON.stringify({ error: "session_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Vereist: report_markdown NIET leeg (harde stop als AI niets gaf)
    const md = (payload.report_markdown ?? "").toString().trim();
    if (!md) {
      return new Response(JSON.stringify({ error: "report_markdown is empty (AI returned no content)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Session bestaan
    const { data: session, error: sessionError } = await supabase
      .from("atad2_sessions")
      .select("session_id, user_id")
      .eq("session_id", payload.session_id)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // risk_category normaliseren (optioneel)
    const validRisk = ["low", "medium", "high", "insufficient_information"];
    const riskCategory = payload.risk_category && validRisk.includes(payload.risk_category) ? payload.risk_category : null;

    // Insert
    const { data: report, error: insertError } = await supabase
      .from("atad2_reports")
      .insert({
        session_id: payload.session_id,
        model: payload.model,
        total_risk: payload.totalRisk,
        answers_count: payload.answersCount,
        report_title: payload.report_title || "ATAD2 Report",
        report_md: md,                          // <-- gegarandeerd NIET leeg
        report_json: payload.report_json ?? {},
        risk_category: riskCategory,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: "Failed to create report" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, report }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
