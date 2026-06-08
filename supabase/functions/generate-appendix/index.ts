import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import { AppendixModelOutput, type AppendixModelOutputT } from "./schemas.ts";
import { SKELETON_ROWS, type ServerSkeletonRow } from "./skeletonRows.ts";
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

  const { id: appendixId, created } = await ensureAppendix(service, body.session_id);

  // Only skip when a PRE-EXISTING run is genuinely still in progress. A freshly
  // created row is always 'generating' with a fresh timestamp, so without the
  // `created` guard the very first request would short-circuit here and never
  // start the background work (the row would stay 'generating' forever).
  if (!created) {
    const { data: cur } = await service
      .from("atad2_appendix").select("generation_status, updated_at").eq("id", appendixId).maybeSingle();
    if (cur?.generation_status === "generating" && isFresh(cur.updated_at as string | null)) {
      return json({ ok: true, appendix_id: appendixId, status: "generating" }, 200);
    }
  }

  await setGenStatus(service, appendixId, "generating", { error_message: null });

  const work = runGeneration(service, appendixId, body.session_id);
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(work);
  else void work.catch((e) => console.error(JSON.stringify({ level: "error", event: "appendix_bg", message: String(e), appendixId })));

  return json({ ok: true, appendix_id: appendixId, status: "generating" }, 200);
});

async function ensureAppendix(c: SupabaseClient, sessionId: string): Promise<{ id: string; created: boolean }> {
  const { data } = await c.from("atad2_appendix").select("id").eq("session_id", sessionId).maybeSingle();
  if (data?.id) return { id: data.id as string, created: false };
  const { data: ins, error } = await c
    .from("atad2_appendix")
    .insert({ session_id: sessionId, generation_status: "generating", review_status: "draft", rows: [] })
    .select("id").single();
  if (error) {
    // Concurrent-insert race: another request created the row. Treat as existing.
    const { data: again } = await c.from("atad2_appendix").select("id").eq("session_id", sessionId).maybeSingle();
    if (again?.id) return { id: again.id as string, created: false };
    throw error;
  }
  return { id: ins.id as string, created: true };
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

    // Fill everything except the per-section skeleton, then swarm: one parallel
    // Claude call per section so the whole appendix comes back fast (wall-clock
    // is the slowest single section, not the sum of all rows).
    const baseFilled = prompt.systemPrompt
      .replace("{{TAXPAYER_NAME}}", session?.taxpayer_name ?? "")
      .replace("{{FISCAL_YEAR}}", session?.fiscal_year ?? "")
      .replace("{{SESSION_ID}}", sessionId)
      .replace("{{ANSWERS_BLOCK}}", answersBlock || "(no answers recorded)")
      .replace("{{STRUCTURE_BLOCK}}", structureBlock || "(no structure chart available)");

    const sectionOf = (rowId: string) => rowId.slice(0, rowId.lastIndexOf("."));
    const sectionGroups = new Map<string, ServerSkeletonRow[]>();
    for (const r of rows) {
      const key = sectionOf(r.rowId);
      const arr = sectionGroups.get(key) ?? [];
      arr.push(r);
      sectionGroups.set(key, arr);
    }

    const perSection = await Promise.all([...sectionGroups.values()].map(async (secRows) => {
      const skeletonJson = JSON.stringify(secRows.map((r) => ({ rowId: r.rowId, legalFramework: r.legalFramework, allowedStates: r.allowedStates })));
      const user = baseFilled.replace("{{SKELETON_ROWS}}", skeletonJson);
      try {
        const parsed = await callWithRetry(() => callClaude({ user }));
        return parsed.rows;
      } catch (err) {
        console.warn(JSON.stringify({ level: "warn", event: "appendix_section_failed", message: String(err).slice(0, 300) }));
        return [] as AppendixModelOutputT["rows"];
      }
    }));

    const byId = new Map(perSection.flat().map((r) => [r.rowId, r]));
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
