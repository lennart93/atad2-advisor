// build-factsheet — factsheet pipeline, cross-document merge.
//
// Async status pattern copied 1:1 from generate-appendix: a fast 202-style
// response, the merge runs in the background (EdgeRuntime.waitUntil), the client
// polls atad2_session_factsheet.generation_status. Every run is a FULL rebuild
// (no incremental merge in v1) and bumps version by 1.
//
// Input is the compact JSON of all atad2_document_facts rows for the session,
// never raw documents. Refuses to start while there are fresh (< 2 min) pending
// extractions; stale pending / error rows are ignored with a warning folded into
// the factsheet's inconsistencies.

import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callModel, parseJsonObject } from "./llm.ts";
import { loadActivePrompt, renderTemplate } from "./promptsLoader.ts";
import { FactsheetSchema, type Factsheet } from "../_shared/factsheetSchema.ts";
import { mergeFactsheets } from "../_shared/factsheetMerge.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const FRESH_MS = 90_000;
const PENDING_GRACE_MS = 120_000; // 2 min: a pending row younger than this blocks the merge.
// Above this many documents, merge in chunks instead of one call: a single
// large merge overran the edge wall-clock and left the factsheet stuck
// 'generating'. Each chunk is a fast model merge; the partials are combined
// deterministically in code (mergeFactsheets), so the build always completes.
const CHUNK_SIZE = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let body: { session_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.session_id) return json({ error: "Missing session_id" }, 400);

  const service = createServiceClient();
  const userId = await verifyJwtAndSessionOwnership(authHeader, body.session_id, service);
  if (!userId) return json({ error: "Forbidden" }, 403);

  const { created } = await ensureRow(service, body.session_id);
  if (!created) {
    const { data: cur } = await service
      .from("atad2_session_factsheet").select("generation_status, updated_at").eq("session_id", body.session_id).maybeSingle();
    if (cur?.generation_status === "generating" && isFresh(cur.updated_at as string | null)) {
      return json({ ok: true, status: "generating" }, 200);
    }
  }

  await setStatus(service, body.session_id, "generating", { error: null });

  const work = runMerge(service, body.session_id);
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(work);
  else void work.catch((e) => console.error(JSON.stringify({ level: "error", event: "factsheet_bg", message: String(e), session_id: body.session_id })));

  return json({ ok: true, status: "generating" }, 200);
});

interface DocFactsRow { document_id: string; facts: unknown; status: string; error: string | null; updated_at: string; }

async function runMerge(c: SupabaseClient, sessionId: string) {
  const stopHeartbeat = startHeartbeat(c, sessionId);
  try {
    const { data: rowsRaw } = await c
      .from("atad2_document_facts")
      .select("document_id, facts, status, error, updated_at")
      .eq("session_id", sessionId);
    const rows = (rowsRaw ?? []) as DocFactsRow[];

    const now = Date.now();
    const freshPending = rows.filter((r) => r.status === "pending" && now - new Date(r.updated_at).getTime() < PENDING_GRACE_MS);
    if (freshPending.length > 0) {
      // Input not ready yet: back off to idle so a later trigger (all docs done)
      // runs a clean merge, rather than burning an Opus call on partial input.
      console.warn(JSON.stringify({ level: "warn", event: "factsheet_deferred", session_id: sessionId, fresh_pending: freshPending.length }));
      await setStatus(c, sessionId, "idle", {});
      return;
    }

    const complete = rows.filter((r) => r.status === "complete" && r.facts);
    if (complete.length === 0) {
      await setStatus(c, sessionId, "error", { error: "No completed document extractions to merge." });
      return;
    }

    // Warnings for stale-pending / errored docs, folded into inconsistencies.
    const stalePending = rows.filter((r) => r.status === "pending");
    const errored = rows.filter((r) => r.status === "error");

    // doc labels for the merge input + warnings.
    const { data: docs } = await c
      .from("atad2_session_documents").select("id, doc_label, category").eq("session_id", sessionId);
    const labelOf = new Map((docs ?? []).map((d) => [d.id as string, { doc_label: d.doc_label as string, category: d.category as string }]));

    const mergeInput = complete.map((r) => ({
      doc_label: labelOf.get(r.document_id)?.doc_label ?? r.document_id,
      category: labelOf.get(r.document_id)?.category ?? "other",
      facts: r.facts,
    }));

    const { data: session } = await c
      .from("atad2_sessions").select("taxpayer_name, fiscal_year").eq("session_id", sessionId).maybeSingle();

    const prompt = await loadActivePrompt(c, "factsheet_merge_system");
    const started = Date.now();
    let input_tokens = 0;
    let output_tokens = 0;

    // Merge one group of documents into a partial fact sheet. Lenient parse with
    // one retry on a malformed response.
    const mergeChunk = async (chunkInput: typeof mergeInput): Promise<Factsheet> => {
      const user = renderTemplate(prompt.user_prompt_template, {
        TAXPAYER_NAME: (session?.taxpayer_name as string | null) ?? "",
        FISCAL_YEAR: (session?.fiscal_year as string | null) ?? "",
        DOC_FACTS_JSON: JSON.stringify(chunkInput),
      });
      const call = async () => {
        const r = await callModel({ model: prompt.model, systemPrompt: prompt.system_prompt, user, temperature: prompt.temperature, maxTokens: prompt.max_tokens });
        input_tokens += r.input_tokens;
        output_tokens += r.output_tokens;
        return FactsheetSchema.parse(parseJsonObject(r.text));
      };
      try {
        return await call();
      } catch (first) {
        console.warn(JSON.stringify({ level: "warn", event: "factsheet_merge_retry", message: String(first).slice(0, 200) }));
        return await call();
      }
    };

    let factsheet: Factsheet;
    if (mergeInput.length <= CHUNK_SIZE) {
      factsheet = await mergeChunk(mergeInput);
    } else {
      // Big dossier: split into chunks, merge each in parallel (each fits the
      // edge wall-clock), then combine the partials deterministically in code so
      // the whole build never times out.
      const chunks: (typeof mergeInput)[] = [];
      for (let i = 0; i < mergeInput.length; i += CHUNK_SIZE) chunks.push(mergeInput.slice(i, i + CHUNK_SIZE));
      console.log(JSON.stringify({ level: "info", event: "factsheet_chunked_merge", session_id: sessionId, docs: mergeInput.length, chunks: chunks.length }));
      const partials = await Promise.all(chunks.map((ch, i) =>
        mergeChunk(ch).catch((e) => {
          console.warn(JSON.stringify({ level: "warn", event: "factsheet_chunk_failed", session_id: sessionId, chunk: i, message: String(e).slice(0, 200) }));
          return null;
        })
      ));
      const good = partials.filter((p): p is Factsheet => p !== null);
      if (good.length === 0) throw new Error("all chunk merges failed");
      factsheet = mergeFactsheets(good);
      if (good.length < chunks.length) {
        factsheet.inconsistencies.push({
          description: `${chunks.length - good.length} of ${chunks.length} document groups failed to merge and were excluded from this fact sheet. Rebuild to retry them.`,
          docs: [],
          severity: "verify_before_final",
        });
      }
    }

    // Fold the extraction-coverage warnings into inconsistencies so the panel
    // surfaces them (the merge model never saw the stale/errored docs).
    for (const r of [...stalePending, ...errored]) {
      const label = labelOf.get(r.document_id)?.doc_label ?? r.document_id;
      factsheet.inconsistencies.push({
        description: r.status === "error"
          ? `Document "${label}" failed fact extraction and was excluded from this fact sheet${r.error ? ` (${r.error.slice(0, 120)})` : ""}. Rebuild after re-uploading or re-extracting it.`
          : `Document "${label}" was still extracting when this fact sheet was built and was excluded. Rebuild once its extraction completes.`,
        docs: [label],
        severity: "verify_before_final",
      });
    }

    // Bump version off the current row.
    const { data: prev } = await c
      .from("atad2_session_factsheet").select("version").eq("session_id", sessionId).maybeSingle();
    const nextVersion = ((prev?.version as number | null) ?? 0) + 1;

    const { error: upErr } = await c
      .from("atad2_session_factsheet")
      .update({
        factsheet,
        version: nextVersion,
        generation_status: "complete",
        error: null,
        source_document_ids: complete.map((r) => r.document_id),
        model: prompt.model,
        prompt_version: prompt.version,
        built_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", sessionId);
    if (upErr) throw upErr;

    console.log(JSON.stringify({
      level: "info", event: "factsheet_built", session_id: sessionId, version: nextVersion,
      docs_merged: complete.length, docs_excluded: stalePending.length + errored.length,
      duration_ms: Date.now() - started, input_tokens, output_tokens,
      entities: factsheet.entities.length, flows: factsheet.flows.length,
      inconsistencies: factsheet.inconsistencies.length, open_points: factsheet.open_points.length,
    }));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "factsheet_merge_failed", session_id: sessionId, message: String(err).slice(0, 500) }));
    await setStatus(c, sessionId, "error", { error: String(err).slice(0, 500) });
  } finally {
    stopHeartbeat();
  }
}

async function ensureRow(c: SupabaseClient, sessionId: string): Promise<{ created: boolean }> {
  const { data } = await c.from("atad2_session_factsheet").select("session_id").eq("session_id", sessionId).maybeSingle();
  if (data) return { created: false };
  const { error } = await c
    .from("atad2_session_factsheet")
    .insert({ session_id: sessionId, generation_status: "generating", version: 0 });
  if (error) {
    // Concurrent insert: treat as existing.
    const { data: again } = await c.from("atad2_session_factsheet").select("session_id").eq("session_id", sessionId).maybeSingle();
    if (again) return { created: false };
    throw error;
  }
  return { created: true };
}

function isFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  return (Date.now() - new Date(updatedAt).getTime()) < FRESH_MS;
}

async function setStatus(c: SupabaseClient, sessionId: string, status: string, extra: Record<string, unknown>) {
  const { error } = await c
    .from("atad2_session_factsheet")
    .update({ generation_status: status, updated_at: new Date().toISOString(), ...extra })
    .eq("session_id", sessionId);
  if (error) throw error;
}

/**
 * Keep updated_at fresh while a merge runs. The isFresh() guard treats a
 * 'generating' row as stale after 90s, which a big chunked merge exceeds;
 * without a heartbeat a manual Rebuild mid-run passed the guard and started a
 * second concurrent merge, so both read the same version, both wrote version+1
 * and the last writer silently replaced the other's factsheet. A run whose
 * isolate dies stops beating, so takeover after 90s still works.
 */
function startHeartbeat(c: SupabaseClient, sessionId: string): () => void {
  const beat = setInterval(() => {
    c.from("atad2_session_factsheet")
      .update({ updated_at: new Date().toISOString() })
      .eq("session_id", sessionId).eq("generation_status", "generating")
      .then(({ error }) => {
        if (error) console.warn(JSON.stringify({ level: "warn", event: "factsheet_heartbeat_failed", session_id: sessionId, message: String(error.message) }));
      });
  }, 30_000);
  return () => clearInterval(beat);
}
