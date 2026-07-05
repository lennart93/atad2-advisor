// review-memo edge function.
//
// Called by the n8n "generate-report" workflow (one HTTP Request node) AFTER the
// memo is generated and BEFORE n8n inserts it into atad2_reports. It rewrites the
// draft into fluent Dutch-adviser English with grounded appendix references,
// guarded so it can never drop a fact, and returns the polished markdown. It
// writes nothing: n8n stays the inserter, so there is no HMAC/insert trust
// boundary here. See docs/superpowers/specs/2026-07-03-memo-review-pass-design.md
//
// Auth: reuses the service-role key as a shared secret. n8n already holds the
// Supabase service key; it must send it as `Authorization: Bearer <service_key>`.
// The public anon key is therefore NOT enough to burn Fable tokens on this
// endpoint. This runs with the service role, so it can read the appendix + session.
//
// Request  (POST JSON): { session_id: string, draft_markdown: string }
// Response (200 JSON):  { markdown, status: 'polished'|'skipped', model, failures }
// On ANY internal error it returns the untouched draft with status 'skipped'
// (HTTP 200), so the workflow never breaks: worst case, the memo is un-polished
// but correct.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReviewContext, reviewMemo, type RawAppendix } from "./reviewMemo.ts";
import { callFable, FABLE_MODEL, hasFableKey } from "./fable.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Constant-time string compare, so the bearer check does not leak via timing. */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!serviceKey || !safeEq(bearer, serviceKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: { session_id?: string; draft_markdown?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const sessionId = (payload.session_id ?? "").toString().trim();
  const draft = (payload.draft_markdown ?? "").toString();
  if (!sessionId) return json({ error: "session_id is required" }, 400);
  if (!draft.trim()) return json({ error: "draft_markdown is empty" }, 400);

  // Off-switch without a redeploy, or missing API key: hand the draft back untouched.
  const enabled = (Deno.env.get("MEMO_REVIEW_ENABLED") ?? "true").toLowerCase() !== "false";
  if (!enabled || !hasFableKey()) {
    return json({ markdown: draft, status: "skipped", model: null, failures: ["review disabled or no API key"] });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const { data: session } = await supabase
      .from("atad2_sessions")
      .select("taxpayer_name")
      .eq("session_id", sessionId)
      .maybeSingle();

    const { data: rawAppendix } = await supabase
      .from("atad2_appendix")
      .select("facts, rows, facts_skipped, checklist_skipped, generation_status")
      .eq("session_id", sessionId)
      .maybeSingle();

    // Only offer appendix references once the appendix has actually generated.
    const appendixForReview =
      rawAppendix && rawAppendix.generation_status === "ready"
        ? (rawAppendix as unknown as RawAppendix)
        : null;

    const ctx = buildReviewContext(session?.taxpayer_name ?? null, appendixForReview);
    const result = await reviewMemo(draft, ctx, callFable);

    console.log(JSON.stringify({
      level: "info", event: "review_memo", status: result.status,
      failures: result.failures, session_id: sessionId,
    }));

    return json({
      markdown: result.markdown,
      status: result.status,
      model: result.status === "polished" ? FABLE_MODEL : null,
      failures: result.failures,
    });
  } catch (err) {
    // Never break the workflow: return the draft so n8n inserts a correct memo.
    console.error(JSON.stringify({
      level: "error", event: "review_memo_error", error: String(err), session_id: sessionId,
    }));
    return json({ markdown: draft, status: "skipped", model: null, failures: [String(err)] });
  }
});
