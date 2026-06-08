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

/** The taxpayer is E1; parents (desc %), subsidiaries (desc %), then other group (by name). */
export function buildEntityRegister(entities: RawEntity[], edges: RawEdge[]): FactEntity[] {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  type Pre = { ent: RawEntity; role: FactEntity["role"]; pct: number | null };
  const pre = new Map<string, Pre>();
  pre.set(taxpayer.id, { ent: taxpayer, role: "Taxpayer", pct: null });

  for (const ed of edges) {
    const pct = ed.ownership_pct ?? null;
    if (ed.to_entity_id === taxpayer.id && ed.from_entity_id !== taxpayer.id) {
      const e = byId.get(ed.from_entity_id);
      if (e && !pre.has(e.id)) pre.set(e.id, { ent: e, role: "Parent", pct });
    } else if (ed.from_entity_id === taxpayer.id && ed.to_entity_id !== taxpayer.id) {
      const e = byId.get(ed.to_entity_id);
      if (e && !pre.has(e.id)) pre.set(e.id, { ent: e, role: "Subsidiary", pct });
    }
  }
  for (const e of entities) if (!pre.has(e.id)) pre.set(e.id, { ent: e, role: "Group entity", pct: null });

  const order = { Taxpayer: 0, Parent: 1, Subsidiary: 2, "Group entity": 3 } as const;
  const sorted = [...pre.values()].sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if ((b.pct ?? -1) !== (a.pct ?? -1)) return (b.pct ?? -1) - (a.pct ?? -1);
    return a.ent.name.localeCompare(b.ent.name);
  });

  return sorted.map((p, i) => ({
    id: `E${i + 1}`,
    chartEntityId: p.ent.id,
    name: p.ent.name,
    jurisdiction: p.ent.jurisdiction_iso ?? null,
    entityType: p.ent.entity_type ?? null,
    role: p.role,
    ownershipPct: p.pct,
    related: p.pct != null && p.pct > RELATED_THRESHOLD,
    nlTaxStatus: null,
  }));
}
