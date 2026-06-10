import { describe, it, expect } from 'vitest';
import {
  isTransactionRelevant, relevantTransactions, accountedTransactionGroups, withTransactionRelevance,
} from '@/lib/appendix/facts/relevance';
import type { AppendixFacts, TransactionItem } from '@/lib/appendix/types';

const tx = (id: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id, fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});

const facts = (transactions: TransactionItem[]): AppendixFacts => ({
  entities: [], actingTogether: [], classifications: [], transactions,
});

describe('relevance', () => {
  it('treats a missing relevant flag as relevant (old sessions)', () => {
    expect(isTransactionRelevant(tx('T1'))).toBe(true);
    expect(isTransactionRelevant(tx('T2', { relevant: false }))).toBe(false);
  });

  it('splits relevant vs accounted, grouping accounted by reason', () => {
    const f = facts([
      tx('T1', { relevant: true, relevanceReason: 'Cross-border to a related party' }),
      tx('T2', { relevant: false, relevanceReason: 'Within the fiscal unity' }),
      tx('T3', { relevant: false, relevanceReason: 'Within the fiscal unity' }),
      tx('T4', { relevant: false, relevanceReason: null }),
    ]);
    expect(relevantTransactions(f).map((t) => t.id)).toEqual(['T1']);
    const groups = accountedTransactionGroups(f);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ reason: 'Within the fiscal unity' });
    expect(groups[0].transactions.map((t) => t.id)).toEqual(['T2', 'T3']);
    expect(groups[1].reason).toBe('Assessed as not relevant');
  });

  it('withTransactionRelevance flips the flag and marks the item edited', () => {
    const f = facts([tx('T1', { relevant: true })]);
    const next = withTransactionRelevance(f, 'T1', false);
    expect(next.transactions[0]).toMatchObject({ relevant: false, source: 'edited' });
  });
});
