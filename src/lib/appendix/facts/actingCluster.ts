import type { AppendixFacts, ActingTogetherCluster } from '@/lib/appendix/types';
import type { ActingLikelihood } from './actingLikelihood';

function patch(
  facts: AppendixFacts,
  id: string,
  fn: (c: ActingTogetherCluster) => ActingTogetherCluster,
): AppendixFacts {
  return { ...facts, actingTogether: facts.actingTogether.map((c) => (c.id === id ? fn(c) : c)) };
}

/**
 * Pick the likelihood level. When the AI prepared a text for that level, the
 * displayed reasoning swaps along; without one the current text is kept.
 */
export function withClusterLikelihood(facts: AppendixFacts, id: string, level: ActingLikelihood): AppendixFacts {
  return patch(facts, id, (c) => ({
    ...c,
    likelihood: level,
    reasoning: c.rationales?.[level]?.trim() || c.reasoning,
    source: 'edited',
  }));
}

/**
 * Advisor-curated membership. The AI's combinedPct no longer describes the new
 * set, so it is cleared; the per-level texts are kept as a starting point.
 */
export function withClusterMembers(facts: AppendixFacts, id: string, memberEntityIds: string[]): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, memberEntityIds, combinedPct: null, source: 'edited' }));
}

/** Hand-edit the assessment text. */
export function withClusterText(facts: AppendixFacts, id: string, reasoning: string): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, reasoning, source: 'edited' }));
}

/** Toggle exclude-from-client (a scope flag, not a content edit). */
export function withClusterExclude(facts: AppendixFacts, id: string, excluded: boolean): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, excludedFromClient: excluded }));
}
