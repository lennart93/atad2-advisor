import type { StructureEntity, StructureEdge, StructureGroup } from '@/lib/structure/types';
import type { FactEntity } from '@/lib/appendix/types';

const RELATED_THRESHOLD = 25;
const FISCAL_UNITY_KIND = 'fiscal_unity';

/**
 * Deterministic entity register from the structure chart.
 *
 * A fiscal unity (an atad2_structure_groupings row of kind 'fiscal_unity' that
 * contains the taxpayer) is collapsed into one synthetic taxpayer E1; its members
 * are listed (flagged memberOfUnityId) but never counted as separate related
 * parties, and relatedness is measured from the whole unity outward. Without a
 * fiscal unity the single is_taxpayer entity is E1, exactly as before.
 */
export function buildEntityRegister(
  entities: StructureEntity[],
  edges: StructureEdge[],
  groupings: StructureGroup[] = [],
): FactEntity[] {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  const present = (id: string) => byId.has(id);

  const fu = groupings.find(
    (g) => g.kind === FISCAL_UNITY_KIND && Array.isArray(g.member_ids) && (g.member_ids as string[]).includes(taxpayer.id),
  ) ?? null;
  const memberIds: string[] = fu ? (fu.member_ids as string[]).filter(present) : [];
  const memberSet = new Set<string>(fu ? memberIds : [taxpayer.id]);

  type Pre = { ent: StructureEntity; role: FactEntity['role']; pct: number | null };
  const ext = new Map<string, Pre>();
  for (const ed of edges) {
    const pct = (ed.ownership_pct as number | null) ?? null;
    const from = ed.from_entity_id as string;
    const to = ed.to_entity_id as string;
    if (memberSet.has(to) && !memberSet.has(from) && byId.has(from) && !ext.has(from)) {
      ext.set(from, { ent: byId.get(from)!, role: 'Parent', pct });
    } else if (memberSet.has(from) && !memberSet.has(to) && byId.has(to) && !ext.has(to)) {
      ext.set(to, { ent: byId.get(to)!, role: 'Subsidiary', pct });
    }
  }
  for (const e of entities) {
    if (memberSet.has(e.id) || ext.has(e.id)) continue;
    ext.set(e.id, { ent: e, role: 'Group entity', pct: null });
  }

  const order = { Parent: 1, Subsidiary: 2, 'Group entity': 3 } as const;
  const sortedExt = [...ext.values()].sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if ((b.pct ?? -1) !== (a.pct ?? -1)) return (b.pct ?? -1) - (a.pct ?? -1);
    return a.ent.name.localeCompare(b.ent.name);
  });

  const toFact = (id: string, ent: StructureEntity, role: FactEntity['role'], pct: number | null): FactEntity => ({
    id,
    chartEntityId: ent.id,
    name: ent.name,
    jurisdiction: (ent.jurisdiction_iso as string | null) ?? null,
    entityType: (ent.entity_type as string | null) ?? null,
    role,
    ownershipPct: pct,
    related: pct != null && pct > RELATED_THRESHOLD,
    nlTaxStatus: null,
  });

  const out: FactEntity[] = [];
  if (fu) {
    out.push({
      id: 'E1',
      chartEntityId: `fu:${fu.id}`,
      name: fu.label,
      jurisdiction: (taxpayer.jurisdiction_iso as string | null) ?? null,
      entityType: 'Fiscal unity',
      role: 'Taxpayer',
      ownershipPct: null,
      related: false,
      nlTaxStatus: null,
      isFiscalUnity: true,
      memberEntityIds: memberIds,
    });
  } else {
    out.push(toFact('E1', taxpayer, 'Taxpayer', null));
  }

  let n = out.length;
  for (const p of sortedExt) out.push(toFact(`E${++n}`, p.ent, p.role, p.pct));

  if (fu) {
    for (const id of memberIds) {
      const ent = byId.get(id)!;
      out.push({ ...toFact(`E${++n}`, ent, 'Group entity', null), memberOfUnityId: 'E1', related: false });
    }
  }

  return out;
}
