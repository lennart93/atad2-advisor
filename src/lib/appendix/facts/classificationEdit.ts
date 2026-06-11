import type { AppendixFacts, ClassificationItem } from '@/lib/appendix/types';

/**
 * Advisor sets the local (home-state) qualification of an entity in the
 * classification section. Updates the existing classification row or inserts a
 * minimal one; source 'edited' makes it survive regeneration (mergeFacts keys
 * classification rows by entityId and keeps confirmed/edited rows).
 */
export function withLocalQualification(
  facts: AppendixFacts,
  entityId: string,
  homeClass: 'transparent' | 'opaque',
  homeState: string | null,
): AppendixFacts {
  const existing = facts.classifications.find((c) => c.entityId === entityId);
  if (existing) {
    return {
      ...facts,
      classifications: facts.classifications.map((c) =>
        c.entityId === entityId ? { ...c, homeClass, source: 'edited' } : c,
      ),
    };
  }
  const fresh: ClassificationItem = {
    entityId,
    homeState: homeState ?? '',
    homeClass,
    sourceState: null,
    sourceClass: null,
    hybrid: false,
    status: 'proposed',
    excludedFromClient: false,
    source: 'edited',
  };
  return { ...facts, classifications: [...facts.classifications, fresh] };
}
