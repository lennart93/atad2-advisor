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
  nlTaxStatus: string | null;
  /** Advisor overrides for the editable register fields; preserved across regeneration. */
  edits?: { jurisdiction?: string | null; entityType?: string | null; nlTaxStatus?: string | null };
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
  excludedFromClient: boolean;
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
}

const RELATED_THRESHOLD = 25;
const FISCAL_UNITY_KIND = "fiscal_unity";

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
}

function classifyExternals(entities: RawEntity[], memberSet: Set<string>, graph: OwnershipGraph): Pre[] {
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
      return { ent, role: "Parent", pct, related: pct != null && pct > RELATED_THRESHOLD, relatedViaChartId: null, relatedViaPct: null };
    }
    if (isSub) {
      const pct = effectivePctFromSet(memberSet, ent.id, graph);
      return { ent, role: "Subsidiary", pct, related: pct != null && pct > RELATED_THRESHOLD, relatedViaChartId: null, relatedViaPct: null };
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
    return { ent, role: "Group entity", pct: null, related: bestViaId != null, relatedViaChartId: bestViaId, relatedViaPct: bestViaPct };
  });

  const order = { Parent: 1, Subsidiary: 2, "Group entity": 3 } as const;
  const sortKey = (c: Pre) => c.pct ?? c.relatedViaPct ?? -1;
  return pre.sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if (sortKey(b) !== sortKey(a)) return sortKey(b) - sortKey(a);
    return a.ent.name.localeCompare(b.ent.name);
  });
}

/**
 * The taxpayer is E1. Roles come from the full ownership graph (multi-hop) with
 * effective chain-multiplied percentages; a group entity is flagged related when it
 * shares a common >25% parent with the taxpayer (recorded as relatedVia). A fiscal
 * unity (a grouping of kind 'fiscal_unity' that contains the taxpayer) collapses
 * into one synthetic E1; its members are listed (memberOfUnityId), never counted as
 * separate related parties. Mirror of src/lib/appendix/facts/entityRegister.ts.
 */
export function buildEntityRegister(entities: RawEntity[], edges: RawEdge[], groupings: RawGroup[] = []): FactEntity[] {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  const present = (id: string) => byId.has(id);

  const fu = groupings.find(
    (g) => g.kind === FISCAL_UNITY_KIND && Array.isArray(g.member_ids) && g.member_ids.includes(taxpayer.id),
  ) ?? null;
  const memberIds: string[] = fu ? fu.member_ids.filter(present) : [];
  const memberSet = new Set<string>(fu ? memberIds : [taxpayer.id]);

  const graph = buildOwnershipGraph(toOwnershipEdges(edges));
  const cls = classifyExternals(entities, memberSet, graph);

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
    nlTaxStatus: null,
  });

  const out: FactEntity[] = [];
  if (fu) {
    out.push({
      id: "E1",
      chartEntityId: `fu:${fu.id}`,
      name: fu.label,
      jurisdiction: taxpayer.jurisdiction_iso ?? null,
      entityType: "Fiscal unity",
      role: "Taxpayer",
      ownershipPct: null,
      related: false,
      nlTaxStatus: null,
      isFiscalUnity: true,
      memberEntityIds: memberIds,
    });
  } else {
    out.push({
      id: "E1",
      chartEntityId: taxpayer.id,
      name: taxpayer.name,
      jurisdiction: taxpayer.jurisdiction_iso ?? null,
      entityType: taxpayer.entity_type ?? null,
      role: "Taxpayer",
      ownershipPct: null,
      related: false,
      nlTaxStatus: null,
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
