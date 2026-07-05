import type { AppendixFacts } from './types';
import { visibleFacts } from './facts/visibleFacts';
import { actingInClientReport } from './facts/actingAnnex';

const keep = <T extends { status?: string; excludedFromClient?: boolean }>(xs: T[]) =>
  xs.filter((x) => x.status !== 'proposed' && !x.excludedFromClient);

/** The clean, client-facing facts: hidden entities stripped first, then confirmed and non-excluded items only. */
export function factsForClient(facts: AppendixFacts): AppendixFacts {
  const f = visibleFacts(facts);
  return {
    entities: f.entities,
    // Only the advisor's manually-built groups reach the client (the group
    // builder is the leading input); AI suggestions stay internal as hints unless
    // adopted. A hidden manual group is left out too.
    actingTogether: f.actingTogether.filter(actingInClientReport),
    classifications: keep(f.classifications),
    // Transactions drop only on an explicit advisor exclusion. The generator
    // stores every AI flow as 'proposed' and no flow ever flips to 'confirmed'
    // (confirming the appendix is page-level), so filtering 'proposed' here
    // silently emptied the transactions table in every client export
    // (handoff 68, fix 3). Every identified flow is listed, none summarised away.
    transactions: f.transactions.filter((t) => !t.excludedFromClient),
    excludedSections: facts.excludedSections,
  };
}
