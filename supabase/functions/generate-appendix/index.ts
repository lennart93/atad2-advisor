import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import { AppendixModelOutput, type AppendixModelOutputT } from "./schemas.ts";
import { SKELETON_ROWS } from "./skeletonRows.ts";
import { loadAppendixPrompt } from "./promptsLoader.ts";

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

interface Answer { question_id: string; answer: string; explanation: string | null; }

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

  const appendixId = await ensureAppendix(service, body.session_id);

  const { data: cur } = await service
    .from("atad2_appendix").select("generation_status, updated_at").eq("id", appendixId).maybeSingle();
  if (cur?.generation_status === "generating" && isFresh(cur.updated_at as string | null)) {
    return json({ ok: true, appendix_id: appendixId, status: "generating" }, 200);
  }

  await setGenStatus(service, appendixId, "generating", { error_message: null });

  const work = runGeneration(service, appendixId, body.session_id);
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(work);
  else void work.catch((e) => console.error(JSON.stringify({ level: "error", event: "appendix_bg", message: String(e), appendixId })));

  return json({ ok: true, appendix_id: appendixId, status: "generating" }, 200);
});

async function ensureAppendix(c: SupabaseClient, sessionId: string): Promise<string> {
  const { data } = await c.from("atad2_appendix").select("id").eq("session_id", sessionId).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: ins, error } = await c
    .from("atad2_appendix")
    .insert({ session_id: sessionId, generation_status: "generating", review_status: "draft", rows: [] })
    .select("id").single();
  if (error) throw error;
  return ins.id as string;
}

function isFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  return (Date.now() - new Date(updatedAt).getTime()) < 90_000;
}

async function setGenStatus(c: SupabaseClient, id: string, status: string, extra: Record<string, unknown> = {}) {
  const { error } = await c
    .from("atad2_appendix")
    .update({ generation_status: status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id);
  if (error) throw error;
}

async function runGeneration(c: SupabaseClient, appendixId: string, sessionId: string) {
  try {
    const prompt = await loadAppendixPrompt(c);

    const { data: session } = await c
      .from("atad2_sessions").select("taxpayer_name, fiscal_year").eq("session_id", sessionId).maybeSingle();
    const { data: answersRaw } = await c
      .from("atad2_answers").select("question_id, answer, explanation").eq("session_id", sessionId);
    const answers = (answersRaw ?? []) as Answer[];
    const answersByQ = new Map(answers.map((a) => [a.question_id, a]));

    // Which rows render (1bis only if Q2=Yes)
    const rows = SKELETON_ROWS.filter((r) => {
      if (!r.renderIfQuestionEquals) return true;
      return answersByQ.get(r.renderIfQuestionEquals.questionId)?.answer === r.renderIfQuestionEquals.equals;
    });

    const structureBlock = await loadStructureBlock(c, sessionId);
    const answersBlock = answers
      .map((a) => `Q${a.question_id} answer: ${a.answer}${a.explanation ? `\n  Explanation: ${a.explanation}` : ""}`)
      .join("\n");
    const skeletonJson = JSON.stringify(rows.map((r) => ({ rowId: r.rowId, legalFramework: r.legalFramework, allowedStates: r.allowedStates })));

    const user = prompt.systemPrompt
      .replace("{{TAXPAYER_NAME}}", session?.taxpayer_name ?? "")
      .replace("{{FISCAL_YEAR}}", session?.fiscal_year ?? "")
      .replace("{{SESSION_ID}}", sessionId)
      .replace("{{SKELETON_ROWS}}", skeletonJson)
      .replace("{{ANSWERS_BLOCK}}", answersBlock || "(no answers recorded)")
      .replace("{{STRUCTURE_BLOCK}}", structureBlock || "(no structure chart available)");

    const parsed = await callWithRetry(() => callClaude({ user }));

    const byId = new Map(parsed.rows.map((r) => [r.rowId, r]));
    const stored = rows.map((sk) => {
      const m = byId.get(sk.rowId);
      const decisionRaw = m?.decision ?? "Further information needed";
      const decision = sk.allowedStates.includes(decisionRaw) ? decisionRaw : "Further information needed";
      const reasoning = m?.reasoning ?? "The model did not return a grounded answer for this row; confirm manually.";
      const reference = m?.reference ?? "";
      return {
        rowId: sk.rowId,
        aiDecision: decision, aiReasoning: reasoning, aiReference: reference,
        decision, reasoning, reference,
        source: "ai", stale: false, staleReason: null, editedBy: null, editedAt: null,
      };
    });

    // merge: preserve any pre-existing edited rows (regeneration)
    const { data: existing } = await c.from("atad2_appendix").select("rows").eq("id", appendixId).maybeSingle();
    const existingRows = (existing?.rows ?? []) as Array<Record<string, unknown>>;
    const existingById = new Map(existingRows.map((r) => [r.rowId as string, r]));
    const merged = stored.map((fresh) => {
      const prev = existingById.get(fresh.rowId);
      if (!prev || prev.source === "ai") return fresh;
      return { ...prev, aiDecision: fresh.aiDecision, aiReasoning: fresh.aiReasoning, aiReference: fresh.aiReference };
    });

    await c.from("atad2_appendix").update({
      rows: merged, generation_status: "ready",
      model: prompt.model, prompt_version: prompt.version,
      generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", appendixId);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "appendix_generation_failed", message: String(err), appendixId }));
    await setGenStatus(c, appendixId, "error", { error_message: String(err).slice(0, 500) });
  }
}

async function callWithRetry(call: () => Promise<{ text: string }>): Promise<AppendixModelOutputT> {
  try {
    return AppendixModelOutput.parse(JSON.parse(extractJson((await call()).text)));
  } catch (first) {
    try {
      return AppendixModelOutput.parse(JSON.parse(extractJson((await call()).text)));
    } catch {
      throw first;
    }
  }
}

async function loadStructureBlock(c: SupabaseClient, sessionId: string): Promise<string> {
  const { data: chart } = await c.from("atad2_structure_charts").select("id").eq("session_id", sessionId).maybeSingle();
  if (!chart?.id) return "";
  const { data: ents } = await c
    .from("atad2_structure_entities")
    .select("id, name, entity_type, jurisdiction_iso, is_taxpayer").eq("chart_id", chart.id);
  const { data: edges } = await c
    .from("atad2_structure_edges")
    .select("from_entity_id, to_entity_id, ownership_pct, kind").eq("chart_id", chart.id);
  const e = (ents ?? []).map((x) => `- ${x.name} [${x.entity_type}, ${x.jurisdiction_iso}${x.is_taxpayer ? ", taxpayer" : ""}]`).join("\n");
  const o = (edges ?? []).map((x) => `- ${x.from_entity_id} -> ${x.to_entity_id} (${x.ownership_pct ?? "?"}%, ${x.kind})`).join("\n");
  return `Entities:\n${e}\nEdges:\n${o}`;
}
