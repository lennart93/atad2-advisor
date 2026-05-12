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

// ----- Phase runners (implemented in Tasks 6 and 7) -----

async function runPhaseA(_client: SupabaseClient, _chartId: string, _sessionId: string): Promise<void> {
  throw new Error("runPhaseA not yet implemented");
}

async function runPhaseB(_client: SupabaseClient, _chartId: string, _sessionId: string): Promise<void> {
  throw new Error("runPhaseB not yet implemented");
}
