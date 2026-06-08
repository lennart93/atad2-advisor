import type { AppendixFacts } from './types';

const keep = <T extends { status?: string; excludedFromClient?: boolean }>(xs: T[]) =>
  xs.filter((x) => x.status !== 'proposed' && !x.excludedFromClient);

/** The clean, client-facing facts: confirmed and non-excluded items only. */
export function factsForClient(facts: AppendixFacts): AppendixFacts {
  return {
    entities: facts.entities,
    actingTogether: facts.actingTogether.filter((a) => a.status === 'confirmed' && !a.excludedFromClient),
    classifications: keep(facts.classifications),
    transactions: keep(facts.transactions),
  };
}
