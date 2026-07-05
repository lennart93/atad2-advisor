import type { AppendixFacts, TransactionItem } from '@/lib/appendix/types';
import {
  isTransactionRelevant, needsAssessmentTransactions, noRiskTransactions, txMemoReason,
} from './transactionAssessment';

// The relevance buckets are now derived from the transaction assessment (the five
// editable characteristics + any override), not the raw AI flag. These thin
// wrappers keep the long-standing call sites (memo, print, conclusions, scope)
// pointed at a single source of truth.

/** Missing flag = relevant: the safe default for old sessions and partial AI output. */
export { isTransactionRelevant };

/** Every flow whose assessment lands it in "Needs assessment". */
export function relevantTransactions(facts: AppendixFacts): TransactionItem[] {
  return needsAssessmentTransactions(facts);
}

export interface AccountedGroup {
  reason: string;
  transactions: TransactionItem[];
}

/** "No risk identified" flows grouped by their memo reason, insertion-ordered, for the accounted summary lines. */
export function accountedTransactionGroups(facts: AppendixFacts): AccountedGroup[] {
  const groups = new Map<string, TransactionItem[]>();
  for (const t of noRiskTransactions(facts)) {
    const reason = txMemoReason(facts, t) || 'No hybrid element identified';
    const arr = groups.get(reason) ?? [];
    arr.push(t);
    groups.set(reason, arr);
  }
  return [...groups.entries()].map(([reason, transactions]) => ({ reason, transactions }));
}

/**
 * Advisor forces the "No risk identified" / "Needs assessment" bucket. Kept for the
 * few callers that only need the coarse flip; the panel uses the richer
 * withTxStatusOverride. The flip survives regeneration via mergeFacts.
 */
export function withTransactionRelevance(facts: AppendixFacts, id: string, relevant: boolean): AppendixFacts {
  return {
    ...facts,
    transactions: facts.transactions.map((t) =>
      t.id === id ? { ...t, relevant, relevanceReason: null, source: 'edited' } : t,
    ),
  };
}
