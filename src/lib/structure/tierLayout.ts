import type { StructureEntity, StructureEdge } from './types';
import type { Cluster } from './relevance';

export const VERT_SEP = 160;
export const HORIZ_SEP = 180;

/**
 * Pick the chart anchor:
 *   1. The entity with is_taxpayer = true (first match if multiple)
 *   2. UPE detection: entity with no incoming ownership edge.
 *      Among multiple UPEs, pick the one with the most descendants.
 *   3. First entity if all else fails.
 *   4. null when there are no entities at all.
 */
export function selectAnchor(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
): string | null {
  if (entities.length === 0) return null;
  const taxpayer = entities.find((e) => e.is_taxpayer);
  if (taxpayer) return taxpayer.id;

  const incoming = new Set<string>();
  for (const e of ownershipEdges) incoming.add(e.to_entity_id);
  const upes = entities.filter((e) => !incoming.has(e.id));
  if (upes.length === 0) return entities[0].id;
  if (upes.length === 1) return upes[0].id;

  const descCount = new Map<string, number>();
  for (const u of upes) {
    const seen = new Set<string>([u.id]);
    const stack = [u.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of ownershipEdges) {
        if (e.from_entity_id === cur && !seen.has(e.to_entity_id)) {
          seen.add(e.to_entity_id);
          stack.push(e.to_entity_id);
        }
      }
    }
    descCount.set(u.id, seen.size - 1);
  }
  return upes.sort(
    (a, b) => (descCount.get(b.id) ?? 0) - (descCount.get(a.id) ?? 0),
  )[0].id;
}

/**
 * BFS in both directions from anchor along ownership edges.
 *   - INCOMING edges → parents at rank -1, -2, ...
 *   - OUTGOING edges → children at rank +1, +2, ...
 * Multi-parent (DAG) entities get the minimum-distance rank.
 * Orphans (no path to anchor) are NOT in the returned map.
 */
export function assignRanks(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  anchorId: string,
): Map<string, number> {
  const ranks = new Map<string, number>();
  if (!entities.find((e) => e.id === anchorId)) return ranks;
  ranks.set(anchorId, 0);

  const downQueue: Array<{ id: string; rank: number }> = [{ id: anchorId, rank: 0 }];
  while (downQueue.length) {
    const { id, rank } = downQueue.shift()!;
    for (const e of ownershipEdges) {
      if (e.from_entity_id !== id) continue;
      const child = e.to_entity_id;
      const candidate = rank + 1;
      const existing = ranks.get(child);
      if (existing === undefined || Math.abs(candidate) < Math.abs(existing)) {
        ranks.set(child, candidate);
        downQueue.push({ id: child, rank: candidate });
      }
    }
  }

  const upQueue: Array<{ id: string; rank: number }> = [{ id: anchorId, rank: 0 }];
  while (upQueue.length) {
    const { id, rank } = upQueue.shift()!;
    for (const e of ownershipEdges) {
      if (e.to_entity_id !== id) continue;
      const parent = e.from_entity_id;
      const candidate = rank - 1;
      const existing = ranks.get(parent);
      if (existing === undefined || Math.abs(candidate) < Math.abs(existing)) {
        ranks.set(parent, candidate);
        upQueue.push({ id: parent, rank: candidate });
      }
    }
  }

  return ranks;
}

export function clusterId(c: Cluster): string {
  return `cluster:${c.parent_id}:${c.member_ids.slice().sort().join(',')}`;
}

export interface PositionedEntity {
  id: string;
  x: number;
  y: number;
}

export interface TierLayoutResult {
  positions: Map<string, PositionedEntity>;
  clusterPositions: Map<string, PositionedEntity>;
  ranks: Map<string, number>;
  /** Sorted ascending; ranks that have at least one node or cluster. */
  ranksRendered: number[];
  orphans: StructureEntity[];
}

/**
 * Sync, deterministic strict-tier layout. Each rank becomes a horizontal row;
 * X-positions evenly distributed and centered around 0; Y = (rank - minRank) * VERT_SEP.
 * Cluster placeholders sit in their parent's rank + 1.
 */
export function tierLayout(args: {
  entities: StructureEntity[];
  ownershipEdges: StructureEdge[];
  clusters: Cluster[];
}): TierLayoutResult {
  const { entities, ownershipEdges, clusters } = args;

  const positions = new Map<string, PositionedEntity>();
  const clusterPositions = new Map<string, PositionedEntity>();
  const orphans: StructureEntity[] = [];

  const anchorId = selectAnchor(entities, ownershipEdges);
  if (!anchorId) {
    return {
      positions,
      clusterPositions,
      ranks: new Map(),
      ranksRendered: [],
      orphans: [...entities],
    };
  }
  const ranks = assignRanks(entities, ownershipEdges, anchorId);

  const folded = new Set<string>();
  for (const c of clusters) for (const id of c.member_ids) folded.add(id);

  type Slot =
    | { kind: 'entity'; entity: StructureEntity }
    | { kind: 'cluster'; cluster: Cluster };
  const slotsByRank = new Map<number, Slot[]>();

  for (const e of entities) {
    if (folded.has(e.id)) continue;
    const r = ranks.get(e.id);
    if (r === undefined) {
      orphans.push(e);
      continue;
    }
    const list = slotsByRank.get(r) ?? [];
    list.push({ kind: 'entity', entity: e });
    slotsByRank.set(r, list);
  }
  for (const c of clusters) {
    const parentRank = ranks.get(c.parent_id);
    if (parentRank === undefined) continue;
    const r = parentRank + 1;
    const list = slotsByRank.get(r) ?? [];
    list.push({ kind: 'cluster', cluster: c });
    slotsByRank.set(r, list);
  }

  const slotName = (s: Slot): string =>
    s.kind === 'entity' ? s.entity.name : `~cluster:${s.cluster.parent_id}`;
  const slotIso = (s: Slot): string =>
    s.kind === 'cluster' ? '' : (s.entity.jurisdiction_iso || '').toUpperCase();

  for (const list of slotsByRank.values()) {
    list.sort((a, b) => {
      const aIsTx = a.kind === 'entity' && a.entity.is_taxpayer;
      const bIsTx = b.kind === 'entity' && b.entity.is_taxpayer;
      if (aIsTx !== bIsTx) return aIsTx ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === 'cluster' ? 1 : -1;
      if (a.kind === 'entity' && b.kind === 'entity') {
        const aNl = slotIso(a) === 'NL';
        const bNl = slotIso(b) === 'NL';
        if (aNl !== bNl) return aNl ? -1 : 1;
      }
      return slotName(a).localeCompare(slotName(b));
    });
  }

  const ranksRendered = Array.from(slotsByRank.keys()).sort((a, b) => a - b);
  const minRank = ranksRendered.length > 0 ? ranksRendered[0] : 0;

  for (const rank of ranksRendered) {
    const list = slotsByRank.get(rank)!;
    const slots = list.length;
    const y = (rank - minRank) * VERT_SEP;
    list.forEach((slot, i) => {
      const x = (i - (slots - 1) / 2) * HORIZ_SEP;
      if (slot.kind === 'entity') {
        positions.set(slot.entity.id, { id: slot.entity.id, x, y });
      } else {
        const id = clusterId(slot.cluster);
        clusterPositions.set(id, { id, x, y });
      }
    });
  }

  return { positions, clusterPositions, ranks, ranksRendered, orphans };
}
