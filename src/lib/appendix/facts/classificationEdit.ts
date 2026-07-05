import type { AppendixFacts, ClassificationItem } from '@/lib/appendix/types';

/**
 * Advisor sets the local (home-state) qualification of an entity. 'unknown'
 * clears it back to "to be determined" and STAYS cleared across regeneration
 * (the edited row blocks a fresh AI proposal), exactly like a positive choice.
 * Updates the existing classification row or inserts a minimal one; source
 * 'edited' makes it survive regeneration (mergeFacts keeps edited rows), and
 * the advisor's decision counts as confirmed: factsForClient drops 'proposed'
 * rows, so without the flip a hand-set classification would show on screen but
 * silently vanish from the Word memo and the dossier export.
 */
export function withLocalQualification(
  facts: AppendixFacts,
  entityId: string,
  homeClass: 'transparent' | 'opaque' | 'reverse_hybrid' | 'unknown',
  homeState: string | null,
): AppendixFacts {
  const stored = homeClass === 'unknown' ? '' : homeClass === 'reverse_hybrid' ? 'reverse hybrid' : homeClass;
  const existing = facts.classifications.find((c) => c.entityId === entityId);
  if (existing) {
    return {
      ...facts,
      classifications: facts.classifications.map((c) =>
        c.entityId === entityId
          ? { ...c, homeClass: stored, hybrid: false, status: 'confirmed', source: 'edited' }
          : c,
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
    status: 'confirmed',
    excludedFromClient: false,
    source: 'edited',
  };
  return { ...facts, classifications: [...facts.classifications, fresh] };
}
