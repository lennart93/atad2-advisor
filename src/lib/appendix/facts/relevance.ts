import type { AppendixFacts, TransactionItem } from '@/lib/appendix/types';

/** Missing flag = relevant: the safe default for old sessions and partial AI output. */
export function isTransactionRelevant(t: TransactionItem): boolean {
  return t.relevant !== false;
}

export function relevantTransactions(facts: AppendixFacts): TransactionItem[] {
  return facts.transactions.filter(isTransactionRelevant);
}

export interface AccountedGroup {
  reason: string;
  transactions: TransactionItem[];
}

const FALLBACK_REASON = 'Assessed as not relevant';

/** Non-relevant transactions grouped by reason, insertion-ordered, for the accounted summary lines. */
export function accountedTransactionGroups(facts: AppendixFacts): AccountedGroup[] {
  const groups = new Map<string, TransactionItem[]>();
  for (const t of facts.transactions) {
    if (isTransactionRelevant(t)) continue;
    const reason = t.relevanceReason?.trim() || FALLBACK_REASON;
    const arr = groups.get(reason) ?? [];
    arr.push(t);
    groups.set(reason, arr);
  }
  return [...groups.entries()].map(([reason, transactions]) => ({ reason, transactions }));
}

/** Advisor flips a relevance marking; the flip survives regeneration via mergeFacts. */
export function withTransactionRelevance(facts: AppendixFacts, id: string, relevant: boolean): AppendixFacts {
  return {
    ...facts,
    transactions: facts.transactions.map((t) =>
      t.id === id ? { ...t, relevant, source: 'edited' } : t,
    ),
  };
}
