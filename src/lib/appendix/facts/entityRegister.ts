import type { StructureEntity, StructureEdge } from '@/lib/structure/types';
import type { FactEntity } from '@/lib/appendix/types';

const RELATED_THRESHOLD = 25;

/**
 * Deterministic entity register from the structure chart. The taxpayer is E1;
 * the remaining entities are ordered parents (by descending interest), then
 * subsidiaries (by descending interest), then other group entities (by name),
 * and numbered E2.. in that order. Pure function of (entities, edges).
 */
export function buildEntityRegister(entities: StructureEntity[], edges: StructureEdge[]): FactEntity[] {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  type Pre = { ent: StructureEntity; role: FactEntity['role']; pct: number | null };
  const pre = new Map<string, Pre>();
  pre.set(taxpayer.id, { ent: taxpayer, role: 'Taxpayer', pct: null });

  for (const ed of edges) {
    const pct = (ed.ownership_pct as number | null) ?? null;
    if (ed.to_entity_id === taxpayer.id && ed.from_entity_id !== taxpayer.id) {
      const e = byId.get(ed.from_entity_id as string);
      if (e && !pre.has(e.id)) pre.set(e.id, { ent: e, role: 'Parent', pct });
    } else if (ed.from_entity_id === taxpayer.id && ed.to_entity_id !== taxpayer.id) {
      const e = byId.get(ed.to_entity_id as string);
      if (e && !pre.has(e.id)) pre.set(e.id, { ent: e, role: 'Subsidiary', pct });
    }
  }
  for (const e of entities) if (!pre.has(e.id)) pre.set(e.id, { ent: e, role: 'Group entity', pct: null });

  const order = { Taxpayer: 0, Parent: 1, Subsidiary: 2, 'Group entity': 3 } as const;
  const sorted = [...pre.values()].sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if ((b.pct ?? -1) !== (a.pct ?? -1)) return (b.pct ?? -1) - (a.pct ?? -1);
    return a.ent.name.localeCompare(b.ent.name);
  });

  return sorted.map((p, i) => ({
    id: `E${i + 1}`,
    chartEntityId: p.ent.id,
    name: p.ent.name,
    jurisdiction: (p.ent.jurisdiction_iso as string | null) ?? null,
    entityType: (p.ent.entity_type as string | null) ?? null,
    role: p.role,
    ownershipPct: p.pct,
    related: p.pct != null && p.pct > RELATED_THRESHOLD,
    nlTaxStatus: null,
  }));
}
