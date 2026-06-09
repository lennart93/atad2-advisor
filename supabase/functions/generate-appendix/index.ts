import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import { AppendixModelOutput, type AppendixModelOutputT } from "./schemas.ts";
import { FactsModelOutput } from "./factsSchemas.ts";
import { loadDocumentsBlock } from "./documentsLoader.ts";
import { retrieveKb } from "./kbRetrieval.ts";
import { SKELETON_ROWS, type ServerSkeletonRow } from "./skeletonRows.ts";
import { loadAppendixPrompt, loadPrompt } from "./promptsLoader.ts";
import {
  buildEntityRegister,
  type RawEntity, type RawEdge, type RawGroup, type AppendixFacts, type FactEntity, type ActingLikelihood,
} from "./factsBuild.ts";

const VALID_LIKELIHOODS = ["highly_unlikely", "unlikely", "unclear", "likely", "highly_likely"] as const;

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

    // Load the legal-framework rows from the DB (falls back to the static seed).
    const allRows = await loadSkeletonRows(c);
    // Which rows render (1bis only if Q2=Yes)
    const rows = allRows.filter((r) => {
      if (!r.renderIfQuestionEquals) return true;
      return answersByQ.get(r.renderIfQuestionEquals.questionId)?.answer === r.renderIfQuestionEquals.equals;
    });

    const structureBlock = await loadStructureBlock(c, sessionId);
    const answersBlock = answers
      .map((a) => `Q${a.question_id} answer: ${a.answer}${a.explanation ? `\n  Explanation: ${a.explanation}` : ""}`)
      .join("\n");

    // Part A — deterministic entity register, then ask the model to propose the
    // classification matrix, transactions and acting-together clusters. Built
    // before the article swarm so the articles can later be grounded on it.
    const rawChart = await loadChartRaw(c, sessionId);
    const factEntities = buildEntityRegister(rawChart.entities, rawChart.edges, rawChart.groups);
    const factsFresh = await buildFacts(c, sessionId, factEntities, session ?? null, answersBlock, structureBlock);
    const { data: priorFacts } = await c.from("atad2_appendix").select("facts").eq("id", appendixId).maybeSingle();
    const factsToStore = factEntities.length
      ? mergeFacts((priorFacts?.facts as AppendixFacts | null) ?? null, factsFresh)
      : null;
    const factsBlock = buildFactsBlock(factsToStore);

    // Fill everything except the per-section skeleton, then swarm: one parallel
    // Claude call per section so the whole appendix comes back fast (wall-clock
    // is the slowest single section, not the sum of all rows).
    const baseFilled = prompt.systemPrompt
      .replace("{{TAXPAYER_NAME}}", session?.taxpayer_name ?? "")
      .replace("{{FISCAL_YEAR}}", session?.fiscal_year ?? "")
      .replace("{{SESSION_ID}}", sessionId)
      .replace("{{FACTS_BLOCK}}", factsBlock)
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
      const skeletonJson = JSON.stringify(secRows.map((r) => ({ rowId: r.rowId, legalBasis: r.legalBasis, conditionTested: r.conditionTested, allowedStates: r.allowedStates })));
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
      const statusRaw = m?.status ?? "Insufficient information";
      const status = sk.allowedStates.includes(statusRaw) ? statusRaw : "Insufficient information";
      const reasoning = m?.reasoning ?? "The model did not return a grounded answer for this row; confirm manually.";
      const provenance = m?.provenance ?? "";
      return {
        rowId: sk.rowId,
        aiStatus: status, aiReasoning: reasoning, aiProvenance: provenance,
        status, reasoning, provenance,
        excludedFromClient: false,
        source: "ai", stale: false, staleReason: null, editedBy: null, editedAt: null,
      };
    });

    // merge: preserve any pre-existing edited rows (regeneration)
    const { data: existing } = await c.from("atad2_appendix").select("rows").eq("id", appendixId).maybeSingle();
    const existingRows = (existing?.rows ?? []) as Array<Record<string, unknown>>;
    const existingById = new Map(existingRows.map((r) => [r.rowId as string, r]));
    const merged = stored.map((fresh) => {
      const prev = existingById.get(fresh.rowId);
      // Exclusion is a scope flag, preserved across regeneration regardless of source.
      const excludedFromClient = (prev?.excludedFromClient as boolean | undefined) ?? false;
      if (!prev || prev.source === "ai") return { ...fresh, excludedFromClient };
      return { ...prev, aiStatus: fresh.aiStatus, aiReasoning: fresh.aiReasoning, aiProvenance: fresh.aiProvenance };
    });

    await c.from("atad2_appendix").update({
      rows: merged, facts: factsToStore, generation_status: "ready",
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

async function loadSkeletonRows(c: SupabaseClient): Promise<ServerSkeletonRow[]> {
  const { data, error } = await c
    .from("atad2_appendix_skeleton")
    .select("row_id, legal_basis, condition_tested, allowed_states, render_if")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data || data.length === 0) return SKELETON_ROWS;
  return data.map((r) => ({
    rowId: r.row_id as string,
    legalBasis: r.legal_basis as string,
    conditionTested: r.condition_tested as string,
    allowedStates: (Array.isArray(r.allowed_states) ? r.allowed_states : []) as string[],
    drivenByQuestionIds: [],
    renderIfQuestionEquals: (r.render_if as ServerSkeletonRow["renderIfQuestionEquals"]) ?? undefined,
  }));
}

async function loadChartRaw(
  c: SupabaseClient,
  sessionId: string,
): Promise<{ entities: RawEntity[]; edges: Array<RawEdge & { kind: string | null }>; groups: RawGroup[] }> {
  const { data: chart } = await c.from("atad2_structure_charts").select("id").eq("session_id", sessionId).maybeSingle();
  if (!chart?.id) return { entities: [], edges: [], groups: [] };
  const { data: ents } = await c
    .from("atad2_structure_entities")
    .select("id, name, entity_type, jurisdiction_iso, is_taxpayer").eq("chart_id", chart.id);
  const { data: edges } = await c
    .from("atad2_structure_edges")
    .select("from_entity_id, to_entity_id, ownership_pct, kind").eq("chart_id", chart.id);
  const { data: groups } = await c
    .from("atad2_structure_groupings")
    .select("id, kind, label, member_ids").eq("chart_id", chart.id);
  return {
    entities: (ents ?? []) as RawEntity[],
    edges: (edges ?? []) as Array<RawEdge & { kind: string | null }>,
    groups: (groups ?? []) as RawGroup[],
  };
}

async function loadStructureBlock(c: SupabaseClient, sessionId: string): Promise<string> {
  const { entities, edges } = await loadChartRaw(c, sessionId);
  if (!entities.length) return "";
  const e = entities.map((x) => `- ${x.name} [${x.entity_type}, ${x.jurisdiction_iso}${x.is_taxpayer ? ", taxpayer" : ""}]`).join("\n");
  const o = edges.map((x) => `- ${x.from_entity_id} -> ${x.to_entity_id} (${x.ownership_pct ?? "?"}%, ${x.kind})`).join("\n");
  return `Entities:\n${e}\nEdges:\n${o}`;
}

/** Build Part A: deterministic entities are passed in; the model proposes the rest. */
async function buildFacts(
  c: SupabaseClient,
  sessionId: string,
  entities: FactEntity[],
  session: { taxpayer_name?: string | null; fiscal_year?: string | null } | null,
  answersBlock: string,
  structureBlock: string,
): Promise<AppendixFacts> {
  const base: AppendixFacts = { entities, actingTogether: [], classifications: [], transactions: [] };
  if (!entities.length) return base;
  try {
    const fp = await loadPrompt(c, "appendix_facts_system");
    const docsBlock = await loadDocumentsBlock(c, sessionId);
    const registerJson = JSON.stringify(entities.map((e) => ({
      id: e.id, name: e.name, jurisdiction: e.jurisdiction, entityType: e.entityType,
      role: e.role, ownershipPct: e.ownershipPct, related: e.related,
    })));

    // Grounded literature: retrieve samenwerkende-groep doctrine + NL rechtsvorm
    // classification from the curated knowledge base (best-effort, may be empty).
    const formList = entities
      .map((e) => `${e.name} (${e.jurisdiction ?? "?"}, ${e.entityType ?? "?"})`)
      .join("; ");
    const fy = session?.fiscal_year ?? "";
    const queries = [
      { category: "samenwerkende_groep" as const, k: 6, query: `Wanneer vormen de aandeelhouders of investeerders een samenwerkende groep (acting together) voor de hybridemismatchtoets, gelet op deze structuur? ${structureBlock}` },
      { category: "rechtsvorm_classificatie" as const, k: 4, query: `Fiscale kwalificatie naar Nederlandse maatstaven (transparant of niet-transparant), toestemmingsvereiste en Wet FKR in boekjaar ${fy} voor deze entiteiten: ${formList}` },
    ];
    // One focused list lookup per distinct jurisdiction, so each country's
    // indicative-classification chunk is reliably retrieved (a single blended
    // query lets semantically similar LP jurisdictions crowd each other out).
    const distinctJur = [...new Set(entities.map((e) => e.jurisdiction).filter(Boolean))];
    for (const j of distinctJur) {
      const namesInJ = entities.filter((e) => e.jurisdiction === j).map((e) => e.name).join(", ");
      queries.push({ category: "rechtsvorm_lijst" as const, k: 3, query: `Indicatieve NL-kwalificatie (transparant / niet-transparant / CV-achtige) van rechtsvormen in ${j} voor boekjaar ${fy}. Betrokken entiteiten: ${namesInJ}` });
    }
    const kbBlock = await retrieveKb(c, queries);

    const user = fp.systemPrompt
      .replace("{{TAXPAYER_NAME}}", session?.taxpayer_name ?? "")
      .replace("{{FISCAL_YEAR}}", session?.fiscal_year ?? "")
      .replace("{{DOCUMENTS_BLOCK}}", docsBlock || "(no documents)")
      .replace("{{ENTITY_REGISTER}}", registerJson)
      .replace("{{KB_BLOCK}}", kbBlock || "(no knowledge base hits)")
      .replace("{{ANSWERS_BLOCK}}", answersBlock || "(no answers recorded)")
      .replace("{{STRUCTURE_BLOCK}}", structureBlock || "(no structure chart available)");
    const proposed = FactsModelOutput.parse(JSON.parse(extractJson((await callClaude({ user })).text)));
    const nl = proposed.nlTaxStatusByEntityId ?? {};
    return {
      entities: entities.map((e) => ({ ...e, nlTaxStatus: nl[e.id] ?? e.nlTaxStatus })),
      classifications: proposed.classifications.map((cl) => ({
        entityId: cl.entityId,
        homeState: cl.homeState ?? "",
        homeClass: cl.homeClass ?? "",
        sourceState: cl.sourceState ?? null,
        sourceClass: cl.sourceClass ?? null,
        hybrid: cl.hybrid ?? false,
        status: "proposed" as const, excludedFromClient: false, source: "ai" as const,
      })),
      transactions: proposed.transactions.map((t, i) => ({
        id: `T${i + 1}`,
        fromEntityId: t.fromEntityId,
        toEntityId: t.toEntityId,
        kind: t.kind ?? "",
        instrument: t.instrument ?? null,
        note: t.note ?? null,
        articlesTested: t.articlesTested ?? [],
        status: "proposed" as const, excludedFromClient: false, source: "ai" as const,
      })),
      actingTogether: proposed.actingTogether.map((a, i) => {
        const aiLikelihood = (a.likelihood && VALID_LIKELIHOODS.includes(a.likelihood as typeof VALID_LIKELIHOODS[number]) ? a.likelihood : "unclear") as ActingLikelihood;
        const r = a.rationales ?? {};
        const fallback = "No specific assessment for this level.";
        const rationales: Record<ActingLikelihood, string> = {
          highly_unlikely: r.highly_unlikely ?? fallback,
          unlikely: r.unlikely ?? fallback,
          unclear: r.unclear ?? fallback,
          likely: r.likely ?? fallback,
          highly_likely: r.highly_likely ?? fallback,
        };
        return {
          id: `A${i + 1}`,
          memberEntityIds: a.memberEntityIds,
          combinedPct: a.combinedPct ?? null,
          likelihood: aiLikelihood,
          aiLikelihood,
          rationales,
          reasoning: rationales[aiLikelihood],
          excludedFromClient: false,
          source: "ai" as const,
        };
      }),
    };
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", event: "appendix_facts_failed", message: String(err).slice(0, 300) }));
    return base;
  }
}

/** On regenerate, keep advisor decisions (confirmed/dismissed/edited/excluded); refresh the rest. */
function mergeFacts(existing: AppendixFacts | null, fresh: AppendixFacts): AppendixFacts {
  if (!existing) return renumberFacts(fresh);
  // The register is rebuilt deterministically each run; re-apply the advisor's
  // hidden flag and field edits (keyed by chart entity id) so "mark irrelevant"
  // and the editable jurisdiction/type/NL-status survive regeneration.
  const exHidden = new Set(existing.entities.filter((e) => e.hidden).map((e) => e.chartEntityId));
  const exEdits = new Map(existing.entities.filter((e) => e.edits).map((e) => [e.chartEntityId, e.edits]));
  const entities = fresh.entities.map((e) => {
    let out = e;
    if (exHidden.has(e.chartEntityId)) out = { ...out, hidden: true };
    const edits = exEdits.get(e.chartEntityId);
    if (edits) out = { ...out, edits };
    return out;
  });
  const exCls = new Map(existing.classifications.map((c) => [c.entityId, c]));
  const classifications = fresh.classifications.map((f) => {
    const prev = exCls.get(f.entityId);
    if (prev && (prev.status === "confirmed" || prev.source === "edited")) return prev;
    return { ...f, excludedFromClient: prev?.excludedFromClient ?? false };
  });
  const txKey = (t: { fromEntityId: string; toEntityId: string; kind: string }) => `${t.fromEntityId}|${t.toEntityId}|${t.kind}`;
  const exTx = new Map(existing.transactions.map((t) => [txKey(t), t]));
  const transactions = fresh.transactions.map((f) => {
    const prev = exTx.get(txKey(f));
    if (prev && (prev.status === "confirmed" || prev.source === "edited")) return prev;
    return { ...f, excludedFromClient: prev?.excludedFromClient ?? false };
  });
  const atKey = (a: { memberEntityIds: string[] }) => [...a.memberEntityIds].sort().join("|");
  const exAt = new Map(existing.actingTogether.map((a) => [atKey(a), a]));
  const actingTogether = fresh.actingTogether.map((f) => {
    const prev = exAt.get(atKey(f));
    if (prev && prev.source === "edited") {
      return { ...f, likelihood: prev.likelihood, reasoning: prev.reasoning, excludedFromClient: prev.excludedFromClient, source: "edited" as const };
    }
    return { ...f, excludedFromClient: prev?.excludedFromClient ?? false };
  });
  return renumberFacts({ entities, classifications, transactions, actingTogether });
}

/** Compact text summary of Part A, fed to the article generation as grounding. */
function buildFactsBlock(facts: AppendixFacts | null): string {
  if (!facts || !facts.entities.length) return "(no established facts)";
  // Advisor-hidden entities are not shown to the client; keep them out of the
  // article grounding too, cascading to anything that references them.
  const hidden = new Set(facts.entities.filter((e) => e.hidden).map((e) => e.id));
  const entities = facts.entities.filter((e) => !e.hidden);
  if (!entities.length) return "(no established facts)";
  const classifications = facts.classifications.filter((c) => !hidden.has(c.entityId));
  const transactions = facts.transactions.filter((t) => !hidden.has(t.fromEntityId) && !hidden.has(t.toEntityId));
  const acting = facts.actingTogether.filter((a) => !a.memberEntityIds.some((id) => hidden.has(id)));
  const nameOf = (id: string) => entities.find((e) => e.id === id)?.name ?? id;
  // Advisor edits win over the chart/AI base for grounding too.
  const effJur = (e: FactEntity) => e.edits?.jurisdiction ?? e.jurisdiction;
  const effStatus = (e: FactEntity) => e.edits?.nlTaxStatus ?? e.nlTaxStatus;
  const nlQual = (s: string | null | undefined) =>
    s === "transparent" ? "transparent for NL"
      : (s === "resident" || s === "nonresident_pe" || s === "outside_cit") ? "non-transparent for NL"
      : "NL qualification undetermined";
  const ents = entities
    .map((e) => `${e.id} ${e.name} [${effJur(e) ?? "?"}, ${e.role}${e.ownershipPct != null ? `, ${e.ownershipPct}%` : ""}, ${nlQual(effStatus(e))}]`)
    .join("\n");
  const cls = classifications
    .map((c) => `${c.entityId} ${nameOf(c.entityId)}: home ${c.homeState} ${c.homeClass} vs source ${c.sourceState ?? "?"} ${c.sourceClass ?? "?"}${c.hybrid ? " (HYBRID mismatch)" : ""}`)
    .join("\n");
  const tx = transactions
    .map((t) => `${t.id} ${nameOf(t.fromEntityId)} -> ${nameOf(t.toEntityId)}: ${t.kind}${t.instrument ? ` (${t.instrument})` : ""} [${t.articlesTested.join(", ")}]`)
    .join("\n");
  const at = acting
    .map((a) => `${a.memberEntityIds.map(nameOf).join(" + ")} ~ ${a.combinedPct ?? "?"}%: ${a.likelihood} - ${a.reasoning}`)
    .join("\n");
  return [
    `Entities (with NL classification):\n${ents}`,
    cls ? `Cross-border classification (home vs source):\n${cls}` : "",
    tx ? `Intra-group transactions:\n${tx}` : "",
    at ? `Possible acting-together groups:\n${at}` : "",
  ].filter(Boolean).join("\n\n");
}

/** Keep T#/A# labels contiguous after a merge. */
function renumberFacts(f: AppendixFacts): AppendixFacts {
  return {
    entities: f.entities,
    classifications: f.classifications,
    transactions: f.transactions.map((t, i) => ({ ...t, id: `T${i + 1}` })),
    actingTogether: f.actingTogether.map((a, i) => ({ ...a, id: `A${i + 1}` })),
  };
}
