import type { FactEntity } from '@/lib/appendix/types';

const RELATED_THRESHOLD = 25;

/** Sum the ownership interests of the given member entity ids; unknown counts as 0. */
export function combinedInterest(memberEntityIds: string[], entities: FactEntity[]): number {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return memberEntityIds.reduce((sum, id) => sum + (byId.get(id)?.ownershipPct ?? 0), 0);
}

/** Does the combined interest of these members cross the >25% related-party threshold? */
export function crossesThreshold(memberEntityIds: string[], entities: FactEntity[]): boolean {
  return combinedInterest(memberEntityIds, entities) > RELATED_THRESHOLD;
}
