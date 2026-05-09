import type { StructureEntity, StructureEdge, StructureGroup } from './types';

const HYBRID_TYPES: ReadonlyArray<StructureEntity['entity_type']> = [
  'dh_entity',
  'hybrid_partnership',
  'reverse_hybrid',
];

export function isAtad2Relevant(
  entity: StructureEntity,
  allEntities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  transactionEdges: StructureEdge[],
  taxpayerId: string,
  groupings: StructureGroup[] = [],
): boolean {
  if (entity.is_taxpayer) return true;
  if (HYBRID_TYPES.includes(entity.entity_type)) return true;
  if (transactionEdges.some(
    (e) => e.from_entity_id === entity.id || e.to_entity_id === entity.id,
  )) {
    return true;
  }
  if (taxpayerId && isAncestorOf(entity.id, taxpayerId, ownershipEdges)) return true;
  if (taxpayerId && groupings.some(
    (g) => g.kind === 'fiscal_unity' &&
           g.member_ids.includes(taxpayerId) &&
           g.member_ids.includes(entity.id),
  )) {
    return true;
  }
  return false;
}

function isAncestorOf(
  ancestorId: string,
  descendantId: string,
  ownershipEdges: StructureEdge[],
): boolean {
  const seen = new Set<string>();
  const stack = [descendantId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of ownershipEdges) {
      if (edge.to_entity_id === current) {
        if (edge.from_entity_id === ancestorId) return true;
        stack.push(edge.from_entity_id);
      }
    }
  }
  return false;
}

export interface Cluster {
  parent_id: string;
  member_ids: string[];
}

export interface ClusteringResult {
  clusters: Cluster[];
  clusteredIds: Set<string>;
}

export function groupNonRelevantSiblings(
  allEntities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  transactionEdges: StructureEdge[],
  taxpayerId: string,
  groupings: StructureGroup[] = [],
): ClusteringResult {
  const relevance = new Map<string, boolean>();
  for (const e of allEntities) {
    relevance.set(
      e.id,
      isAtad2Relevant(e, allEntities, ownershipEdges, transactionEdges, taxpayerId, groupings),
    );
  }

  const hasRelevantDescendant = new Map<string, boolean>();
  function check(id: string, stack: Set<string>): boolean {
    if (hasRelevantDescendant.has(id)) return hasRelevantDescendant.get(id)!;
    if (stack.has(id)) return false;
    stack.add(id);
    let result = false;
    for (const edge of ownershipEdges) {
      if (edge.from_entity_id !== id) continue;
      const childId = edge.to_entity_id;
      if (relevance.get(childId)) { result = true; break; }
      if (check(childId, stack)) { result = true; break; }
    }
    stack.delete(id);
    hasRelevantDescendant.set(id, result);
    return result;
  }
  for (const e of allEntities) check(e.id, new Set());

  const childrenByParent = new Map<string, string[]>();
  for (const edge of ownershipEdges) {
    const list = childrenByParent.get(edge.from_entity_id) ?? [];
    list.push(edge.to_entity_id);
    childrenByParent.set(edge.from_entity_id, list);
  }

  const clusters: Cluster[] = [];
  const clusteredIds = new Set<string>();
  for (const [parentId, children] of childrenByParent) {
    const candidates = children.filter(
      (cid) => !relevance.get(cid) && !hasRelevantDescendant.get(cid),
    );
    if (candidates.length >= 2) {
      clusters.push({ parent_id: parentId, member_ids: candidates });
      for (const id of candidates) clusteredIds.add(id);
    }
  }

  return { clusters, clusteredIds };
}
