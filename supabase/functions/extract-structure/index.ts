import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import {
  Stage1Output,
  Stage2Output,
  type Stage1OutputT,
  type Stage2OutputT,
} from "./schemas.ts";
import { loadDocumentsBlock } from "./documentsLoader.ts";
import { formatQaBlock } from "./formatters.ts";
import { loadEffectiveAnswers } from "../_shared/effectiveAnswersDb.ts";
import { answersFingerprint } from "../_shared/effectiveAnswers.ts";
import { isStaleExtracting } from "./staleness.ts";
import { loadStructurePrompts, type LoadedStructurePrompts } from "./promptsLoader.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Phase = "docs_only" | "refine";

interface ExtractStructureRequest {
  session_id: string;
  phase?: Phase;
}

/**
 * Insert one AI-extracted entity, tolerating the (chart_id, lower(name)) UNIQUE
 * index. If a concurrent extract-structure pipeline already inserted the same
 * entity, Postgres raises 23505; treat that as "already there" and return the
 * winning row's id so the temp_id still maps to a real UUID (its ownership edges
 * survive). See migration 20260703120000_structure_entities_dedupe_unique.sql.
 */
async function insertEntityDedup(
  client: SupabaseClient,
  chartId: string,
  e: Stage1OutputT["entities"][number],
): Promise<string> {
  const { data, error } = await client
    .from("atad2_structure_entities")
    .insert({
      chart_id: chartId,
      name: e.name,
      legal_form: e.legal_form ?? null,
      jurisdiction_iso: e.jurisdiction_iso ? e.jurisdiction_iso.toUpperCase() : null,
      entity_type: e.entity_type,
      is_taxpayer: e.is_taxpayer,
      source: "ai_extracted",
    })
    .select("id")
    .single();
  if (!error && data) return data.id as string;
  if ((error as { code?: string } | null)?.code === "23505") {
    // A concurrent run won the insert. Re-select its row by case-insensitive name
    // so this temp_id still resolves to a real UUID and its edges are kept.
    const pattern = e.name.replace(/([\\%_])/g, "\\$1"); // escape ilike metachars
    const { data: existing, error: selErr } = await client
      .from("atad2_structure_entities")
      .select("id")
      .eq("chart_id", chartId)
      .ilike("name", pattern)
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing) return existing.id as string;
  }
  throw error;
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

    const phase: Phase = body.phase === "docs_only" ? "docs_only" : "refine";

    const serviceClient = createServiceClient();
    const userId = await verifyJwtAndSessionOwnership(authHeader, body.session_id, serviceClient);
    if (!userId) return json({ error: "Forbidden" }, 403);

    const chart = await ensureChart(serviceClient, body.session_id);

    if (chart.status && chart.status.startsWith("extracting:")) {
      if (isStaleExtracting(chart.status, chart.heartbeat_at, new Date())) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "pipeline_takeover_stale",
          chart_id: chart.id,
          prior_status: chart.status,
          heartbeat_at: chart.heartbeat_at,
        }));
        // Fall through: the setStatus call below resets status + warnings
        // and writes a fresh heartbeat, so the new pipeline takes over cleanly.
      } else {
        return json(
          { reason: "already_running", chart_id: chart.id, status: chart.status },
          409,
        );
      }
    }

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
      // Self-chain into Phase B when answers already exist (user finished
      // Questions faster than Phase A completed). Same isolate, same
      // EdgeRuntime.waitUntil budget — no second HTTP hop.
      if (await hasQaAnswers(serviceClient, sessionId)) {
        console.log(JSON.stringify({
          level: "info",
          event: "phase_a_self_chain_to_b",
          chart_id: chartId,
        }));
        await runPhaseB(serviceClient, chartId, sessionId);
      }
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
    .select("id, status, heartbeat_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing) {
    return existing as { id: string; status: string | null; heartbeat_at: string | null };
  }
  const { data, error } = await client
    .from("atad2_structure_charts")
    .insert({ session_id: sessionId })
    .select("id, status, heartbeat_at")
    .single();
  if (error) throw error;
  return data as { id: string; status: string | null; heartbeat_at: string | null };
}

async function setStatus(
  client: SupabaseClient,
  chartId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const { error } = await client
    .from("atad2_structure_charts")
    .update({ status, heartbeat_at: new Date().toISOString(), ...extra })
    .eq("id", chartId);
  if (error) throw error;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Start a background ticker that bumps heartbeat_at every HEARTBEAT_INTERVAL_MS.
 * Returns a stop function. Caller MUST call stop() in a finally block to avoid
 * leaking the interval past the pipeline's lifetime.
 *
 * Errors during the heartbeat update are logged but never thrown — a single
 * failed bump should not crash the pipeline.
 */
function startHeartbeat(client: SupabaseClient, chartId: string): () => void {
  const timer = setInterval(async () => {
    try {
      await client
        .from("atad2_structure_charts")
        .update({ heartbeat_at: new Date().toISOString() })
        .eq("id", chartId);
    } catch (err) {
      console.warn(JSON.stringify({
        level: "warn", event: "heartbeat_update_failed",
        message: String(err), chart_id: chartId,
      }));
    }
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
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

async function loadQaAnswersText(
  client: SupabaseClient,
  sessionId: string,
): Promise<{ qaText: string; fingerprint: string }> {
  // Effective answers: the recorded answer where the question is answered,
  // otherwise the prefill suggestion. This is what makes the refine pass able
  // to run speculatively while the user is still in the questionnaire. The
  // explanation free-text is where users typically write entity names,
  // transaction details, and classification rationale.
  const rows = await loadEffectiveAnswers(client, sessionId);
  const qaText = formatQaBlock(rows.map((r) => ({
    question_id: r.question_id,
    question_text: r.question_text ?? "",
    answer: r.answer,
    explanation: r.explanation,
  })));
  return { qaText, fingerprint: await answersFingerprint(rows) };
}

async function loadTaxpayerName(client: SupabaseClient, sessionId: string): Promise<string> {
  const { data } = await client
    .from("atad2_sessions")
    .select("taxpayer_name")
    .eq("session_id", sessionId)
    .single();
  return data?.taxpayer_name ?? "";
}

// Deliberately REAL answers only: self-chaining B on half-filled suggestions
// right after Phase A would double the model runs; the speculative start is
// the frontend's job (useSpeculativeRefine).
async function hasQaAnswers(client: SupabaseClient, sessionId: string): Promise<boolean> {
  const { count } = await client
    .from("atad2_answers")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  return (count ?? 0) > 0;
}

// ----- Stage runners (shared by Phase A and Phase B) -----

async function runStage1Initial(
  prompts: LoadedStructurePrompts,
  cachedSystem: string,
  taxpayerName: string,
): Promise<Stage1OutputT> {
  const user = prompts.stage1_initial.replace("{{TAXPAYER_NAME}}", taxpayerName);
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage1Output);
}

async function runStage1Refine(
  prompts: LoadedStructurePrompts,
  cachedSystem: string,
  taxpayerName: string,
  existingEntities: Stage1OutputT["entities"],
): Promise<Stage1OutputT> {
  const user = prompts.stage1_refine
    .replace("{{TAXPAYER_NAME}}", taxpayerName)
    .replace("{{EXISTING_ENTITIES_JSON}}", JSON.stringify(existingEntities, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage1Output);
}

async function runStage2Initial(
  prompts: LoadedStructurePrompts,
  cachedSystem: string,
  entities: unknown,
): Promise<Stage2OutputT> {
  const user = prompts.stage2_initial.replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage2Output);
}

async function runStage2Refine(
  prompts: LoadedStructurePrompts,
  cachedSystem: string,
  entities: unknown,
  existingOwnership: Stage2OutputT["ownership_edges"],
): Promise<Stage2OutputT> {
  const user = prompts.stage2_refine
    .replace("{{ENTITIES_JSON}}", JSON.stringify(entities, null, 2))
    .replace("{{EXISTING_OWNERSHIP_JSON}}", JSON.stringify(existingOwnership, null, 2));
  return await callWithRetry(() => callClaude({ cachedSystem, user }), Stage2Output);
}

// ----- Phase runners (implemented in Tasks 6 and 7) -----

// Legal-suffix normalisation, mirror of src/lib/legalName.ts, used to match the
// session's declared taxpayer name against extracted entity names.
const SUFFIX_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/\bB\.\s*V\.?/g, "BV"],
  [/\bN\.\s*V\.?/g, "NV"],
  [/\bC\.\s*V\.?/g, "CV"],
  [/\bV\.\s*O\.\s*F\.?/g, "VOF"],
  [/\bS\.\s*à\s*r\.?\s*l\.?/gi, "Sàrl"],
  [/\bS\.\s*A\.\s*R\.\s*L\.?/g, "SARL"],
  [/\bL\.\s*L\.\s*C\.?/g, "LLC"],
  [/\bL\.\s*P\.?/g, "LP"],
  [/\bG\.\s*m\.\s*b\.\s*H\.?/g, "GmbH"],
  [/\bL\.\s*t\.\s*d\.?/g, "Ltd"],
  [/\bLtd\./g, "Ltd"],
  [/\bInc\./g, "Inc"],
  [/\bp\.\s*l\.\s*c\.?/gi, "plc"],
  [/\bS\.\s*A\.(?!\s*R)/g, "SA"],
  [/\bA\.\s*G\./g, "AG"],
];

function normalizeEntityName(name: string | null | undefined): string {
  let s = String(name ?? "").trim();
  for (const [re, rep] of SUFFIX_REPLACEMENTS) s = s.replace(re, rep);
  return s.replace(/\s{2,}/g, " ").trim();
}

// One assessment can name several entities that are the subject together; the
// list is stored newline-joined in taxpayer_name. Mirror of parseTaxpayerNames in
// src/lib/taxpayer.ts (Deno cannot import from src/).
function parseTaxpayerNames(stored?: string | null): string[] {
  if (!stored) return [];
  return stored.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Guarantee the chart carries the declared taxpayer(s). The extractor sets
 * is_taxpayer as a model boolean per entity and the grounding rule can drop the flag
 * when a legal name is not literally in the documents. The intake names are ground
 * truth for who the subject is.
 *
 * Single named entity (the default): unchanged legacy backstop. Only when the model
 * flagged nothing, flag the one entity whose name matches (suffix-normalised,
 * case-insensitive) so Part A does not collapse to empty; otherwise trust the model.
 *
 * Several named entities (a deliberate multi-entity intake): flag every extracted
 * entity that matches a named entity, additively, so all named subjects appear
 * together as the taxpayer regardless of which ones the model happened to flag.
 */
async function ensureTaxpayersFlagged(
  client: SupabaseClient,
  chartId: string,
  taxpayerName: string | null,
): Promise<void> {
  const names = parseTaxpayerNames(taxpayerName);
  if (!names.length) return;
  const { data: ents } = await client
    .from("atad2_structure_entities")
    .select("id, name, is_taxpayer")
    .eq("chart_id", chartId);
  if (!ents || ents.length === 0) return;

  const hints = new Set(names.map((n) => normalizeEntityName(n).toLowerCase()).filter(Boolean));
  if (!hints.size) return;
  const matches = ents.filter((e) => hints.has(normalizeEntityName(e.name as string).toLowerCase()));

  // Single-entity: defer to the model unless it flagged nothing.
  if (names.length <= 1) {
    if (ents.some((e) => e.is_taxpayer)) return;
    const match = matches[0];
    if (!match) return;
    await client.from("atad2_structure_entities").update({ is_taxpayer: true }).eq("id", match.id);
    console.log(JSON.stringify({
      level: "info", event: "taxpayer_flag_backstopped",
      chart_id: chartId, entity_id: match.id,
    }));
    return;
  }

  // Multi-entity: the named list is authoritative; flag each named match not
  // already flagged.
  const toFlag = matches.filter((e) => !e.is_taxpayer);
  if (!toFlag.length) return;
  for (const m of toFlag) {
    await client.from("atad2_structure_entities").update({ is_taxpayer: true }).eq("id", m.id);
  }
  console.log(JSON.stringify({
    level: "info", event: "taxpayers_flagged_from_intake",
    chart_id: chartId, entity_ids: toFlag.map((m) => m.id), named: names.length,
  }));
}

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
  const stopHeartbeat = startHeartbeat(serviceClient, chartId);
  try {
    // Phase A uses documents only — Q&A may not yet exist.
    const prompts = await loadStructurePrompts(serviceClient);
    const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
    const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
    // One assessment can name several entities. The prompt gets a readable list so
    // the model flags each; the backstop below uses the raw newline-joined value.
    const taxpayerDisplay = parseTaxpayerNames(taxpayerName).join(", ") || taxpayerName;
    const cachedSystem = `<documents>\n${docsBlock}\n</documents>`;

    // Idempotency: clear any prior ai_extracted rows for this chart so a
    // re-trigger (e.g. user re-uploaded docs) doesn't accumulate stale entities.
    await clearAiExtracted(serviceClient, chartId);

    // ----- Stage 1: entities -----
    let stage1: Stage1OutputT;
    try {
      stage1 = await runStage1Initial(prompts, cachedSystem, taxpayerDisplay);
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
      tempIdToUuid.set(e.temp_id, await insertEntityDedup(serviceClient, chartId, e));
    }

    // ----- Stage 2: ownership (graceful) -----
    await setStatus(serviceClient, chartId, "extracting:stage2");
    try {
      const stage2 = await runStage2Initial(prompts, cachedSystem, stage1.entities);
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

    await ensureTaxpayersFlagged(serviceClient, chartId, taxpayerName);
    await setStatus(serviceClient, chartId, "phase_a_ready");
  } finally {
    stopHeartbeat();
  }
}

async function runPhaseB(
  serviceClient: SupabaseClient,
  chartId: string,
  sessionId: string,
): Promise<void> {
  const stopHeartbeat = startHeartbeat(serviceClient, chartId);
  try {
    const prompts = await loadStructurePrompts(serviceClient);
    const docsBlock = await loadDocumentsBlock(serviceClient, sessionId);
    const { qaText, fingerprint: answersFp } = await loadQaAnswersText(serviceClient, sessionId);
    const taxpayerName = await loadTaxpayerName(serviceClient, sessionId);
    const taxpayerDisplay = parseTaxpayerNames(taxpayerName).join(", ") || taxpayerName;
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
        stage1 = await runStage1Refine(prompts, cachedSystem, taxpayerDisplay, existingAi.entities);
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
        stage1 = await runStage1Initial(prompts, cachedSystem, taxpayerDisplay);
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
        tempIdToUuid.set(e.temp_id, await insertEntityDedup(serviceClient, chartId, e));
      }
    }

    // ----- Stage 2 -----
    let stage2: Stage2OutputT = { ownership_edges: [] };
    if (hasExisting) {
      try {
        stage2 = await runStage2Refine(prompts, cachedSystem, stage1.entities, existingAi.ownershipEdges);
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
        stage2 = await runStage2Initial(prompts, cachedSystem, stage1.entities);
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

    await ensureTaxpayersFlagged(serviceClient, chartId, taxpayerName);
    const finalPatch = {
      status: "draft_ready",
      draft_extracted_at: new Date().toISOString(),
    };
    const { error: finalUpdateErr } = await serviceClient
      .from("atad2_structure_charts")
      .update({ ...finalPatch, answers_fingerprint: answersFp })
      .eq("id", chartId);
    if (finalUpdateErr) {
      // answers_fingerprint column may not exist yet (migration not applied).
      // Fall back without it so the run still lands.
      console.warn(JSON.stringify({
        level: "warn", event: "fingerprint_write_failed",
        message: String(finalUpdateErr.message), chart_id: chartId,
      }));
      const { error: legacyErr } = await serviceClient
        .from("atad2_structure_charts").update(finalPatch).eq("id", chartId);
      if (legacyErr) throw legacyErr;
    }
  } finally {
    stopHeartbeat();
  }
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
      jurisdiction_iso: (r.jurisdiction_iso ?? null) as string | null,
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
          jurisdiction_iso: e.jurisdiction_iso ? e.jurisdiction_iso.toUpperCase() : null,
          entity_type: e.entity_type,
          is_taxpayer: e.is_taxpayer,
        })
        .eq("id", existingUuid);
      if (error) throw error;
      outMap.set(e.temp_id, existingUuid);
    } else {
      outMap.set(e.temp_id, await insertEntityDedup(client, chartId, e));
    }
  }

  return outMap;
}
