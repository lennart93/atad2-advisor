import type { AppendixFacts, ActingTogetherCluster } from '@/lib/appendix/types';
import type { ActingLikelihood } from './actingLikelihood';

function patch(
  facts: AppendixFacts,
  id: string,
  fn: (c: ActingTogetherCluster) => ActingTogetherCluster,
): AppendixFacts {
  return { ...facts, actingTogether: facts.actingTogether.map((c) => (c.id === id ? fn(c) : c)) };
}

/** Pick a level: swap the displayed reasoning to that level's pre-generated text. */
export function withClusterLikelihood(facts: AppendixFacts, id: string, level: ActingLikelihood): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, likelihood: level, reasoning: c.rationales[level] ?? c.reasoning, source: 'edited' }));
}

/** Hand-edit the rationale text for the current level. */
export function withClusterText(facts: AppendixFacts, id: string, reasoning: string): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, reasoning, source: 'edited' }));
}

/** Toggle exclude-from-client (a scope flag, not a content edit). */
export function withClusterExclude(facts: AppendixFacts, id: string, excluded: boolean): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, excludedFromClient: excluded }));
}
