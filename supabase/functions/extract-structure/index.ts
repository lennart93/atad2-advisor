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
import stage1InitialPrompt from "./prompts/stage1-initial.ts";
import stage1RefinePrompt from "./prompts/stage1-refine.ts";
import stage2InitialPrompt from "./prompts/stage2-initial.ts";
import stage2RefinePrompt from "./prompts/stage2-refine.ts";
import stage3Prompt from "./prompts/stage3-transactions.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Phase = "docs_only" | "refine_and_transactions";

interface ExtractStructureRequest {
  session_id: string;
  phase?: Phase;
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

    const phase: Phase = body.phase === "docs_only" ? "docs_only" : "refine_and_transactions";

    const serviceClient = createServiceClient();
    const userId = await verifyJwtAndSessionOwnership(authHeader, body.session_id, serviceClient);
    if (!userId) return json({ error: "Forbidden" }, 403);

    const chart = await ensureChart(serviceClient, body.session_id);

    await setStatus(serviceClient, chart.id, "extracting:stage1", { warnings: [] });

    // Kick off the extraction in the background and return immediately.
    // The frontend polls atad2_structure_charts.status to track progress.
    // EdgeRuntime.waitUntil keeps the worker alive past the response.
    const work = runExtractionPipeline(serviceClient, chart.id, body.session_id, phase);
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

    return json({ ok: true, chart_id: chart.id, status: "extracting:stage1", phase }, 200);
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
 * Dispatches to the appropriate phase runner. Always resolves;
 * failures are logged and reflected in atad2_structure_charts.status / .warnings.
 */
async function runExtractionPipeline(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
  phase: Phase,
): Promise<void> {
  try {
    if (phase === "docs_only") {
      await runPhaseA(serviceClient, chartId, sessionId);
    } else {
      await runPhaseB(serviceClient, chartId, sessionId);
    }
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      event: "pipeline_unhandled",
      message: String(err),
      chart_id: chartId,
      phase,
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

// ----- Stage runners (shared by Phase A and Phase B) -----

async function runStage1Initial(cachedSystem: string, taxpayerName: string): Promise<Stage1OutputT> {
  const user = stage1InitialPrompt.replace("{{TAXPAYER_NAME}}", taxpayerName);
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage1Output);
}

async function runStage1Refine(
  cachedSystem: string,
  taxpayerName: string,
  existingEntities: Stage1OutputT["entities"],
): Promise<Stage1OutputT> {
  const user = stage1RefinePrompt
    .replace("{{TAXPAYER_NAME}}", taxpayerName)
    .replace("{{EXISTING_ENTITIES_JSON}}", JSON.stringify(existingEntities, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage1Output);
}

async function runStage2Initial(cachedSystem: string, entities: unknown): Promise<Stage2OutputT> {
  const user = stage2InitialPrompt.replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage2Output);
}

async function runStage2Refine(
  cachedSystem: string,
  entities: unknown,
  existingOwnership: Stage2OutputT["ownership_edges"],
): Promise<Stage2OutputT> {
  const user = stage2RefinePrompt
    .replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2))
    .replace("{{EXISTING_OWNERSHIP_JSON}}", JSON.stringify(existingOwnership, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage2Output);
}

async function runStage3(cachedSystem: string, entities: unknown, ownership: unknown) {
  const user = stage3Prompt
    .replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2))
    .replace("{{OWNERSHIP_JSON}}", JSON.stringify(ownership, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage3Output);
}

// ----- Phase runners (implemented in Tasks 6 and 7) -----

async function clearAiExtracted(client: SupabaseClient, chartId: string): Promise<void> {
  // Edges first to satisfy FK from edges -> entities.
  const { error: edgesDelErr } = await client
    .from("atad2_structure_edges")
    .delete()
    .eq("chart_id", chartId)
    .eq("source", "ai_extracted");
  if (edgesDelErr) throw edgesDelErr;
  const { error: entsDelErr } = await client
    .from("atad2_structure_entities")
    .delete()
    .eq("chart_id", chartId)
    .eq("source", "ai_extracted");
  if (entsDelErr) throw entsDelErr;
}

async function runPhaseA(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  // Phase A uses documents only — Q&A may not yet exist.
  const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
  const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
  const cachedSystem = `<documents>\n${docsBlock}\n</documents>`;

  // Idempotency: clear any prior ai_extracted rows for this chart so a
  // re-trigger (e.g. user re-uploaded docs) doesn't accumulate stale entities.
  await clearAiExtracted(serviceClient, chartId);

  // ----- Stage 1: entities -----
  let stage1: Stage1OutputT;
  try {
    stage1 = await runStage1Initial(cachedSystem, taxpayerName);
  } catch (err) {
    console.error(JSON.stringify({
      level: "error", event: "phaseA_stage1_failed",
      message: String(err), chart_id: chartId,
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

  // ----- Stage 2: ownership (graceful) -----
  await setStatus(serviceClient, chartId, "extracting:stage2");
  try {
    const stage2 = await runStage2Initial(cachedSystem, stage1.entities);
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
      level: "warn", event: "phaseA_stage2_failed",
      message: String(err), chart_id: chartId,
    }));
    await appendWarning(serviceClient, chartId, {
      stage: 2, message: String(err).slice(0, 500),
    });
  }

  await setStatus(serviceClient, chartId, "phase_a_ready");
}

async function runPhaseB(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
  const qaText = await loadQaAnswersText(serviceClient, sessionId);
  const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
  const cachedSystem =
    `<documents>\n${docsBlock}\n</documents>\n` +
    `<qa_answers>\n${qaText}\n</qa_answers>`;

  // Decide: refine path (Phase A wrote AI rows we can build on) or
  // initial-fallback (no AI rows, run from scratch).
  const existingAi = await loadExistingAiRows(serviceClient, chartId);
  const hasExisting = existingAi.entities.length > 0;

  // ----- Stage 1 -----
  let stage1: Stage1OutputT;
  let tempIdToUuid: Map<string, string>;
  if (hasExisting) {
    // Refine path. The `existingAi.entities` already carries assigned temp_ids
    // (ent_1..ent_N) that map back to DB UUIDs via existingAi.tempIdToUuid.
    await setStatus(serviceClient, chartId, "extracting:refining");
    try {
      stage1 = await runStage1Refine(cachedSystem, taxpayerName, existingAi.entities);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error", event: "phaseB_stage1_refine_failed",
        message: String(err), chart_id: chartId,
      }));
      await setStatus(serviceClient, chartId, "extraction_failed", {
        warnings: [{ stage: 1, message: String(err).slice(0, 500) }],
      });
      return;
    }
    tempIdToUuid = await applyEntityDiff(serviceClient, chartId, existingAi.tempIdToUuid, stage1.entities);
  } else {
    // Initial-fallback path.
    await setStatus(serviceClient, chartId, "extracting:stage1");
    await clearAiExtracted(serviceClient, chartId);
    try {
      stage1 = await runStage1Initial(cachedSystem, taxpayerName);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error", event: "phaseB_stage1_initial_failed",
        message: String(err), chart_id: chartId,
      }));
      await setStatus(serviceClient, chartId, "extraction_failed", {
        warnings: [{ stage: 1, message: String(err).slice(0, 500) }],
      });
      return;
    }
    tempIdToUuid = new Map<string, string>();
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
  }

  // ----- Stage 2 -----
  let stage2: Stage2OutputT = { ownership_edges: [] };
  if (hasExisting) {
    try {
      stage2 = await runStage2Refine(cachedSystem, stage1.entities, existingAi.ownershipEdges);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "phaseB_stage2_refine_failed",
        message: String(err), chart_id: chartId,
      }));
      await appendWarning(serviceClient, chartId, {
        stage: 2, message: String(err).slice(0, 500),
      });
    }
  } else {
    await setStatus(serviceClient, chartId, "extracting:stage2");
    try {
      stage2 = await runStage2Initial(cachedSystem, stage1.entities);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "phaseB_stage2_initial_failed",
        message: String(err), chart_id: chartId,
      }));
      await appendWarning(serviceClient, chartId, {
        stage: 2, message: String(err).slice(0, 500),
      });
    }
  }

  // Persist ownership: delete existing ai_extracted ownership edges, insert fresh.
  const { error: ownershipDelErr } = await serviceClient
    .from("atad2_structure_edges")
    .delete()
    .eq("chart_id", chartId)
    .eq("kind", "ownership")
    .eq("source", "ai_extracted");
  if (ownershipDelErr) throw ownershipDelErr;
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

  // ----- Stage 3: transactions (graceful) -----
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
      level: "warn", event: "phaseB_stage3_failed",
      message: String(err), chart_id: chartId,
    }));
    await appendWarning(serviceClient, chartId, {
      stage: 3, message: String(err).slice(0, 500),
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
}

interface ExistingAi {
  entities: Stage1OutputT["entities"];
  ownershipEdges: Stage2OutputT["ownership_edges"];
  tempIdToUuid: Map<string, string>;
}

async function loadExistingAiRows(client: SupabaseClient, chartId: string): Promise<ExistingAi> {
  const { data: entityRows, error: entErr } = await client
    .from("atad2_structure_entities")
    .select("id, name, legal_form, jurisdiction_iso, entity_type, is_taxpayer")
    .eq("chart_id", chartId)
    .eq("source", "ai_extracted")
    .order("name", { ascending: true });
  if (entErr) throw entErr;

  const entities: Stage1OutputT["entities"] = [];
  const tempIdToUuid = new Map<string, string>();
  const uuidToTempId = new Map<string, string>();
  let n = 1;
  for (const r of entityRows ?? []) {
    const temp_id = `ent_${n++}`;
    tempIdToUuid.set(temp_id, r.id as string);
    uuidToTempId.set(r.id as string, temp_id);
    entities.push({
      temp_id,
      name: r.name as string,
      legal_form: (r.legal_form ?? null) as string | null,
      jurisdiction_iso: r.jurisdiction_iso as string,
      entity_type: r.entity_type as Stage1OutputT["entities"][number]["entity_type"],
      is_taxpayer: !!r.is_taxpayer,
    });
  }

  const { data: edgeRows, error: edgeErr } = await client
    .from("atad2_structure_edges")
    .select("from_entity_id, to_entity_id, ownership_pct, ownership_voting_only")
    .eq("chart_id", chartId)
    .eq("kind", "ownership")
    .eq("source", "ai_extracted");
  if (edgeErr) throw edgeErr;

  const ownershipEdges: Stage2OutputT["ownership_edges"] = [];
  for (const e of edgeRows ?? []) {
    const ft = uuidToTempId.get(e.from_entity_id as string);
    const tt = uuidToTempId.get(e.to_entity_id as string);
    if (!ft || !tt) continue;
    ownershipEdges.push({
      from_temp_id: ft,
      to_temp_id: tt,
      ownership_pct: (e.ownership_pct ?? 0) as number,
      voting_only: (e.ownership_voting_only ?? undefined) as boolean | undefined,
    });
  }

  return { entities, ownershipEdges, tempIdToUuid };
}

async function applyEntityDiff(
  client: SupabaseClient,
  chartId: string,
  existingTempIdToUuid: Map<string, string>,
  newEntities: Stage1OutputT["entities"],
): Promise<Map<string, string>> {
  // Strategy: any temp_id in the new list that also exists in existingTempIdToUuid
  // is an UPDATE on that UUID. New temp_ids are INSERTs. Existing temp_ids
  // not present in the new list are DELETEs.
  const newTempIds = new Set(newEntities.map((e) => e.temp_id));
  const outMap = new Map<string, string>();

  // Deletes first. Any edge whose endpoint we're about to delete must go
  // first or the FK from edges -> entities would prevent the entity delete.
  const toDelete: string[] = [];
  for (const [tempId, uuid] of existingTempIdToUuid) {
    if (!newTempIds.has(tempId)) toDelete.push(uuid);
  }
  if (toDelete.length > 0) {
    // Delete edges first to avoid FK violation when an entity disappears.
    const { error: delEdgesErr } = await client
      .from("atad2_structure_edges")
      .delete()
      .eq("chart_id", chartId)
      .eq("source", "ai_extracted")
      .or(toDelete.map((id) => `from_entity_id.eq.${id},to_entity_id.eq.${id}`).join(","));
    if (delEdgesErr) throw delEdgesErr;
    const { error: delEntsErr } = await client
      .from("atad2_structure_entities")
      .delete()
      .eq("chart_id", chartId)
      .in("id", toDelete);
    if (delEntsErr) throw delEntsErr;
  }

  // Updates + inserts.
  for (const e of newEntities) {
    const existingUuid = existingTempIdToUuid.get(e.temp_id);
    if (existingUuid) {
      const { error } = await client
        .from("atad2_structure_entities")
        .update({
          name: e.name,
          legal_form: e.legal_form ?? null,
          jurisdiction_iso: e.jurisdiction_iso.toUpperCase(),
          entity_type: e.entity_type,
          is_taxpayer: e.is_taxpayer,
        })
        .eq("id", existingUuid);
      if (error) throw error;
      outMap.set(e.temp_id, existingUuid);
    } else {
      const { data, error } = await client
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
      outMap.set(e.temp_id, data.id as string);
    }
  }

  return outMap;
}
