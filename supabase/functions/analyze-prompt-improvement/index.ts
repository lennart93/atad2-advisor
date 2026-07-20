// Admin "Prompt Tuner" edge function.
//
// Two synchronous actions on one POST endpoint, gated on the admin role:
//   - find:    locate the original AI output the admin improved.
//                memo     -> lexical match of improved_text against recent reports.
//                appendix + improved_text -> lexical match against recent
//                             appendices (rows flattened to text), like memo.
//                appendix without improved_text -> recent rows from
//                             atad2_appendix_edits (old/new pair).
//   - analyze: one Claude call diffing original vs improved and proposing a
//                sharpened replacement for the target prompt. Returns the
//                analysis JSON directly (no persistence, no polling).
//
// Reuses generate-appendix conventions: per-folder deno.json, inline CORS,
// callClaude/extractJson, service-role client.

import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyAdmin } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import { AnalyzeRequest, FindRequest, TuningAnalysis, type TuningAnalysisT } from "./schemas.ts";
import { META_SYSTEM, buildUserMessage, similarity } from "./meta.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let body: { action?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const service = createServiceClient();
  const userId = await verifyAdmin(authHeader, service);
  if (!userId) return json({ error: "Forbidden" }, 403);

  try {
    if (body.action === "find") return await handleFind(service, body);
    if (body.action === "analyze") return await handleAnalyze(service, body);
    return json({ error: `Unknown action: ${body.action ?? "(none)"}` }, 400);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "prompt_tuner_failed", action: body.action, message: String(err).slice(0, 500) }));
    return json({ error: String(err).slice(0, 500) }, 500);
  }
});

interface SessionMeta { taxpayer_name: string | null; fiscal_year: string | null; }

async function loadSessionMeta(c: SupabaseClient, sessionIds: string[]): Promise<Map<string, SessionMeta>> {
  const ids = [...new Set(sessionIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data } = await c
    .from("atad2_sessions")
    .select("session_id, taxpayer_name, fiscal_year")
    .in("session_id", ids);
  return new Map((data ?? []).map((s) => [
    s.session_id as string,
    { taxpayer_name: s.taxpayer_name as string | null, fiscal_year: s.fiscal_year as string | null },
  ]));
}

/** The few appendix-row fields the tuner needs; rows JSONB mirrors AppendixRow. */
interface AppendixRowLite {
  rowId?: string;
  status?: string | null;
  reasoning?: string | null;
}

/**
 * Flatten an appendix's rows to plain text so it can be diffed against a pasted
 * improved version and lexically matched. Keeps the client-facing fields only
 * (no provenance, no internal references).
 */
function flattenAppendixRows(rows: AppendixRowLite[]): string {
  return rows
    .map((r) => {
      const head = `Row ${r.rowId ?? "?"} - Status: ${r.status ?? "(not set)"}`;
      const reasoning = (r.reasoning ?? "").trim();
      return reasoning ? `${head}\n${reasoning}` : head;
    })
    .join("\n\n");
}

async function handleFind(c: SupabaseClient, raw: unknown) {
  const req = FindRequest.parse(raw);

  if (req.output_type === "memo") {
    const improved = (req.improved_text ?? "").trim();
    if (!improved) return json({ error: "Paste the improved memo first." }, 400);

    const { data: reports } = await c
      .from("atad2_reports")
      .select("id, session_id, report_md, prompt_version, generated_at")
      .is("archived_at", null)
      .order("generated_at", { ascending: false })
      .limit(150);

    const rows = (reports ?? []).filter((r) => (r.report_md as string | null)?.trim());
    const meta = await loadSessionMeta(c, rows.map((r) => r.session_id as string));

    const candidates = rows
      .map((r) => {
        const original = r.report_md as string;
        const m = meta.get(r.session_id as string);
        return {
          source_row_id: r.id as string,
          session_id: r.session_id as string,
          taxpayer_name: m?.taxpayer_name ?? null,
          fiscal_year: m?.fiscal_year ?? null,
          prompt_version: r.prompt_version as string | null,
          original_text: original,
          snippet: original.slice(0, 240),
          score: similarity(improved, original),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return json({ candidates });
  }

  // appendix, paste mode: mirror the memo flow. The admin pastes a hand-improved
  // appendix text (rows or the whole Part B); we lexically match it against the
  // recent appendices' flattened rows and return memo-shaped candidates.
  const improvedAppendix = (req.improved_text ?? "").trim();
  if (req.output_type === "appendix" && improvedAppendix) {
    const { data: appendices } = await c
      .from("atad2_appendix")
      .select("id, session_id, rows, prompt_version, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);

    const rows = (appendices ?? []).filter((a) => Array.isArray(a.rows) && (a.rows as unknown[]).length > 0);
    const meta = await loadSessionMeta(c, rows.map((a) => a.session_id as string));

    const candidates = rows
      .map((a) => {
        const original = flattenAppendixRows(a.rows as AppendixRowLite[]);
        const m = meta.get(a.session_id as string);
        return {
          source_row_id: a.id as string,
          session_id: a.session_id as string,
          taxpayer_name: m?.taxpayer_name ?? null,
          fiscal_year: m?.fiscal_year ?? null,
          prompt_version: a.prompt_version == null ? null : String(a.prompt_version),
          original_text: original,
          snippet: original.slice(0, 240),
          score: similarity(improvedAppendix, original),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return json({ candidates });
  }

  // appendix, no pasted text: every human correction in atad2_appendix_edits is
  // already an original (old_value) -> improved (new_value) pair.
  const { data: edits } = await c
    .from("atad2_appendix_edits")
    .select("id, appendix_id, row_id, field, old_value, new_value, edited_at")
    .order("edited_at", { ascending: false })
    .limit(50);

  const usable = (edits ?? []).filter((e) => {
    const oldV = (e.old_value as string | null)?.trim();
    const newV = (e.new_value as string | null)?.trim();
    return oldV && newV && oldV !== newV;
  });

  const appendixIds = [...new Set(usable.map((e) => e.appendix_id as string))];
  const apMap = new Map<string, string>();
  if (appendixIds.length) {
    const { data: aps } = await c
      .from("atad2_appendix")
      .select("id, session_id")
      .in("id", appendixIds);
    for (const a of aps ?? []) apMap.set(a.id as string, a.session_id as string);
  }
  const meta = await loadSessionMeta(c, [...apMap.values()]);

  const candidates = usable.map((e) => {
    const sid = apMap.get(e.appendix_id as string) ?? null;
    return {
      edit_id: e.id as string,
      session_id: sid,
      taxpayer_name: sid ? (meta.get(sid)?.taxpayer_name ?? null) : null,
      row_id: e.row_id as string,
      field: e.field as string,
      original_text: e.old_value as string,
      improved_text: e.new_value as string,
      edited_at: e.edited_at as string,
    };
  });

  return json({ candidates });
}

async function handleAnalyze(c: SupabaseClient, raw: unknown) {
  const req = AnalyzeRequest.parse(raw);

  const { data: target } = await c
    .from("atad2_prompts")
    .select("system_prompt, version, key")
    .eq("key", req.prompt_key)
    .eq("is_active", true)
    .maybeSingle();
  if (!target) return json({ error: `No active prompt for '${req.prompt_key}'. Nothing to revise.` }, 400);

  const user = buildUserMessage({
    outputType: req.output_type,
    promptKey: req.prompt_key,
    currentSystemPrompt: target.system_prompt as string,
    original: req.original_text,
    improved: req.improved_text,
  });

  // The full analysis (Opus with thinking, rewriting a several-thousand-token
  // system prompt) regularly runs past Kong's read timeout, which killed the
  // request as a 504 with nothing shown to the admin. Streaming NDJSON
  // heartbeats keeps the connection alive for as long as the model needs;
  // the last line carries the payload or the error. The client scans for the
  // final non-heartbeat line (parseAnalyzeResponseText).
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const beat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('{"heartbeat":true}\n'));
        } catch {
          clearInterval(beat);
        }
      }, 10_000);
      (async () => {
        try {
          const analysis = await callWithRetry(() => callClaude({ cachedSystem: META_SYSTEM, user }));
          controller.enqueue(encoder.encode(JSON.stringify({
            analysis,
            target_prompt_version: target.version as number,
            target_prompt_key: target.key as string,
          }) + "\n"));
        } catch (err) {
          console.error(JSON.stringify({ level: "error", event: "prompt_tuner_failed", action: "analyze", message: String(err).slice(0, 500) }));
          controller.enqueue(encoder.encode(JSON.stringify({ error: String(err).slice(0, 500) }) + "\n"));
        } finally {
          clearInterval(beat);
          try { controller.close(); } catch { /* stream already closed by the client */ }
        }
      })();
    },
  });
  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" },
  });
}

async function callWithRetry(
  call: () => Promise<{ text: string; stopReason: string | null }>,
): Promise<TuningAnalysisT> {
  // A truncated response (stop_reason max_tokens) is guaranteed-invalid JSON;
  // fail it with a readable message instead of a JSON.parse SyntaxError. The
  // single retry still applies: thinking length varies per run, so a second
  // attempt can land under the cap.
  const attempt = async () => {
    const res = await call();
    if (res.stopReason === "max_tokens") {
      throw new Error(
        "The model ran out of output tokens before finishing the analysis (stop_reason max_tokens).",
      );
    }
    return TuningAnalysis.parse(JSON.parse(extractJson(res.text)));
  };
  try {
    return await attempt();
  } catch (first) {
    try {
      return await attempt();
    } catch {
      throw first;
    }
  }
}
