import { describe, it, expect } from 'vitest';
import { bundleTransactions } from '../bundleTransactions';
import type { StructureEdge } from '../types';

function txn(from: string, to: string, overrides: Partial<StructureEdge> = {}): StructureEdge {
  return {
    id: `${from}-${to}-${Math.random()}`,
    chart_id: 'c1',
    from_entity_id: from,
    to_entity_id: to,
    kind: 'transaction',
    ownership_pct: null,
    ownership_voting_only: null,
    transaction_type: 'loan',
    amount_eur: 100,
    is_mismatch: false,
    mismatch_classification: null,
    mismatch_atad2_article: null,
    label: null,
    source: 'ai_extracted',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('bundleTransactions', () => {
  it('returns empty when focus set is empty', () => {
    expect(bundleTransactions([txn('a', 'b')], new Set())).toEqual([]);
  });

  it('produces one bundle for one focused entity with one transaction', () => {
    const r = bundleTransactions([txn('a', 'b', { amount_eur: 500 })], new Set(['a']));
    expect(r).toHaveLength(1);
    expect(r[0].transactions).toHaveLength(1);
    expect(r[0].totalAmount).toBe(500);
    expect(r[0].hasMismatch).toBe(false);
  });

  it('aggregates 3 transactions to same counterpart into 1 bundle', () => {
    const r = bundleTransactions(
      [
        txn('a', 'b', { amount_eur: 100 }),
        txn('a', 'b', { amount_eur: 200 }),
        txn('a', 'b', { amount_eur: 300 }),
      ],
      new Set(['a']),
    );
    expect(r).toHaveLength(1);
    expect(r[0].transactions).toHaveLength(3);
    expect(r[0].totalAmount).toBe(600);
  });

  it('produces separate bundles for different counterparts', () => {
    const r = bundleTransactions(
      [txn('a', 'b'), txn('a', 'c')],
      new Set(['a']),
    );
    expect(r).toHaveLength(2);
  });

  it('null amounts are excluded from totalAmount; all-null returns null', () => {
    const r1 = bundleTransactions(
      [txn('a', 'b', { amount_eur: 100 }), txn('a', 'b', { amount_eur: null })],
      new Set(['a']),
    );
    expect(r1[0].totalAmount).toBe(100);

    const r2 = bundleTransactions(
      [txn('a', 'b', { amount_eur: null }), txn('a', 'b', { amount_eur: null })],
      new Set(['a']),
    );
    expect(r2[0].totalAmount).toBeNull();
  });

  it('hasMismatch true when at least one transaction is mismatch', () => {
    const r = bundleTransactions(
      [txn('a', 'b'), txn('a', 'b', { is_mismatch: true })],
      new Set(['a']),
    );
    expect(r[0].hasMismatch).toBe(true);
  });

  it('A→B and B→A are separate bundles (directed)', () => {
    const r = bundleTransactions(
      [txn('a', 'b'), txn('b', 'a')],
      new Set(['a']),
    );
    expect(r).toHaveLength(2);
  });

  it('filters non-transaction edges', () => {
    const ownershipEdge: StructureEdge = { ...txn('a', 'b'), kind: 'ownership', transaction_type: null };
    const r = bundleTransactions([ownershipEdge, txn('a', 'c')], new Set(['a']));
    expect(r).toHaveLength(1);
    expect(r[0].to_entity_id).toBe('c');
  });

  it('includes bundles where focused entity is the target', () => {
    const r = bundleTransactions(
      [txn('b', 'a', { amount_eur: 250 })],
      new Set(['a']),
    );
    expect(r).toHaveLength(1);
    expect(r[0].from_entity_id).toBe('b');
    expect(r[0].to_entity_id).toBe('a');
    expect(r[0].totalAmount).toBe(250);
  });
});
