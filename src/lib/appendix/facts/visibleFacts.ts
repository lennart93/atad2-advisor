import type { AppendixFacts } from '../types';

/** Facts with advisor-hidden entities removed, cascading to anything that references them. */
export function visibleFacts(facts: AppendixFacts): AppendixFacts {
  const hidden = new Set(facts.entities.filter((e) => e.hidden).map((e) => e.id));
  if (hidden.size === 0) return facts;
  return {
    entities: facts.entities.filter((e) => !e.hidden),
    classifications: facts.classifications.filter((c) => !hidden.has(c.entityId)),
    transactions: facts.transactions.filter((t) => !hidden.has(t.fromEntityId) && !hidden.has(t.toEntityId)),
    actingTogether: facts.actingTogether.filter((a) => !a.memberEntityIds.some((id) => hidden.has(id))),
  };
}
