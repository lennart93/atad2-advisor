import type { StructureEntity, StructureEdge } from './types';
import type { Cluster } from './relevance';
import { NODE_WIDTH, NODE_HEIGHT } from './labelMeasure';

const MIN_GAP = 32;
const MAX_ROW_WIDTH = 1200;
const ROW_GAP = 60;
const TIER_GAP_BELOW = 80;
const MAX_PER_ROW = Math.floor((MAX_ROW_WIDTH + MIN_GAP) / (NODE_WIDTH + MIN_GAP));

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

type Slot =
  | { kind: 'entity'; entity: StructureEntity; width: number; height: number; x: number; y: number }
  | { kind: 'cluster'; cluster: Cluster; width: number; height: number; x: number; y: number };

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
    return { positions, clusterPositions, ranks: new Map(), ranksRendered: [], orphans: [...entities] };
  }

  // Phase 2: anchor + reachability set
  const folded = new Set<string>();
  for (const c of clusters) for (const id of c.member_ids) folded.add(id);

  const reachable = computeReachableFromAnchor(entities, ownershipEdges, anchorId);

  // Phase 3: longest-path layering
  const ranks = longestPathRanks(entities, ownershipEdges, reachable);

  // Orphans: anything not reachable (unless folded into a cluster).
  for (const e of entities) {
    if (folded.has(e.id)) continue;
    if (!reachable.has(e.id) || !ranks.has(e.id)) orphans.push(e);
  }

  // Phase 4: cluster rank
  const clustersWithRank: Array<{ c: Cluster; rank: number }> = [];
  for (const c of clusters) {
    const pr = ranks.get(c.parent_id);
    if (pr === undefined) continue;
    clustersWithRank.push({ c, rank: pr + 1 });
  }

  // Group slots by rank — all slots use uniform NODE_WIDTH × NODE_HEIGHT
  const slotsByRank = new Map<number, Slot[]>();
  for (const e of entities) {
    if (folded.has(e.id)) continue;
    const r = ranks.get(e.id);
    if (r === undefined) continue;
    const list = slotsByRank.get(r) ?? [];
    list.push({ kind: 'entity', entity: e, width: NODE_WIDTH, height: NODE_HEIGHT, x: 0, y: 0 });
    slotsByRank.set(r, list);
  }
  for (const { c, rank } of clustersWithRank) {
    const list = slotsByRank.get(rank) ?? [];
    list.push({ kind: 'cluster', cluster: c, width: NODE_WIDTH, height: NODE_HEIGHT, x: 0, y: 0 });
    slotsByRank.set(rank, list);
  }

  const ranksRendered = Array.from(slotsByRank.keys()).sort((a, b) => a - b);
  if (ranksRendered.length === 0) {
    return { positions, clusterPositions, ranks, ranksRendered: [], orphans };
  }

  // Phase 5: barycenter sweep (initial: alphabetic-ish stable order)
  for (const list of slotsByRank.values()) {
    list.sort((a, b) => slotName(a).localeCompare(slotName(b)));
  }

  // Initial X assignment: even spacing per tier, centered on 0.
  // slot.x is the CENTER coordinate throughout the layout pipeline; converted to top-left in Phase 8.
  for (const rank of ranksRendered) {
    const list = slotsByRank.get(rank)!;
    let cursor = 0;
    for (const slot of list) {
      slot.x = cursor + NODE_WIDTH / 2;
      cursor += NODE_WIDTH + MIN_GAP;
    }
    const tierWidth = cursor - MIN_GAP;
    const shift = -tierWidth / 2;
    for (const slot of list) slot.x += shift;
  }

  // Two iterations of barycenter sweep (orders siblings by parent/child barycenters before row-wrap)
  for (let iter = 0; iter < 2; iter++) {
    // Down-sweep
    for (let i = 1; i < ranksRendered.length; i++) {
      const tier = slotsByRank.get(ranksRendered[i])!;
      const above = slotsByRank.get(ranksRendered[i - 1])!;
      sortByParentBarycenter(tier, above, ownershipEdges, clusters);
      repackTier(tier);
    }
    // Up-sweep
    for (let i = ranksRendered.length - 2; i >= 0; i--) {
      const tier = slotsByRank.get(ranksRendered[i])!;
      const below = slotsByRank.get(ranksRendered[i + 1])!;
      sortByChildBarycenter(tier, below, ownershipEdges, clusters);
      repackTier(tier);
    }
  }

  // Phase 6: row-wrap + uniform X-packing
  // For each tier, determine how many rows; assign slots to rows; place each row.
  const tierRowAssignments = new Map<number, Slot[][]>(); // rank → array of rows (each row a Slot[])
  for (const rank of ranksRendered) {
    const tier = slotsByRank.get(rank)!;
    const N = tier.length;
    const singleRowWidth = N * NODE_WIDTH + (N - 1) * MIN_GAP;
    let rows: Slot[][];
    if (singleRowWidth <= MAX_ROW_WIDTH) {
      rows = [tier]; // single row
    } else {
      const rowsNeeded = Math.ceil(N / MAX_PER_ROW);
      // Distribute evenly: base size + 1 extra for the first (N % rowsNeeded) rows.
      const base = Math.floor(N / rowsNeeded);
      const extras = N % rowsNeeded;
      rows = [];
      let offset = 0;
      for (let r = 0; r < rowsNeeded; r++) {
        const rowSize = base + (r < extras ? 1 : 0);
        rows.push(tier.slice(offset, offset + rowSize));
        offset += rowSize;
      }
    }
    tierRowAssignments.set(rank, rows);
  }

  // Determine X for each row: place slots left-to-right at uniform step, centered under parents.
  for (let i = 0; i < ranksRendered.length; i++) {
    const rank = ranksRendered[i];
    const rows = tierRowAssignments.get(rank)!;
    const above = i > 0 ? slotsByRank.get(ranksRendered[i - 1])! : null;
    for (const row of rows) {
      // Left-to-right uniform placement
      let cursor = 0;
      for (const slot of row) {
        slot.x = cursor + NODE_WIDTH / 2; // center coordinate
        cursor += NODE_WIDTH + MIN_GAP;
      }
      // Center the row under parents-barycenter (or 0 for tier 0)
      let target: number;
      if (above) {
        target = parentCentroidForRow(row, above, ownershipEdges, clusters);
      } else {
        target = 0;
      }
      const rowCentroid = row.reduce((a, s) => a + s.x, 0) / row.length;
      const shift = target - rowCentroid;
      for (const slot of row) slot.x += shift;
    }
  }

  // Phase 7: Y assignment with multi-row support
  let yCursor = 0;
  for (const rank of ranksRendered) {
    const rows = tierRowAssignments.get(rank)!;
    for (let r = 0; r < rows.length; r++) {
      const rowY = yCursor + r * (NODE_HEIGHT + ROW_GAP);
      for (const slot of rows[r]) {
        slot.y = rowY;
      }
    }
    const tierHeight = rows.length * NODE_HEIGHT + (rows.length - 1) * ROW_GAP;
    yCursor += tierHeight + TIER_GAP_BELOW;
  }

  // Phase 8: write positions (convert from center-X to top-left for React Flow / PPTX)
  for (const rank of ranksRendered) {
    for (const row of tierRowAssignments.get(rank)!) {
      for (const slot of row) {
        const x = slot.x - slot.width / 2;
        const y = slot.y;
        if (slot.kind === 'entity') {
          positions.set(slot.entity.id, { id: slot.entity.id, x, y });
        } else {
          const id = clusterId(slot.cluster);
          clusterPositions.set(id, { id, x, y });
        }
      }
    }
  }

  return { positions, clusterPositions, ranks, ranksRendered, orphans };
}

// --- helpers ---

// Walks ownership edges in BOTH directions from the anchor. The anchor is
// typically the taxpayer, which is rarely the UPE — parents above and children
// below are both legitimate reachable nodes. Without the upward walk, UPEs
// would never get a rank and would be silently treated as orphans.
function computeReachableFromAnchor(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  anchorId: string,
): Set<string> {
  const reachable = new Set<string>([anchorId]);
  const queue = [anchorId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of ownershipEdges) {
      if (e.from_entity_id === cur && !reachable.has(e.to_entity_id)) {
        reachable.add(e.to_entity_id);
        queue.push(e.to_entity_id);
      }
      if (e.to_entity_id === cur && !reachable.has(e.from_entity_id)) {
        reachable.add(e.from_entity_id);
        queue.push(e.from_entity_id);
      }
    }
  }
  return reachable;
}

function longestPathRanks(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  reachable: Set<string>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const parents = new Map<string, string[]>();
  for (const e of ownershipEdges) {
    if (!reachable.has(e.from_entity_id) || !reachable.has(e.to_entity_id)) continue;
    const list = parents.get(e.to_entity_id) ?? [];
    list.push(e.from_entity_id);
    parents.set(e.to_entity_id, list);
  }

  // UPEs (no incoming edges among reachable) → rank 0
  const allReachableIds = Array.from(reachable);
  for (const id of allReachableIds) {
    if (!parents.has(id) || parents.get(id)!.length === 0) ranks.set(id, 0);
  }

  // Iteratively propagate: rank(e) = 1 + max(rank(p))
  let changed = true;
  let iterations = 0;
  const maxIter = allReachableIds.length + 1; // safety
  while (changed && iterations < maxIter) {
    changed = false;
    iterations++;
    for (const id of allReachableIds) {
      const ps = parents.get(id) ?? [];
      if (ps.length === 0) continue;
      let maxParentRank = -1;
      let allKnown = true;
      for (const p of ps) {
        const pr = ranks.get(p);
        if (pr === undefined) { allKnown = false; break; }
        if (pr > maxParentRank) maxParentRank = pr;
      }
      if (!allKnown) continue;
      const candidate = maxParentRank + 1;
      if (ranks.get(id) !== candidate) {
        ranks.set(id, candidate);
        changed = true;
      }
    }
  }
  return ranks;
}

function slotName(s: Slot): string {
  return s.kind === 'entity' ? s.entity.name : `~cluster:${s.cluster.parent_id}`;
}

function slotId(s: Slot): string {
  return s.kind === 'entity' ? s.entity.id : clusterId(s.cluster);
}

function parentIdsOf(
  s: Slot,
  ownershipEdges: StructureEdge[],
  _clusters: Cluster[],
): string[] {
  if (s.kind === 'entity') {
    return ownershipEdges
      .filter((e) => e.to_entity_id === s.entity.id)
      .map((e) => e.from_entity_id);
  }
  return [s.cluster.parent_id];
}

function childIdsOf(
  s: Slot,
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): string[] {
  if (s.kind === 'entity') {
    const direct = ownershipEdges
      .filter((e) => e.from_entity_id === s.entity.id)
      .map((e) => e.to_entity_id);
    const clusterChildren = clusters
      .filter((c) => c.parent_id === s.entity.id)
      .map((c) => clusterId(c));
    return [...direct, ...clusterChildren];
  }
  return [];
}

function meanXById(ids: string[], tier: Slot[]): number | null {
  const xs: number[] = [];
  for (const id of ids) {
    for (const s of tier) if (slotId(s) === id) xs.push(s.x);
  }
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sortByParentBarycenter(
  tier: Slot[],
  above: Slot[],
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): void {
  const bary = new Map<string, number>();
  for (const s of tier) {
    const ps = parentIdsOf(s, ownershipEdges, clusters);
    const mx = meanXById(ps, above);
    bary.set(slotId(s), mx ?? Number.POSITIVE_INFINITY);
  }
  tier.sort((a, b) => {
    const ax = bary.get(slotId(a))!;
    const bx = bary.get(slotId(b))!;
    if (ax !== bx) return ax - bx;
    return slotName(a).localeCompare(slotName(b));
  });
}

function sortByChildBarycenter(
  tier: Slot[],
  below: Slot[],
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): void {
  const bary = new Map<string, number>();
  for (const s of tier) {
    const cs = childIdsOf(s, ownershipEdges, clusters);
    const mx = meanXById(cs, below);
    bary.set(slotId(s), mx ?? Number.POSITIVE_INFINITY);
  }
  tier.sort((a, b) => {
    const ax = bary.get(slotId(a))!;
    const bx = bary.get(slotId(b))!;
    if (ax !== bx) return ax - bx;
    return slotName(a).localeCompare(slotName(b));
  });
}

function repackTier(tier: Slot[]): void {
  let cursor = 0;
  for (const s of tier) {
    s.x = cursor + NODE_WIDTH / 2;
    cursor += NODE_WIDTH + MIN_GAP;
  }
  const tw = cursor - MIN_GAP;
  for (const s of tier) s.x -= tw / 2;
}

function parentCentroidForRow(
  row: Slot[],
  above: Slot[],
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): number {
  const parentSet = new Set<string>();
  for (const s of row) for (const p of parentIdsOf(s, ownershipEdges, clusters)) parentSet.add(p);
  const xs: number[] = [];
  for (const id of parentSet) {
    for (const s of above) if (slotId(s) === id) xs.push(s.x);
  }
  if (xs.length === 0) {
    return above.reduce((a, s) => a + s.x, 0) / Math.max(above.length, 1);
  }
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
