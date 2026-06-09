import type { AppendixFacts, ActingTogetherCluster } from '@/lib/appendix/types';
import type { ActingLikelihood } from './actingLikelihood';

function patch(
  facts: AppendixFacts,
  id: string,
  fn: (c: ActingTogetherCluster) => ActingTogetherCluster,
): AppendixFacts {
  return { ...facts, actingTogether: facts.actingTogether.map((c) => (c.id === id ? fn(c) : c)) };
}

/** Pick the likelihood level. The single assessment text is left as written/edited. */
export function withClusterLikelihood(facts: AppendixFacts, id: string, level: ActingLikelihood): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, likelihood: level, source: 'edited' }));
}

/** Hand-edit the assessment text. */
export function withClusterText(facts: AppendixFacts, id: string, reasoning: string): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, reasoning, source: 'edited' }));
}

/** Toggle exclude-from-client (a scope flag, not a content edit). */
export function withClusterExclude(facts: AppendixFacts, id: string, excluded: boolean): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, excludedFromClient: excluded }));
}
