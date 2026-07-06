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

/**
 * Advisor sets the country of a Dutch entity's foreign classification (the "how
 * another state classifies this NL entity" block). Stores an advisor-authored
 * (source 'edited') classification whose homeState is the picked country, leaving
 * the home-class for a separate pick. See dutchForeignClassification.
 */
export function withForeignClassificationState(
  facts: AppendixFacts,
  entityId: string,
  homeState: string | null,
): AppendixFacts {
  const state = homeState ?? '';
  const existing = facts.classifications.find((c) => c.entityId === entityId);
  if (existing) {
    return {
      ...facts,
      classifications: facts.classifications.map((c) =>
        c.entityId === entityId ? { ...c, homeState: state, status: 'confirmed', source: 'edited' } : c,
      ),
    };
  }
  const fresh: ClassificationItem = {
    entityId,
    homeState: state,
    homeClass: '',
    sourceState: null,
    sourceClass: null,
    hybrid: false,
    status: 'confirmed',
    excludedFromClient: false,
    source: 'edited',
  };
  return { ...facts, classifications: [...facts.classifications, fresh] };
}

/**
 * Drops an entity's foreign classification row entirely (the advisor removed the
 * block). Only used for a Dutch entity, whose sole classification row is the
 * hand-added foreign one, so removing it clears the block cleanly.
 */
export function clearForeignClassification(facts: AppendixFacts, entityId: string): AppendixFacts {
  return { ...facts, classifications: facts.classifications.filter((c) => c.entityId !== entityId) };
}
