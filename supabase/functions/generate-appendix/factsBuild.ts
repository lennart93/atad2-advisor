// Deterministic Part A builders, mirror of src/lib/appendix/facts/entityRegister.ts
// and actingTogether.ts. Keep the algorithm identical so the frontend fallback
// and the stored facts agree.

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
  nlTaxStatus: string | null;
  isFiscalUnity?: boolean;
  memberEntityIds?: string[];
  memberOfUnityId?: string;
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
  status: "proposed" | "confirmed";
  excludedFromClient: boolean;
  source: "ai" | "edited";
}

export interface ActingTogetherCluster {
  id: string;
  memberEntityIds: string[];
  combinedPct: number | null;
  rationale: string;
  status: "proposed" | "confirmed" | "dismissed";
  excludedFromClient: boolean;
  source: "ai" | "edited";
}

export interface AppendixFacts {
  entities: FactEntity[];
  actingTogether: ActingTogetherCluster[];
  classifications: ClassificationItem[];
  transactions: TransactionItem[];
}

const RELATED_THRESHOLD = 25;
const FISCAL_UNITY_KIND = "fiscal_unity";

/**
 * The taxpayer is E1. A fiscal unity (a grouping of kind 'fiscal_unity' that
 * contains the taxpayer) collapses into one synthetic E1; its members are listed
 * (flagged memberOfUnityId), never counted as separate related parties, and
 * relatedness is measured from the whole unity outward. Mirror of the frontend
 * src/lib/appendix/facts/entityRegister.ts.
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

  type Pre = { ent: RawEntity; role: FactEntity["role"]; pct: number | null };
  const ext = new Map<string, Pre>();
  for (const ed of edges) {
    const pct = ed.ownership_pct ?? null;
    if (memberSet.has(ed.to_entity_id) && !memberSet.has(ed.from_entity_id) && byId.has(ed.from_entity_id) && !ext.has(ed.from_entity_id)) {
      ext.set(ed.from_entity_id, { ent: byId.get(ed.from_entity_id)!, role: "Parent", pct });
    } else if (memberSet.has(ed.from_entity_id) && !memberSet.has(ed.to_entity_id) && byId.has(ed.to_entity_id) && !ext.has(ed.to_entity_id)) {
      ext.set(ed.to_entity_id, { ent: byId.get(ed.to_entity_id)!, role: "Subsidiary", pct });
    }
  }
  for (const e of entities) {
    if (memberSet.has(e.id) || ext.has(e.id)) continue;
    ext.set(e.id, { ent: e, role: "Group entity", pct: null });
  }

  const order = { Parent: 1, Subsidiary: 2, "Group entity": 3 } as const;
  const sortedExt = [...ext.values()].sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if ((b.pct ?? -1) !== (a.pct ?? -1)) return (b.pct ?? -1) - (a.pct ?? -1);
    return a.ent.name.localeCompare(b.ent.name);
  });

  const toFact = (id: string, ent: RawEntity, role: FactEntity["role"], pct: number | null): FactEntity => ({
    id,
    chartEntityId: ent.id,
    name: ent.name,
    jurisdiction: ent.jurisdiction_iso ?? null,
    entityType: ent.entity_type ?? null,
    role,
    ownershipPct: pct,
    related: pct != null && pct > RELATED_THRESHOLD,
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
    out.push(toFact("E1", taxpayer, "Taxpayer", null));
  }

  let n = out.length;
  for (const p of sortedExt) out.push(toFact(`E${++n}`, p.ent, p.role, p.pct));

  if (fu) {
    for (const id of memberIds) {
      const ent = byId.get(id)!;
      out.push({ ...toFact(`E${++n}`, ent, "Group entity", null), memberOfUnityId: "E1", related: false });
    }
  }

  return out;
}
