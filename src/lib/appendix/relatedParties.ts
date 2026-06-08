import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

export type Relationship = 'Parent' | 'Subsidiary' | 'Group entity';

export interface RelatedParty {
  id: string;
  name: string;
  jurisdiction: string | null;
  entityType: string | null;
  relationship: Relationship;
  ownershipPct: number | null;   // parent: of the taxpayer; subsidiary: of that entity
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
): RelatedParty {
  return {
    id: ent.id,
    name: ent.name,
    jurisdiction: (ent.jurisdiction_iso as string | null) ?? null,
    entityType: (ent.entity_type as string | null) ?? null,
    relationship,
    ownershipPct: pct,
    meetsRelated: pct == null ? null : pct > RELATED_THRESHOLD,
    meetsReverse: pct == null ? null : pct >= REVERSE_THRESHOLD,
  };
}

/**
 * A deterministic related-parties overview from the structure chart: who owns the
 * taxpayer (parents), who the taxpayer owns (subsidiaries), and the remaining group
 * entities, each flagged against the 25% related-party and 50% reverse-hybrid
 * thresholds. This is a reviewer aid, not the legal determination of relatedness.
 */
export function buildRelatedParties(
  entities: StructureEntity[],
  edges: StructureEdge[],
): RelatedPartiesResult {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return { taxpayerName: null, parties: [] };

  const byId = new Map(entities.map((e) => [e.id, e]));
  const parties: RelatedParty[] = [];
  const seen = new Set<string>([taxpayer.id]);

  for (const ed of edges) {
    const pct = (ed.ownership_pct as number | null) ?? null;
    if (ed.to_entity_id === taxpayer.id && ed.from_entity_id !== taxpayer.id) {
      const ent = byId.get(ed.from_entity_id as string);
      if (ent && !seen.has(ent.id)) { parties.push(make(ent, 'Parent', pct)); seen.add(ent.id); }
    } else if (ed.from_entity_id === taxpayer.id && ed.to_entity_id !== taxpayer.id) {
      const ent = byId.get(ed.to_entity_id as string);
      if (ent && !seen.has(ent.id)) { parties.push(make(ent, 'Subsidiary', pct)); seen.add(ent.id); }
    }
  }

  for (const ent of entities) {
    if (seen.has(ent.id)) continue;
    parties.push(make(ent, 'Group entity', null));
  }

  return { taxpayerName: taxpayer.name, parties };
}
