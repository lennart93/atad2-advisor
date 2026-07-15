import { describe, it, expect } from 'vitest';
import {
  nextTransactionId, addManualTransaction, deleteManualTransaction, isSelfTransaction,
} from '@/lib/appendix/facts/transactionSet';
import { effTxStatus, withTxField } from '@/lib/appendix/facts/transactionAssessment';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts, FactEntity, TransactionItem } from '@/lib/appendix/types';

const taxpayer: FactEntity = {
  id: 'E1', chartEntityId: 'c1', name: 'NL Holding B.V.', jurisdiction: 'NL',
  entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident',
};
const foreign: FactEntity = {
  id: 'E2', chartEntityId: 'c2', name: 'US Opco LLC', jurisdiction: 'US',
  entityType: 'corporation', role: 'Group entity', ownershipPct: 100, related: true, nlTaxStatus: null,
};

const aiTx: TransactionItem = {
  id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null,
  note: null, articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai',
};

function facts(transactions: TransactionItem[] = []): AppendixFacts {
  return { ...emptyFacts(), entities: [taxpayer, foreign], transactions };
}

describe('nextTransactionId', () => {
  it('returns one past the highest T-number in use', () => {
    expect(nextTransactionId(facts())).toBe('T1');
    expect(nextTransactionId(facts([aiTx]))).toBe('T2');
    expect(nextTransactionId(facts([{ ...aiTx, id: 'T7' }]))).toBe('T8');
  });
});

describe('addManualTransaction', () => {
  it('appends a hand-added flow, stamped manual + edited, and returns its id', () => {
    const { facts: out, id } = addManualTransaction(facts([aiTx]), {
      fromEntityId: 'E2', toEntityId: 'E1', kind: '  Interest on intercompany loan ',
    });
    expect(id).toBe('T2');
    const tx = out.transactions.find((t) => t.id === id)!;
    expect(tx.manual).toBe(true);
    expect(tx.source).toBe('edited');
    expect(tx.kind).toBe('Interest on intercompany loan');
    expect(tx.excludedFromClient).toBe(false);
    expect(out.transactions).toHaveLength(2);
  });

  it('lands the new flow in "Needs assessment" so the advisor works through it', () => {
    const { facts: out, id } = addManualTransaction(facts(), {
      fromEntityId: 'E1', toEntityId: 'E2', kind: 'royalty',
    });
    const tx = out.transactions.find((t) => t.id === id)!;
    expect(effTxStatus(out, tx)).toBe('needs');
  });
});

describe('deleteManualTransaction', () => {
  it('removes a hand-added flow outright', () => {
    const { facts: withTx, id } = addManualTransaction(facts([aiTx]), {
      fromEntityId: 'E1', toEntityId: 'E2', kind: 'services',
    });
    const out = deleteManualTransaction(withTx, id);
    expect(out.transactions.map((t) => t.id)).toEqual(['T1']);
  });

  it('leaves an AI-identified flow alone', () => {
    const out = deleteManualTransaction(facts([aiTx]), 'T1');
    expect(out.transactions).toHaveLength(1);
  });
});

describe('self-transaction guards', () => {
  it('isSelfTransaction spots the same entity on both sides', () => {
    expect(isSelfTransaction({ fromEntityId: 'E5', toEntityId: 'E5' })).toBe(true);
    expect(isSelfTransaction({ fromEntityId: 'E1', toEntityId: 'E5' })).toBe(false);
  });

  it('addManualTransaction refuses a self-transaction outright', () => {
    expect(() => addManualTransaction(facts(), { fromEntityId: 'E1', toEntityId: 'E1', kind: 'loan' }))
      .toThrow(/two different entities/);
  });

  it('withTxField refuses a party edit that would create a self-transaction', () => {
    const next = withTxField(facts([aiTx]), 'T1', { toEntityId: 'E1' });
    expect(next.transactions[0].toEntityId).toBe('E2');
  });

  it('withTxField fixes an existing self-transaction to a valid counterparty', () => {
    const broken = facts([{ ...aiTx, id: 'T9', toEntityId: 'E1' }]);
    const fixed = withTxField(broken, 'T9', { toEntityId: 'E2' });
    expect(fixed.transactions[0].toEntityId).toBe('E2');
    expect(isSelfTransaction(fixed.transactions[0])).toBe(false);
  });
});
