import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import {
  Stage1Output,
  Stage2Output,
  Stage3Output,
  type Stage1OutputT,
  type Stage2OutputT,
} from "./schemas.ts";
import { loadDocumentsBlock } from "./documentsLoader.ts";
import { formatQaBlock } from "./formatters.ts";
import stage1Prompt from "./prompts/stage1-entities.ts";
import stage2Prompt from "./prompts/stage2-ownership.ts";
import stage3Prompt from "./prompts/stage3-transactions.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExtractStructureRequest {
  session_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    let body: ExtractStructureRequest;
    try {
      body = await req.json() as ExtractStructureRequest;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!body.session_id) {
      return json({ error: "Missing session_id" }, 400);
    }

    const serviceClient = createServiceClient();
    const userId = await verifyJwtAndSessionOwnership(authHeader, body.session_id, serviceClient);
    if (!userId) return json({ error: "Forbidden" }, 403);

    const chart = await ensureChart(serviceClient, body.session_id);

    // Idempotency: clear ai_extracted rows (preserves user_added/user_edited).
    // Edges first to satisfy FK from edges -> entities.
    {
      const { error: edgesDelErr } = await serviceClient
        .from("atad2_structure_edges")
        .delete()
        .eq("chart_id", chart.id)
        .eq("source", "ai_extracted");
      if (edgesDelErr) throw edgesDelErr;
      const { error: entsDelErr } = await serviceClient
        .from("atad2_structure_entities")
        .delete()
        .eq("chart_id", chart.id)
        .eq("source", "ai_extracted");
      if (entsDelErr) throw entsDelErr;
    }

    await setStatus(serviceClient, chart.id, "extracting:stage1", { warnings: [] });

    // Kick off the 3-stage extraction in the background and return immediately.
    // The frontend polls atad2_structure_charts.status to track progress.
    // EdgeRuntime.waitUntil keeps the worker alive past the response.
    const work = runExtractionPipeline(serviceClient, chart.id, body.session_id);
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(work);
    } else {
      // Fallback for environments without EdgeRuntime: detach but don't await.
      void work.catch((err) => {
        console.error(JSON.stringify({
          level: "error",
          event: "background_pipeline_unhandled",
          message: String(err),
          chart_id: chart.id,
        }));
      });
    }

    return json({ ok: true, chart_id: chart.id, status: "extracting:stage1" }, 200);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "unhandled_error", message: String(err) }));
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ----- Background pipeline -----

/**
 * Runs the 3 stages, persisting to the DB at each step. Always resolves;
 * failures are logged and reflected in atad2_structure_charts.status / .warnings.
 */
async function runExtractionPipeline(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  try {
    // Build the cached system block once (shared across all 3 stages).
    const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
    const qaText = await loadQaAnswersText(serviceClient, sessionId);
    const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
    const cachedSystem =
      `<documents>\n${docsBlock}\n</documents>\n` +
      `<qa_answers>\n${qaText}\n</qa_answers>`;

    // ----- Stage 1: entities -----
    let stage1: Stage1OutputT;
    try {
      stage1 = await runStage1(cachedSystem, taxpayerName);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        event: "stage1_failed",
        message: String(err),
        chart_id: chartId,
      }));
      await setStatus(serviceClient, chartId, "extraction_failed", {
        warnings: [{ stage: 1, message: String(err).slice(0, 500) }],
      });
      return;
    }

    const tempIdToUuid = new Map<string, string>();
    for (const e of stage1.entities) {
      const { data, error } = await serviceClient
        .from("atad2_structure_entities")
        .insert({
          chart_id: chartId,
          name: e.name,
          legal_form: e.legal_form ?? null,
          jurisdiction_iso: e.jurisdiction_iso.toUpperCase(),
          entity_type: e.entity_type,
          is_taxpayer: e.is_taxpayer,
          source: "ai_extracted",
        })
        .select("id")
        .single();
      if (error) throw error;
      tempIdToUuid.set(e.temp_id, data.id);
    }

    // ----- Stage 2: ownership (graceful on failure) -----
    await setStatus(serviceClient, chartId, "extracting:stage2");
    let stage2: Stage2OutputT = { ownership_edges: [] };
    try {
      stage2 = await runStage2(cachedSystem, stage1.entities);
      for (const oe of stage2.ownership_edges) {
        const fromId = tempIdToUuid.get(oe.from_temp_id);
        const toId = tempIdToUuid.get(oe.to_temp_id);
        if (!fromId || !toId) continue;
        const { error: insErr } = await serviceClient
          .from("atad2_structure_edges")
          .insert({
            chart_id: chartId,
            from_entity_id: fromId,
            to_entity_id: toId,
            kind: "ownership",
            ownership_pct: oe.ownership_pct,
            ownership_voting_only: oe.voting_only ?? null,
            source: "ai_extracted",
          });
        if (insErr) throw insErr;
      }
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "stage2_failed",
        message: String(err),
        chart_id: chartId,
      }));
      await appendWarning(serviceClient, chartId, {
        stage: 2,
        message: String(err).slice(0, 500),
      });
    }

    // ----- Stage 3: transactions (graceful on failure) -----
    await setStatus(serviceClient, chartId, "extracting:stage3");
    try {
      const stage3 = await runStage3(cachedSystem, stage1.entities, stage2.ownership_edges);
      for (const t of stage3.transactions) {
        const fromId = tempIdToUuid.get(t.from_temp_id);
        const toId = tempIdToUuid.get(t.to_temp_id);
        if (!fromId || !toId) continue;
        const { error: insErr } = await serviceClient
          .from("atad2_structure_edges")
          .insert({
            chart_id: chartId,
            from_entity_id: fromId,
            to_entity_id: toId,
            kind: "transaction",
            transaction_type: normalizeTransactionType(t.transaction_type),
            amount_eur: t.amount_eur ?? null,
            label: t.label ?? null,
            is_mismatch: t.is_mismatch,
            mismatch_classification: t.mismatch_classification ?? null,
            mismatch_atad2_article: t.mismatch_atad2_article ?? null,
            source: "ai_extracted",
          });
        if (insErr) throw insErr;
      }
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "stage3_failed",
        message: String(err),
        chart_id: chartId,
      }));
      await appendWarning(serviceClient, chartId, {
        stage: 3,
        message: String(err).slice(0, 500),
      });
    }

    const { error: finalUpdateErr } = await serviceClient
      .from("atad2_structure_charts")
      .update({
        status: "draft_ready",
        draft_extracted_at: new Date().toISOString(),
      })
      .eq("id", chartId);
    if (finalUpdateErr) throw finalUpdateErr;
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "pipeline_unhandled",
      message: String(err),
      chart_id: chartId,
    }));
    await setStatus(serviceClient, chartId, "extraction_failed", {
      warnings: [{ stage: 0, message: String(err).slice(0, 500) }],
    });
  }
}

/**
 * Map LLM-produced transaction_type strings to the DB-allowed set.
 * The DB CHECK constraint accepts: loan, royalty, dividend, service_fee,
 * management_fee, other.
 */
function normalizeTransactionType(raw: string): string {
  const s = (raw ?? "").toLowerCase().trim();
  if (s === "loan" || s === "interest" || s === "interest_payment") return "loan";
  if (s === "royalty" || s === "license_fee" || s === "licence_fee") return "royalty";
  if (s === "dividend" || s === "distribution") return "dividend";
  if (s === "service_fee" || s === "service" || s === "service fee") return "service_fee";
  if (s === "management_fee" || s === "management" || s === "management fee") return "management_fee";
  if (["loan", "royalty", "dividend", "service_fee", "management_fee", "other"].includes(s)) return s;
  return "other";
}

// ----- Stage runners -----

async function runStage1(cachedSystem: string, taxpayerName: string): Promise<Stage1OutputT> {
  const user = stage1Prompt.replace("{{TAXPAYER_NAME}}", taxpayerName);
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage1Output);
}

async function runStage2(cachedSystem: string, entities: unknown): Promise<Stage2OutputT> {
  const user = stage2Prompt.replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage2Output);
}

async function runStage3(cachedSystem: string, entities: unknown, ownership: unknown) {
  const user = stage3Prompt
    .replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2))
    .replace("{{OWNERSHIP_JSON}}", JSON.stringify(ownership, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage3Output);
}

// One retry per stage. If the second call also fails, throw the original error.
async function callWithRetry<T>(
  call: () => Promise<{ text: string }>,
  schema: { parse: (input: unknown) => T },
): Promise<T> {
  try {
    const r = await call();
    return schema.parse(JSON.parse(extractJson(r.text)));
  } catch (firstErr) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "stage_retry",
      message: String(firstErr).slice(0, 500),
    }));
    try {
      const r = await call();
      return schema.parse(JSON.parse(extractJson(r.text)));
    } catch {
      throw firstErr;
    }
  }
}

// ----- DB helpers -----

async function ensureChart(client: SupabaseClient, sessionId: string) {
  const { data: existing } = await client
    .from("atad2_structure_charts")
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await client
    .from("atad2_structure_charts")
    .insert({ session_id: sessionId })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

async function setStatus(
  client: SupabaseClient,
  chartId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const { error } = await client
    .from("atad2_structure_charts")
    .update({ status, ...extra })
    .eq("id", chartId);
  if (error) throw error;
}

async function appendWarning(
  client: SupabaseClient,
  chartId: string,
  warning: { stage: number; message: string },
) {
  const { data } = await client
    .from("atad2_structure_charts")
    .select("warnings")
    .eq("id", chartId)
    .single();
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  warnings.push(warning);
  const { error } = await client
    .from("atad2_structure_charts")
    .update({ warnings })
    .eq("id", chartId);
  if (error) throw error;
}

async function loadQaAnswersText(client: SupabaseClient, sessionId: string): Promise<string> {
  // Loads question_id, question_text, answer AND explanation. The explanation
  // free-text is where users typically write entity names, transaction
  // details, and classification rationale — without this column we lose
  // most of the user's actual testimony.
  const { data, error } = await client
    .from("atad2_answers")
    .select("question_id, question_text, answer, explanation")
    .eq("session_id", sessionId);
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({
    question_id: r.question_id as string,
    question_text: r.question_text as string,
    answer: r.answer as string,
    explanation: (r.explanation ?? null) as string | null,
  }));
  return formatQaBlock(rows);
}

async function loadTaxpayerName(client: SupabaseClient, sessionId: string): Promise<string> {
  const { data } = await client
    .from("atad2_sessions")
    .select("taxpayer_name")
    .eq("session_id", sessionId)
    .single();
  return data?.taxpayer_name ?? "";
}
