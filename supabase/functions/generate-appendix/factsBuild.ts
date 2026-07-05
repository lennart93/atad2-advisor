// Deterministic Part A builders, mirror of src/lib/appendix/facts/entityRegister.ts
// (which itself uses src/lib/structure/ownershipGraph.ts). Keep the algorithm
// identical so the frontend fallback and the stored facts agree. Deno cannot import
// from src/, so the ownership-graph walk is inlined below.

export interface RawEntity {
  id: string;
  name: string;
  is_taxpayer: boolean;
  jurisdiction_iso: string | null;
  entity_type: string | null;
}
export interface RawEdge {
  from_entity_id: string;
  to_entity_id: string;
  ownership_pct: number | null;
  kind?: string | null;
}

export interface RawGroup {
  id: string;
  kind: string;
  label: string;
  member_ids: string[];
}

export interface FactEntity {
  id: string;
  chartEntityId: string;
  name: string;
  jurisdiction: string | null;
  entityType: string | null;
  role: "Taxpayer" | "Parent" | "Subsidiary" | "Group entity";
  ownershipPct: number | null;
  related: boolean;
  /** Group entity associated via a common parent: that parent's register id + its effective stake here. */
  relatedVia?: string | null;
  relatedViaPct?: number | null;
  /** Parent/Subsidiary only: one ownership edge away from the taxpayer set (direct) vs via intermediates (indirect). */
  directLink?: boolean;
  /** Group entity only: short AI-written relationship-to-the-taxpayer clause, grounded on the documents. */
  position?: string | null;
  /** AI-derived: holds shares directly in the taxpayer although the chart has no ownership edge. */
  shareholderOfTaxpayer?: boolean;
  nlTaxStatus: string | null;
  /** AI-written, grounded one-liner on how the NL qualification was reached. */
  nlTaxStatusReason?: string | null;
  /** Advisor overrides for the editable register fields; preserved across regeneration (mirror of the frontend FactEntity.edits). */
  edits?: {
    jurisdiction?: string | null;
    entityType?: string | null;
    nlTaxStatus?: string | null;
    relationType?: string | null;
    relatedPct?: number | null;
    relationReason?: string | null;
    nlReason?: string | null;
    localReason?: string | null;
    /** Advisor's explicit membership of the relevant set: 'in' promotes, 'out' demotes. */
    relevanceOverride?: "in" | "out";
    /** Advisor dismissed the inline home-state flag as not relevant for this entity. */
    localNotRelevant?: boolean;
  };
  /** Advisor added this entity by hand (not from the chart); carried across regeneration, deleted (not demoted) on removal. */
  manual?: boolean;
  hidden?: boolean;
  isFiscalUnity?: boolean;
  memberEntityIds?: string[];
  memberOfUnityId?: string;
  /** AI-derived: forms a Dutch fiscal unity with the taxpayer E1 (part of the same NL taxpayer). */
  inTaxpayerFiscalUnity?: boolean;
}

export interface ClassificationItem {
  entityId: string;
  homeState: string;
  homeClass: string;
  sourceState: string | null;
  sourceClass: string | null;
  hybrid: boolean;
  status: "proposed" | "confirmed";
  excludedFromClient: boolean;
  source: "ai" | "edited";
}

export interface TransactionItem {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  kind: string;
  instrument: string | null;
  note: string | null;
  articlesTested: string[];
  relevant?: boolean;
  relevanceReason?: string | null;
  /**
   * Advisor-authored assessment: the five editable characteristics (cross-border,
   * hybrid financial instrument, hybrid entity mismatch, imported mismatch, PE
   * mismatch), a free-text rationale and an optional status override. The AI never
   * writes this; it round-trips through the facts JSONB and is preserved wholesale
   * by mergeFacts on any flow the advisor edited (source === "edited"). Mirror of
   * the frontend TransactionAssessment; no derivation runs on the Deno side.
   */
  assessment?: Record<string, unknown>;
  status: "proposed" | "confirmed";
  excludedFromClient: boolean;
  source: "ai" | "edited";
}

export type ActingLikelihood =
  | "highly_unlikely" | "unlikely" | "unclear" | "likely" | "highly_likely";

export interface ActingTogetherCluster {
  id: string;
  memberEntityIds: string[];
  combinedPct: number | null;
  likelihood: ActingLikelihood;
  reasoning: string;
  /** AI-prepared text per level, so the advisor can switch levels without a new call. */
  rationales?: Partial<Record<ActingLikelihood, string>>;
  excludedFromClient: boolean;
  includeInClient?: boolean;
  /**
   * 'manual' = advisor-built in the group builder (the leading input; only these
   * reach the client). 'ai'/undefined = a non-binding suggestion. The edge
   * function never constructs manual groups, but keeps them verbatim on merge (see
   * mergeFacts: an advisor-owned acting-together set is preserved wholesale), so
   * these fields ride along untouched. Kept in sync with
   * src/lib/appendix/types.ts + src/lib/appendix/facts/actingBasis.ts.
   */
  origin?: "ai" | "manual";
  basis?: "family" | "shareholders_agreement" | "fund_structure" | "coordinated_management" | "other";
  name?: string;
  targetEntityId?: string | null;
  source: "ai" | "edited";
}

export interface Narrative { text: string; source: "ai" | "edited"; }
export type NarrativeKey = "register" | "related" | "flows" | "classification";

export interface AppendixFacts {
  entities: FactEntity[];
  actingTogether: ActingTogetherCluster[];
  classifications: ClassificationItem[];
  transactions: TransactionItem[];
  /** Whole Part A sections the advisor excluded from the client export. */
  excludedSections?: string[];
  /** One connective sentence per funnel section; advisor edits survive regeneration. */
  narratives?: Partial<Record<NarrativeKey, Narrative>>;
  /** True once a successful facts pass settled its acting-together assessment
   * (empty result included), so a cached Part A can be reused on the next run. */
  actingTogetherSettled?: boolean;
}

const RELATED_THRESHOLD = 25;
const FISCAL_UNITY_KIND = "fiscal_unity";

/**
 * The parents and direct shareholders of the taxpayer that an acting-together
 * (samenwerkende groep) assessment weighs: every external Parent, plus any group
 * entity the facts pass flagged as holding shares directly in the taxpayer even
 * without an ownership edge (share counts / shareholder registers). Mirrors the
 * facts prompt's rule that a grouping needs "two or more parents or direct
 * shareholders" to assess: when two or more exist, an empty actingTogether means
 * the pass has not settled yet, not that there is genuinely no group. Advisor-
 * hidden entities do not count. Kept in sync with
 * src/lib/appendix/facts/actingCandidates.ts.
 */
export function countActingTogetherCandidates(entities: FactEntity[]): number {
  return entities.filter(
    (e) => !e.hidden && (e.role === "Parent" || e.shareholderOfTaxpayer === true),
  ).length;
}

// --- Ownership graph (inlined mirror of src/lib/structure/ownershipGraph.ts) -----

interface OwnershipEdgeLite { from: string; to: string; pct: number | null }
interface OwnershipGraph { childrenByOwner: Map<string, OwnershipEdgeLite[]> }

function toOwnershipEdges(edges: RawEdge[]): OwnershipEdgeLite[] {
  return edges
    .filter((e) => (e.kind ?? "ownership") === "ownership")
    .map((e) => ({ from: e.from_entity_id, to: e.to_entity_id, pct: e.ownership_pct ?? null }));
}

function buildOwnershipGraph(edges: OwnershipEdgeLite[]): OwnershipGraph {
  const childrenByOwner = new Map<string, OwnershipEdgeLite[]>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    const list = childrenByOwner.get(e.from) ?? [];
    list.push(e);
    childrenByOwner.set(e.from, list);
  }
  return { childrenByOwner };
}

function reaches(src: string, targets: Set<string>, g: OwnershipGraph): boolean {
  if (targets.has(src)) return false;
  const seen = new Set<string>([src]);
  const stack = [src];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of g.childrenByOwner.get(cur) ?? []) {
      if (targets.has(e.to)) return true;
      if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
  }
  return false;
}

function effectiveFraction(src: string, dst: string, g: OwnershipGraph): number {
  const visiting = new Set<string>();
  const walk = (node: string): number => {
    if (node === dst) return 1;
    if (visiting.has(node)) return 0;
    visiting.add(node);
    let sum = 0;
    for (const e of g.childrenByOwner.get(node) ?? []) {
      if (e.pct == null) continue;
      sum += (e.pct / 100) * walk(e.to);
    }
    visiting.delete(node);
    return sum;
  };
  return walk(src);
}

function roundPct(n: number): number { return Math.round(n * 100) / 100; }

function effectivePctToSet(src: string, targets: Iterable<string>, g: OwnershipGraph): number | null {
  let sum = 0;
  for (const t of targets) sum += effectiveFraction(src, t, g);
  if (sum <= 0) return null;
  return roundPct(Math.min(sum, 1) * 100);
}

function effectivePctFromSet(sources: Iterable<string>, dst: string, g: OwnershipGraph): number | null {
  let sum = 0;
  for (const s of sources) sum += effectiveFraction(s, dst, g);
  if (sum <= 0) return null;
  return roundPct(Math.min(sum, 1) * 100);
}

// --- Entity register -------------------------------------------------------------

interface Pre {
  ent: RawEntity;
  role: FactEntity["role"];
  pct: number | null;
  related: boolean;
  relatedViaChartId: string | null;
  relatedViaPct: number | null;
  /** Parent/Subsidiary: one ownership edge away from the taxpayer set. Null otherwise. */
  direct: boolean | null;
}

function classifyExternals(entities: RawEntity[], memberSet: Set<string>, graph: OwnershipGraph, directPairs: Set<string>): Pre[] {
  const externals = entities.filter((e) => !memberSet.has(e.id));

  const qualifyingParents = externals.filter((e) => {
    if (!reaches(e.id, memberSet, graph)) return false;
    const pct = effectivePctToSet(e.id, memberSet, graph);
    return pct != null && pct > RELATED_THRESHOLD;
  });

  const pre: Pre[] = externals.map((ent) => {
    const isParent = reaches(ent.id, memberSet, graph);
    const isSub = !isParent && [...memberSet].some((m) => reaches(m, new Set([ent.id]), graph));

    if (isParent) {
      const pct = effectivePctToSet(ent.id, memberSet, graph);
      const direct = [...memberSet].some((m) => directPairs.has(`${ent.id}>${m}`));
      return { ent, role: "Parent", pct, related: pct != null && pct > RELATED_THRESHOLD, relatedViaChartId: null, relatedViaPct: null, direct };
    }
    if (isSub) {
      const pct = effectivePctFromSet(memberSet, ent.id, graph);
      const direct = [...memberSet].some((m) => directPairs.has(`${m}>${ent.id}`));
      return { ent, role: "Subsidiary", pct, related: pct != null && pct > RELATED_THRESHOLD, relatedViaChartId: null, relatedViaPct: null, direct };
    }
    let bestViaId: string | null = null;
    let bestViaPct: number | null = null;
    for (const p of qualifyingParents) {
      const pctToA = effectivePctToSet(p.id, new Set([ent.id]), graph);
      if (pctToA != null && pctToA > RELATED_THRESHOLD && (bestViaPct == null || pctToA > bestViaPct)) {
        bestViaPct = pctToA;
        bestViaId = p.id;
      }
    }
    return { ent, role: "Group entity", pct: null, related: bestViaId != null, relatedViaChartId: bestViaId, relatedViaPct: bestViaPct, direct: null };
  });

  const order = { Parent: 1, Subsidiary: 2, "Group entity": 3 } as const;
  const sortKey = (c: Pre) => c.pct ?? c.relatedViaPct ?? -1;
  return pre.sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if (sortKey(b) !== sortKey(a)) return sortKey(b) - sortKey(a);
    return a.ent.name.localeCompare(b.ent.name);
  });
}

// Legal-suffix normalisation, mirror of src/lib/legalName.ts (Deno cannot import
// from src/). Keep the replacement table identical so taxpayer-name matching in
// resolveTaxpayer behaves the same on the frontend and the backend.
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
export function parseTaxpayerNames(stored?: string | null): string[] {
  if (!stored) return [];
  return stored.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/** Single-line, human-readable label for a stored taxpayer_name (comma-joined). */
export function taxpayerDisplayName(stored?: string | null): string {
  return parseTaxpayerNames(stored).join(", ");
}

/**
 * Mirror of resolveTaxpayers in src/lib/appendix/facts/entityRegister.ts. Prefer the
 * is_taxpayer flags (every flagged entity is a taxpayer); when nothing is flagged,
 * anchor on the session's own named entities (newline-separated, suffix-normalised,
 * case-insensitive) so Part A does not collapse on a group whose taxpayer was
 * extracted but simply not flagged.
 */
function resolveTaxpayers(entities: RawEntity[], taxpayerName?: string | null): RawEntity[] {
  const flagged = entities.filter((e) => e.is_taxpayer);
  if (flagged.length) return flagged;
  const seen = new Set<string>();
  const out: RawEntity[] = [];
  for (const raw of parseTaxpayerNames(taxpayerName)) {
    const hint = normalizeEntityName(raw).toLowerCase();
    if (!hint) continue;
    const match = entities.find((e) => !seen.has(e.id) && normalizeEntityName(e.name).toLowerCase() === hint);
    if (match) {
      out.push(match);
      seen.add(match.id);
    }
  }
  return out;
}

/**
 * The taxpayer is E1. Roles come from the full ownership graph (multi-hop) with
 * effective chain-multiplied percentages; a group entity is flagged related when it
 * shares a common >25% parent with the taxpayer (recorded as relatedVia). A fiscal
 * unity (a grouping of kind 'fiscal_unity' that contains the taxpayer) collapses
 * into one synthetic E1; its members are listed (memberOfUnityId), never counted as
 * separate related parties. Mirror of src/lib/appendix/facts/entityRegister.ts.
 */
export function buildEntityRegister(entities: RawEntity[], edges: RawEdge[], groupings: RawGroup[] = [], taxpayerName?: string | null): FactEntity[] {
  const taxpayers = resolveTaxpayers(entities, taxpayerName);
  if (!taxpayers.length) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  const present = (id: string) => byId.has(id);

  // A fiscal unity collapses into one synthetic taxpayer, but only the single-
  // taxpayer case (unchanged). With several named taxpayers each is its own row.
  const fu = taxpayers.length === 1
    ? (groupings.find(
        (g) => g.kind === FISCAL_UNITY_KIND && Array.isArray(g.member_ids) && g.member_ids.includes(taxpayers[0].id),
      ) ?? null)
    : null;
  const memberIds: string[] = fu ? fu.member_ids.filter(present) : [];
  const memberSet = new Set<string>(fu ? memberIds : taxpayers.map((t) => t.id));

  const ownershipEdges = toOwnershipEdges(edges);
  const graph = buildOwnershipGraph(ownershipEdges);
  const directPairs = new Set(ownershipEdges.map((e) => `${e.from}>${e.to}`));
  // The register covers the corporate chain. Natural persons only stay when they
  // are genuinely associated (a >25% individual shareholder is an associated
  // enterprise under ATAD2); minor individual co-investors are noise.
  const cls = classifyExternals(entities, memberSet, graph, directPairs)
    .filter((c) => c.ent.entity_type !== "individual" || c.related);

  const toFact = (id: string, c: Pre): FactEntity => ({
    id,
    chartEntityId: c.ent.id,
    name: c.ent.name,
    jurisdiction: c.ent.jurisdiction_iso ?? null,
    entityType: c.ent.entity_type ?? null,
    role: c.role,
    ownershipPct: c.pct,
    related: c.related,
    relatedVia: c.relatedViaChartId ?? null,
    relatedViaPct: c.relatedViaPct,
    ...(c.direct == null ? {} : { directLink: c.direct }),
    nlTaxStatus: null,
  });

  const out: FactEntity[] = [];
  if (fu) {
    out.push({
      id: "E1",
      chartEntityId: `fu:${fu.id}`,
      name: fu.label,
      jurisdiction: taxpayers[0].jurisdiction_iso ?? null,
      entityType: "Fiscal unity",
      role: "Taxpayer",
      ownershipPct: null,
      related: false,
      nlTaxStatus: null,
      isFiscalUnity: true,
      memberEntityIds: memberIds,
    });
  } else {
    // One Taxpayer row per named entity (E1, E2, …); a single entity is E1.
    taxpayers.forEach((taxpayer, i) => {
      out.push({
        id: `E${i + 1}`,
        chartEntityId: taxpayer.id,
        name: taxpayer.name,
        jurisdiction: taxpayer.jurisdiction_iso ?? null,
        entityType: taxpayer.entity_type ?? null,
        role: "Taxpayer",
        ownershipPct: null,
        related: false,
        nlTaxStatus: null,
      });
    });
  }

  const chartToRegister = new Map<string, string>();
  let n = out.length;
  const extFacts: FactEntity[] = [];
  for (const c of cls) {
    const id = `E${++n}`;
    chartToRegister.set(c.ent.id, id);
    extFacts.push(toFact(id, c));
  }
  for (const f of extFacts) {
    f.relatedVia = f.relatedVia ? (chartToRegister.get(f.relatedVia) ?? null) : null;
    out.push(f);
  }

  if (fu) {
    for (const id of memberIds) {
      const ent = byId.get(id)!;
      out.push({
        id: `E${++n}`,
        chartEntityId: ent.id,
        name: ent.name,
        jurisdiction: ent.jurisdiction_iso ?? null,
        entityType: ent.entity_type ?? null,
        role: "Group entity",
        ownershipPct: null,
        related: false,
        relatedVia: null,
        relatedViaPct: null,
        nlTaxStatus: null,
        memberOfUnityId: "E1",
      });
    }
  }

  return out;
}
