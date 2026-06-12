import type { AppendixFacts, ClassificationItem } from '@/lib/appendix/types';

/**
 * Advisor sets the local (home-state) qualification of an entity. 'unknown'
 * clears it back to "to be determined" and STAYS cleared across regeneration
 * (the edited row blocks a fresh AI proposal), exactly like a positive choice.
 * Updates the existing classification row or inserts a minimal one; source
 * 'edited' makes it survive regeneration (mergeFacts keeps edited rows).
 */
export function withLocalQualification(
  facts: AppendixFacts,
  entityId: string,
  homeClass: 'transparent' | 'opaque' | 'unknown',
  homeState: string | null,
): AppendixFacts {
  const stored = homeClass === 'unknown' ? '' : homeClass;
  const existing = facts.classifications.find((c) => c.entityId === entityId);
  if (existing) {
    return {
      ...facts,
      classifications: facts.classifications.map((c) =>
        c.entityId === entityId ? { ...c, homeClass: stored, hybrid: false, source: 'edited' } : c,
      ),
    };
  }
  const fresh: ClassificationItem = {
    entityId,
    homeState: homeState ?? '',
    homeClass: stored,
    sourceState: null,
    sourceClass: null,
    hybrid: false,
    status: 'proposed',
    excludedFromClient: false,
    source: 'edited',
  };
  return { ...facts, classifications: [...facts.classifications, fresh] };
}
