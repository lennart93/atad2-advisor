import type { StructureEntity, StructureEdge } from '@/lib/structure/types';
import {
  buildOwnershipGraph,
  toOwnershipEdges,
  reaches,
  effectivePctToSet,
  effectivePctFromSet,
} from '@/lib/structure/ownershipGraph';

export type Relationship = 'Parent' | 'Subsidiary' | 'Group entity';

export interface RelatedParty {
  id: string;
  name: string;
  jurisdiction: string | null;
  entityType: string | null;
  relationship: Relationship;
  ownershipPct: number | null;   // parent: effective stake in the taxpayer; subsidiary: taxpayer's effective stake; group entity: common parent's stake in it
  meetsRelated: boolean | null;  // > 25% (null when the percentage is unknown)
  meetsReverse: boolean | null;  // >= 50% (null when the percentage is unknown)
}

export interface RelatedPartiesResult {
  taxpayerName: string | null;
  parties: RelatedParty[];
}

const RELATED_THRESHOLD = 25;
const REVERSE_THRESHOLD = 50;

function make(
  ent: StructureEntity,
  relationship: Relationship,
  pct: number | null,
  related: boolean | null,
): RelatedParty {
  return {
    id: ent.id,
    name: ent.name,
    jurisdiction: (ent.jurisdiction_iso as string | null) ?? null,
    entityType: (ent.entity_type as string | null) ?? null,
    relationship,
    ownershipPct: pct,
    meetsRelated: related,
    meetsReverse: pct == null ? null : pct >= REVERSE_THRESHOLD,
  };
}

/**
 * A deterministic related-parties overview from the structure chart, walking the
 * FULL ownership graph: who owns the taxpayer directly or indirectly (parents), who
 * the taxpayer owns (subsidiaries), and group entities associated through a common
 * >25% parent, each with the effective (chain-multiplied) percentage and flagged
 * against the 25% related-party and 50% reverse-hybrid thresholds. This is a
 * reviewer aid, not the legal determination of relatedness.
 */
export function buildRelatedParties(
  entities: StructureEntity[],
  edges: StructureEdge[],
): RelatedPartiesResult {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return { taxpayerName: null, parties: [] };

  const tpSet = new Set<string>([taxpayer.id]);
  const graph = buildOwnershipGraph(toOwnershipEdges(edges));
  const externals = entities.filter((e) => e.id !== taxpayer.id);

  const qualifyingParents = externals.filter((e) => {
    if (!reaches(e.id, tpSet, graph)) return false;
    const pct = effectivePctToSet(e.id, tpSet, graph);
    return pct != null && pct > RELATED_THRESHOLD;
  });

  const parties = externals.map((ent) => {
    if (reaches(ent.id, tpSet, graph)) {
      const pct = effectivePctToSet(ent.id, tpSet, graph);
      return make(ent, 'Parent', pct, pct == null ? null : pct > RELATED_THRESHOLD);
    }
    if (reaches(taxpayer.id, new Set([ent.id]), graph)) {
      const pct = effectivePctFromSet(tpSet, ent.id, graph);
      return make(ent, 'Subsidiary', pct, pct == null ? null : pct > RELATED_THRESHOLD);
    }
    // Group entity: associated only if a common parent holds >25% in it too.
    let bestViaPct: number | null = null;
    for (const p of qualifyingParents) {
      const pctToA = effectivePctToSet(p.id, new Set([ent.id]), graph);
      if (pctToA != null && pctToA > RELATED_THRESHOLD && (bestViaPct == null || pctToA > bestViaPct)) {
        bestViaPct = pctToA;
      }
    }
    return make(ent, 'Group entity', bestViaPct, bestViaPct != null);
  });

  return { taxpayerName: taxpayer.name, parties };
}
