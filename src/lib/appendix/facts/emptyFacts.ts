import type { AppendixFacts } from '@/lib/appendix/types';

export function emptyFacts(): AppendixFacts {
  return { entities: [], actingTogether: [], classifications: [], transactions: [] };
}

/** Tolerate null/partial facts loaded from older rows: always return all four arrays. */
export function normalizeFacts(facts: Partial<AppendixFacts> | null | undefined): AppendixFacts {
  return {
    entities: Array.isArray(facts?.entities) ? facts!.entities : [],
    actingTogether: Array.isArray(facts?.actingTogether) ? facts!.actingTogether : [],
    classifications: Array.isArray(facts?.classifications) ? facts!.classifications : [],
    transactions: Array.isArray(facts?.transactions) ? facts!.transactions : [],
  };
}
