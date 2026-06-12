import type { AppendixFacts } from './types';
import { visibleFacts } from './facts/visibleFacts';

const keep = <T extends { status?: string; excludedFromClient?: boolean }>(xs: T[]) =>
  xs.filter((x) => x.status !== 'proposed' && !x.excludedFromClient);

/** The clean, client-facing facts: hidden entities stripped first, then confirmed and non-excluded items only. */
export function factsForClient(facts: AppendixFacts): AppendixFacts {
  const f = visibleFacts(facts);
  return {
    entities: f.entities,
    // Only clusters the advisor left at likely or higher reach the client; the
    // rest is summarized in the accounted line (spec: funnel design, section C).
    actingTogether: f.actingTogether.filter(
      (a) => !a.excludedFromClient && (a.likelihood === 'likely' || a.likelihood === 'highly_likely'),
    ),
    classifications: keep(f.classifications),
    transactions: keep(f.transactions),
    excludedSections: facts.excludedSections,
  };
}
