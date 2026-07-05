import { serve } from "std/http/server.ts";
import type { SupabaseClient } from "supabase";
import { createServiceClient, verifyJwtAndSessionOwnership } from "./verifyAuth.ts";
import { callClaude, extractJson } from "./claude.ts";
import { AppendixModelOutput, type AppendixModelOutputT } from "./schemas.ts";
import { FactsModelOutput } from "./factsSchemas.ts";
import { loadDocumentsBlock } from "./documentsLoader.ts";
import { retrieveKb } from "./kbRetrieval.ts";
import { SKELETON_ROWS, type ServerSkeletonRow } from "./skeletonRows.ts";
import { mootNaRowIds } from "./mootness.ts";
import { loadAppendixPrompt, loadPrompt } from "./promptsLoader.ts";
import {
  buildEntityRegister,
  countActingTogetherCandidates,
  taxpayerDisplayName,
  type RawEntity, type RawEdge, type RawGroup, type AppendixFacts, type FactEntity, type ActingLikelihood,
  type Narrative, type NarrativeKey,
} from "./factsBuild.ts";

const VALID_LIKELIHOODS = ["highly_unlikely", "unlikely", "unclear", "likely", "highly_likely"] as const;

/**
 * Replace the em/en dashes the model still emits despite the prompt with a comma.
 * Regular hyphens (co-investment, equity-and-loan) are U+002D and left untouched.
 */
const REASONING_BOILERPLATE = new RegExp("^based on (?:the )?(?:currently )?(?:available|provided) (?:information|documents|documentation|inputs|facts)[,:]?\\s*", "i");
function stripBoilerplate(s: string | null): string | null {
  if (!s) return s;
  const trimmed = s.trim();
  const out = trimmed.replace(REASONING_BOILERPLATE, "");
  if (!out || out === trimmed) return trimmed;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function noDashes(s: string | null | undefined): string | null {
  if (s == null) return null;
  return s
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .trim();
}

/**
 * Sanitize the model's per-row sources (prompt v5) for storage: only the two
 * model-fillable kinds, a non-empty name, dash-free copy, and at most four
 * entries. This is the REAL filter; the zod schema is deliberately loose (bad
 * entries come through as null or off-vocabulary strings) so a source slip can
 * never fail a whole section's parse. Derived rows are NOT the model's job;
 * the frontend derives them from the live mootness set so they track advisor
 * status edits.
 */
function sanitizeSources(
  raw: Array<{ kind: string; name: string; note?: string | null } | null> | null | undefined,
): Array<{ kind: "on_file" | "missing"; name: string; note: string | null }> {
  const out: Array<{ kind: "on_file" | "missing"; name: string; note: string | null }> = [];
  for (const s of raw ?? []) {
    if (out.length >= 4) break;
    if (!s || (s.kind !== "on_file" && s.kind !== "missing")) continue;
    const name = noDashes(s.name)?.trim() ?? "";
    if (!name) continue;
    const note = noDashes(s.note ?? null)?.trim() || null;
    out.push({ kind: s.kind, name, note });
  }
  return out;
}

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
    // Free-text explanations the advisor gave with the answers: factual evidence
    // the facts pass may rely on (e.g. how an entity is treated locally). The
    // enum answers themselves stay out of Part A so the facts stay reusable.
    const evidenceNotes = answers
      .filter((a) => a.explanation && a.explanation.trim())
      .map((a) => `- (Q${a.question_id}) ${a.explanation!.trim()}`)
      .join("\n");
    const answersBlock = answers
      .map((a) => `Q${a.question_id} answer: ${a.answer}${a.explanation ? `\n  Explanation: ${a.explanation}` : ""}`)
      .join("\n");

    // Part A — deterministic entity register, then ask the model to propose the
    // classification matrix, transactions and acting-together clusters. Built
    // before the article swarm so the articles can later be grounded on it.
    // Part A is derived from the documents + structure chart + grounded knowledge
    // base, NOT the questionnaire answers. So on a refine pass (second run, after
    // the answers) we reuse the stored facts when the structure + documents
    // fingerprint is unchanged, skipping the sequential Claude call entirely.
    const rawChart = await loadChartRaw(c, sessionId);
    const factEntities = buildEntityRegister(rawChart.entities, rawChart.edges, rawChart.groups, session?.taxpayer_name ?? null);
    const { data: priorRow } = await c
      .from("atad2_appendix").select("facts, facts_input_hash").eq("id", appendixId).maybeSingle();
    const priorFacts = (priorRow?.facts as AppendixFacts | null) ?? null;
    const factsHash = await computeFactsInputHash(c, sessionId, rawChart, session ?? null, evidenceNotes);
    const canReuseFacts = factEntities.length > 0
      && priorFacts !== null
      && Array.isArray(priorFacts.entities)
      && priorFacts.entities.length > 0
      && priorRow?.facts_input_hash === factsHash
      // Recompute a stored Part A whose acting-together came back empty while two
      // or more parents/direct shareholders remain to assess, UNLESS that empty
      // result was already settled by a successful pass (actingTogetherSettled).
      // A legacy/failed empty still recomputes; a trusted empty is reused so the
      // appendix is not regenerated on every revisit.
      && !((priorFacts.actingTogether?.length ?? 0) === 0
        && countActingTogetherCandidates(priorFacts.entities) >= 2
        && priorFacts.actingTogetherSettled !== true);
    let factsToStore: AppendixFacts | null;
    let factsHashToStore: string | null;
    if (!factEntities.length) {
      factsToStore = null;
      factsHashToStore = null;
    } else if (canReuseFacts) {
      factsToStore = priorFacts;
      factsHashToStore = factsHash;
      console.log(JSON.stringify({ level: "info", event: "appendix_facts_reused", appendixId }));
    } else {
      const built = await buildFacts(c, sessionId, factEntities, session ?? null, structureBlock, evidenceNotes);
      factsToStore = mergeFacts(priorFacts, built.facts);
      // Carry the "acting-together settled" marker through the merge so a trusted
      // empty stays reusable on the next run (see canReuseFacts above).
      if (factsToStore && built.facts.actingTogetherSettled) factsToStore.actingTogetherSettled = true;
      // Only fingerprint a COMPLETE Part A. A degraded fallback (the Claude/KB
      // call failed and left classifications/acting-together empty) must not be
      // cached, otherwise the refine would reuse it and never retry the model.
      factsHashToStore = built.complete ? factsHash : null;
    }
    const factsBlock = buildFactsBlock(factsToStore);

    // Fill everything except the per-section skeleton, then swarm: one parallel
    // Claude call per section so the whole appendix comes back fast (wall-clock
    // is the slowest single section, not the sum of all rows).
    // DOCUMENTS_LIST is metadata only (labels, not contents): it grounds the
    // per-row source names in prompt v5; a v4 prompt has no placeholder and the
    // replace is a no-op.
    const documentsList = await loadDocumentsList(c, sessionId);
    const baseFilled = prompt.systemPrompt
      .replace("{{TAXPAYER_NAME}}", taxpayerDisplayName(session?.taxpayer_name))
      .replace("{{FISCAL_YEAR}}", session?.fiscal_year ?? "")
      .replace("{{SESSION_ID}}", sessionId)
      .replace("{{FACTS_BLOCK}}", factsBlock)
      .replace("{{ANSWERS_BLOCK}}", answersBlock || "(no answers recorded)")
      .replace("{{STRUCTURE_BLOCK}}", structureBlock || "(no structure chart available)")
      .replace("{{EVIDENCE_NOTES}}", evidenceNotes || "(none)")
      .replace("{{DOCUMENTS_LIST}}", documentsList || "(no documents on file)");

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
      const reasoning = stripBoilerplate(noDashes(m?.reasoning)) ?? "The model did not return a grounded answer for this row; confirm manually.";
      const provenance = m?.provenance ?? "";
      const sources = sanitizeSources(m?.sources);
      return {
        rowId: sk.rowId,
        aiStatus: status, aiReasoning: reasoning, aiProvenance: provenance,
        status, reasoning, provenance, sources,
        excludedFromClient: false,
        source: "ai", stale: false, staleReason: null, editedBy: null, editedAt: null,
      };
    });

    // Deterministic N/A backstop: force scope-gate-satisfied and moot rows to
    // "N/A" regardless of what the model returned, so a moot condition never
    // reads "Insufficient information" or a bare "Not triggered". Evaluated on
    // the fresh AI statuses; advisor edits are re-applied by the merge below.
    // Only applied where the row actually allows "N/A" (guards a not-yet-migrated
    // skeleton from receiving an out-of-vocabulary status).
    const naRowIds = mootNaRowIds(stored);
    const allowsNa = new Set(rows.filter((r) => r.allowedStates.includes("N/A")).map((r) => r.rowId));
    const normalized = stored.map((r) =>
      naRowIds.has(r.rowId) && allowsNa.has(r.rowId) ? { ...r, status: "N/A", aiStatus: "N/A" } : r,
    );

    // merge: preserve any pre-existing edited rows (regeneration)
    const { data: existing } = await c.from("atad2_appendix").select("rows").eq("id", appendixId).maybeSingle();
    const existingRows = (existing?.rows ?? []) as Array<Record<string, unknown>>;
    const existingById = new Map(existingRows.map((r) => [r.rowId as string, r]));
    const merged = normalized.map((fresh) => {
      const prev = existingById.get(fresh.rowId);
      // Exclusion is a scope flag, preserved across regeneration regardless of source.
      const excludedFromClient = (prev?.excludedFromClient as boolean | undefined) ?? false;
      if (!prev || prev.source === "ai") return { ...fresh, excludedFromClient };
      // Sources and the provenance trail are AI evidence, like aiProvenance:
      // refresh them on an edited row too (provenance is never advisor-editable,
      // so nothing is overwritten), so the source panel shows one generation's
      // evidence instead of fresh documents next to a stale internal trail.
      return { ...prev, aiStatus: fresh.aiStatus, aiReasoning: fresh.aiReasoning, aiProvenance: fresh.aiProvenance, provenance: fresh.provenance, sources: fresh.sources };
    });

    await c.from("atad2_appendix").update({
      rows: merged, facts: factsToStore, facts_input_hash: factsHashToStore,
      generation_status: "ready",
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

/**
 * Metadata-only list of the session documents (labels + categories + relevance
 * notes, never the contents): grounds the per-row source names in prompt v5
 * without inflating the Part B swarm calls. Best-effort; an error just means
 * the model gets "(no documents on file)" and emits no on_file sources.
 */
async function loadDocumentsList(c: SupabaseClient, sessionId: string): Promise<string> {
  const { data: docs, error } = await c
    .from("atad2_session_documents")
    .select("doc_label, category, relevance_note")
    .eq("session_id", sessionId);
  if (error || !docs) return "";
  return docs
    .map((d) => `- ${d.doc_label} [${d.category}]${d.relevance_note ? `: ${d.relevance_note}` : ""}`)
    .join("\n");
}

async function loadStructureBlock(c: SupabaseClient, sessionId: string): Promise<string> {
  const { entities, edges } = await loadChartRaw(c, sessionId);
  if (!entities.length) return "";
  const e = entities.map((x) => `- ${x.name} [${x.entity_type}, ${x.jurisdiction_iso}${x.is_taxpayer ? ", taxpayer" : ""}]`).join("\n");
  const o = edges.map((x) => `- ${x.from_entity_id} -> ${x.to_entity_id} (${x.ownership_pct ?? "?"}%, ${x.kind})`).join("\n");
  return `Entities:\n${e}\nEdges:\n${o}`;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function factsPromptVersion(c: SupabaseClient): Promise<number> {
  const { data } = await c
    .from("atad2_prompts").select("version").eq("key", "appendix_facts_system").eq("is_active", true).maybeSingle();
  return (data?.version as number | undefined) ?? 0;
}

/**
 * Fingerprint of everything Part A depends on (structure chart + documents +
 * prompt version), NOT the questionnaire answers. The refine pass reuses the
 * stored Part A facts whenever this hash is unchanged, so only Part B re-runs.
 */
async function computeFactsInputHash(
  c: SupabaseClient,
  sessionId: string,
  raw: { entities: RawEntity[]; edges: Array<RawEdge & { kind: string | null }>; groups: RawGroup[] },
  session: { taxpayer_name?: string | null; fiscal_year?: string | null } | null,
  evidenceNotes: string,
): Promise<string> {
  const ents = raw.entities.map((e) => `${e.id}|${e.name}|${e.entity_type}|${e.jurisdiction_iso}|${e.is_taxpayer}`).sort();
  const edges = raw.edges.map((e) => `${e.from_entity_id}->${e.to_entity_id}|${e.ownership_pct}|${e.kind}`).sort();
  const groups = raw.groups.map((g) => `${g.id}|${g.kind}|${g.label}|${[...(g.member_ids ?? [])].sort().join(",")}`).sort();
  const { data: docs } = await c
    .from("atad2_session_documents")
    .select("id, doc_label, category, storage_path, relevance_note").eq("session_id", sessionId);
  const docMeta = (docs ?? []).map((d) => `${d.id}|${d.doc_label}|${d.category}|${d.storage_path}|${d.relevance_note ?? ""}`).sort();
  // Grounded-literature fingerprint: the curated KB shapes the NL classification
  // and acting-together output, and it is mutable (ingest.mjs deletes + reinserts
  // every kb=atad2 row). Folding its id set in busts the cache on any re-ingest.
  const { data: kb } = await c.from("documents").select("id").eq("metadata->>kb", "atad2");
  const kbIds = (kb ?? []).map((r) => String((r as { id: unknown }).id)).sort();
  const pv = await factsPromptVersion(c);
  return sha256Hex(JSON.stringify({
    ents, edges, groups, docMeta, kbIds, evidenceNotes,
    fy: session?.fiscal_year ?? "", name: session?.taxpayer_name ?? "", pv,
  }));
}

/** Build Part A: deterministic entities are passed in; the model proposes the rest. */
async function buildFacts(
  c: SupabaseClient,
  sessionId: string,
  entities: FactEntity[],
  session: { taxpayer_name?: string | null; fiscal_year?: string | null } | null,
  structureBlock: string,
  evidenceNotes: string,
): Promise<{ facts: AppendixFacts; complete: boolean }> {
  const base: AppendixFacts = { entities, actingTogether: [], classifications: [], transactions: [] };
  if (!entities.length) return { facts: base, complete: false };
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
      .replace("{{TAXPAYER_NAME}}", taxpayerDisplayName(session?.taxpayer_name))
      .replace("{{FISCAL_YEAR}}", session?.fiscal_year ?? "")
      .replace("{{DOCUMENTS_BLOCK}}", docsBlock || "(no documents)")
      .replace("{{ENTITY_REGISTER}}", registerJson)
      .replace("{{KB_BLOCK}}", kbBlock || "(no knowledge base hits)")
      .replace("{{STRUCTURE_BLOCK}}", structureBlock || "(no structure chart available)")
      .replace("{{EVIDENCE_NOTES}}", evidenceNotes || "(none)");
    // One retry, like the Part B sections: a single malformed model response must
    // not collapse the whole facts proposal to the empty base.
    const proposed = await (async () => {
      try {
        return FactsModelOutput.parse(JSON.parse(extractJson((await callClaude({ user })).text)));
      } catch (first) {
        console.warn(JSON.stringify({ level: "warn", event: "appendix_facts_retry", message: String(first).slice(0, 200) }));
        try {
          return FactsModelOutput.parse(JSON.parse(extractJson((await callClaude({ user })).text)));
        } catch {
          throw first;
        }
      }
    })();
    const nl = proposed.nlTaxStatusByEntityId ?? {};
    // Fiscal unity from the documents: flag the AI-identified members as part of the
    // same NL taxpayer as E1. Skip entirely when an explicit fiscal-unity grouping is
    // already drawn (that path collapses into a synthetic E1 instead).
    const hasExplicitFu = entities.some((e) => e.isFiscalUnity || e.memberOfUnityId);
    const fuMembers = new Set((proposed.fiscalUnityMemberEntityIds ?? []).filter((id) => id !== "E1"));
    const positions = proposed.positionByEntityId ?? {};
    const jurById = new Map(entities.map((e) => [e.id, e.jurisdiction]));
    const statusReasons = proposed.nlTaxStatusReasonByEntityId ?? {};
    const shareholders = new Set((proposed.taxpayerShareholderEntityIds ?? []).filter((id) => id !== "E1"));
    const facts: AppendixFacts = {
      entities: entities.map((e) => {
        const aiPosition = e.role === "Group entity" ? noDashes(positions[e.id]) ?? null : null;
        const aiStatusReason = noDashes(statusReasons[e.id]) ?? null;
        const isShareholder = e.role === "Group entity" && !e.memberOfUnityId && shareholders.has(e.id);
        const next = {
          ...e,
          nlTaxStatus: nl[e.id] ?? e.nlTaxStatus,
          ...(aiPosition ? { position: aiPosition } : {}),
          ...(aiStatusReason ? { nlTaxStatusReason: aiStatusReason } : {}),
          ...(isShareholder ? { shareholderOfTaxpayer: true } : {}),
        };
        if (!hasExplicitFu && e.id !== "E1" && fuMembers.has(e.id)) {
          // Inside the taxpayer's fiscal unity: part of the same taxpayer, so not a
          // separate related party (mirrors how explicit FE members are treated).
          return { ...next, inTaxpayerFiscalUnity: true, related: false };
        }
        return next;
      }),
      classifications: proposed.classifications.filter((cl) => !!cl.entityId).map((cl) => ({
        entityId: cl.entityId as string,
        homeState: cl.homeState ?? "",
        homeClass: cl.homeClass ?? "",
        sourceState: cl.sourceState ?? null,
        sourceClass: cl.sourceClass ?? null,
        hybrid: cl.hybrid ?? false,
        status: "proposed" as const, excludedFromClient: false, source: "ai" as const,
      })),
      transactions: proposed.transactions.filter((t) => !!t.fromEntityId && !!t.toEntityId).map((t, i) => {
        // Hard funnel rule, never left to the model: a transaction between two
        // entities in the SAME jurisdiction is domestic and cannot be relevant
        // for ATAD2 (no cross-border qualification difference is possible on
        // it). The advisor can still flip it manually; that flip survives.
        const fromJur = jurById.get(t.fromEntityId as string) ?? null;
        const toJur = jurById.get(t.toEntityId as string) ?? null;
        const domestic = !!fromJur && !!toJur && fromJur === toJur;
        const aiRelevant = t.relevant ?? true;
        const relevant = domestic ? false : aiRelevant;
        const relevanceReason = domestic && aiRelevant
          ? `Domestic transaction between two ${fromJur} entities; ATAD2 requires a cross-border element.`
          : (noDashes(t.relevanceReason) ?? null);
        return {
          id: `T${i + 1}`,
          fromEntityId: t.fromEntityId as string,
          toEntityId: t.toEntityId as string,
          kind: t.kind ?? "",
          instrument: t.instrument ?? null,
          note: noDashes(t.note),
          articlesTested: t.articlesTested ?? [],
          relevant,
          relevanceReason,
          status: "proposed" as const, excludedFromClient: false, source: "ai" as const,
        };
      }),
      // Every plausible acting-together grouping the model proposed (2+ members),
      // each with its own likelihood + reasoning. A >25% parent does not crowd the
      // section out: other shareholders can still form a group, on their own or
      // together with that parent.
      actingTogether: proposed.actingTogether.filter((a) => a.memberEntityIds.length >= 2).map((a, i) => {
        const likelihood = (a.likelihood && VALID_LIKELIHOODS.includes(a.likelihood as typeof VALID_LIKELIHOODS[number]) ? a.likelihood : "unclear") as ActingLikelihood;
        const r = a.rationales ?? {};
        const rationales: Partial<Record<ActingLikelihood, string>> = {};
        for (const k of VALID_LIKELIHOODS) {
          const text = noDashes(r[k]);
          if (text) rationales[k] = text;
        }
        const reasoning = rationales[likelihood] ?? noDashes(a.reasoning) ?? "";
        return {
          id: `A${i + 1}`,
          memberEntityIds: a.memberEntityIds,
          combinedPct: a.combinedPct ?? null,
          likelihood,
          reasoning,
          ...(Object.keys(rationales).length ? { rationales } : {}),
          excludedFromClient: false,
          source: "ai" as const,
        };
      }),
      narratives: (() => {
        const src = proposed.narratives ?? {};
        const out: Partial<Record<NarrativeKey, Narrative>> = {};
        for (const k of ["register", "related", "flows", "classification"] as const) {
          const text = src[k];
          if (typeof text === "string" && text.trim()) out[k] = { text: text.trim(), source: "ai" };
        }
        return Object.keys(out).length ? out : undefined;
      })(),
    };
    // Reaching here means the facts model call SUCCEEDED. Its acting-together
    // result is settled and trustworthy, even when empty: mark it so the Part A
    // is cached (a real facts_input_hash is written) and not recomputed on every
    // revisit. Only the failure path below stays incomplete, so a genuine
    // model/KB failure still retries. An advisor who expects a group can force a
    // fresh pass with the "Re-check relationships" action on the Facts page.
    facts.actingTogetherSettled = true;
    return { facts, complete: true };
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", event: "appendix_facts_failed", message: String(err).slice(0, 300) }));
    return { facts: base, complete: false };
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
  // Key on parties + kind. An edited flow keeps its whole prev object (assessment
  // included) when its key still matches a fresh flow, which is the case for every
  // assessment-only edit (characteristics / rationale / status override leave
  // parties + kind untouched). Editing the parties or the type changes the key, so
  // that particular edit may not survive a later regeneration; the assessment model
  // is designed so the substantive work does not depend on those descriptive fields.
  const txKey = (t: { fromEntityId: string; toEntityId: string; kind: string }) => `${t.fromEntityId}|${t.toEntityId}|${t.kind}`;
  const exTx = new Map(existing.transactions.map((t) => [txKey(t), t]));
  const transactions = fresh.transactions.map((f) => {
    const prev = exTx.get(txKey(f));
    if (prev && (prev.status === "confirmed" || prev.source === "edited")) return prev;
    return { ...f, excludedFromClient: prev?.excludedFromClient ?? false };
  });
  // Once the advisor edited the acting-together assessment (level, text or the
  // membership itself), it is theirs: keep it wholesale. Membership edits change
  // the member-set key, so key-based matching would silently drop them.
  const advisorOwnsAt = existing.actingTogether.some((a) => a.source === "edited");
  const atKey = (a: { memberEntityIds: string[] }) => [...a.memberEntityIds].sort().join("|");
  const exAt = new Map(existing.actingTogether.map((a) => [atKey(a), a]));
  const freshAtByKey = new Map(fresh.actingTogether.map((f) => [atKey(f), f]));
  const actingTogether = advisorOwnsAt
    ? existing.actingTogether.map((p) => {
      // Graft fresh per-level texts onto a kept cluster that predates them, as
      // long as the member set still matches (texts describe that exact set).
      if (p.rationales) return p;
      const freshMatch = freshAtByKey.get(atKey(p));
      return freshMatch?.rationales ? { ...p, rationales: freshMatch.rationales } : p;
    })
    : fresh.actingTogether.map((f) => {
      const prev = exAt.get(atKey(f));
      return { ...f, excludedFromClient: prev?.excludedFromClient ?? false };
    });
  // An edited sentence survives; the rest refreshes from the new AI output.
  const exNarr = existing.narratives ?? {};
  const narratives: AppendixFacts["narratives"] = { ...fresh.narratives };
  for (const k of ["register", "related", "flows", "classification"] as const) {
    const prev = exNarr[k];
    if (prev?.source === "edited") narratives[k] = prev;
  }
  // Hand-added (manual) entities have no chart counterpart, so the deterministic
  // rebuild above drops them. Carry them over, re-numbering to a fresh id past the
  // highest chart id so they never collide, and remap anything that referenced the
  // old id (its classification, and any kept acting-together membership).
  const manual = existing.entities.filter((e) => e.manual);
  let outEntities = entities;
  let outClassifications = classifications;
  let outActingTogether = actingTogether;
  if (manual.length) {
    let maxN = 0;
    for (const e of entities) {
      const m = /^E(\d+)$/.exec(e.id);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    const remap = new Map<string, string>();
    const carried = manual.map((e) => {
      const newId = `E${++maxN}`;
      if (newId !== e.id) remap.set(e.id, newId);
      return { ...e, id: newId };
    });
    const remapId = (id: string) => remap.get(id) ?? id;
    const manualIds = new Set(manual.map((e) => e.id));
    const carriedCls = existing.classifications
      .filter((c) => manualIds.has(c.entityId))
      .map((c) => ({ ...c, entityId: remapId(c.entityId) }));
    outEntities = [...entities, ...carried];
    outClassifications = [...classifications, ...carriedCls];
    outActingTogether = actingTogether.map((a) => ({
      ...a,
      memberEntityIds: a.memberEntityIds.map(remapId),
    }));
  }
  // Section-level exclusions are an advisor scope decision; carry them across regen.
  return renumberFacts({
    entities: outEntities,
    classifications: outClassifications,
    transactions,
    actingTogether: outActingTogether,
    excludedSections: existing.excludedSections,
    narratives: Object.keys(narratives).length ? narratives : undefined,
  });
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
  const effRole = (e: FactEntity) => e.edits?.relationType ?? e.role;
  // Explicit-clear semantics: relatedPct: null means "no percentage", it must
  // not fall back to the chart value (mirror of frontend effRelatedPct).
  const effPct = (e: FactEntity) =>
    e.edits?.relatedPct !== undefined ? e.edits.relatedPct : e.ownershipPct;
  const nlQual = (s: string | null | undefined) =>
    s === "transparent" ? "transparent for NL"
      : (s === "resident" || s === "nonresident_pe" || s === "outside_cit" || s === "non_transparent") ? "non-transparent for NL"
      : s === "reverse_hybrid" ? "reverse hybrid for NL"
      : "NL qualification undetermined";
  const taxpayerName = entities.find((e) => e.id === "E1")?.name ?? "the taxpayer";
  const relNote = (e: FactEntity) =>
    e.inTaxpayerFiscalUnity ? `, fiscal unity with ${taxpayerName}`
      : (e.related && e.relatedVia) ? `, related via ${nameOf(e.relatedVia)} (${e.relatedViaPct ?? "?"}%)`
      : e.related ? ", related (>25%)" : "";
  const ents = entities
    .map((e) => `${e.id} ${e.name} [${effJur(e) ?? "?"}, ${effRole(e)}${effPct(e) != null ? `, ${effPct(e)}%` : ""}${relNote(e)}, ${nlQual(effStatus(e))}]`)
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

/** Keep T#/A# labels contiguous after a merge; spread keeps excludedSections/narratives. */
function renumberFacts(f: AppendixFacts): AppendixFacts {
  return {
    ...f,
    transactions: f.transactions.map((t, i) => ({ ...t, id: `T${i + 1}` })),
    actingTogether: f.actingTogether.map((a, i) => ({ ...a, id: `A${i + 1}` })),
  };
}
