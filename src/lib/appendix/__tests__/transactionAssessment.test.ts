import { describe, it, expect } from 'vitest';
import type { AppendixFacts, FactEntity, TransactionItem, ClassificationItem } from '@/lib/appendix/types';
import {
  effTxStatus, deriveTxStatus, txStatusReason, txStatusLabel, txMemoReason,
  effCrossBorder, effHybridEntityMismatch, effHybridInstrument, effImportedMismatch,
  needsAssessmentTransactions, noRiskTransactions,
  withTxCharacteristic, withTxRationale, withTxStatusOverride, withTxField,
  isTxStatusOverridden,
} from '@/lib/appendix/facts/transactionAssessment';

const ent = (id: string, jur: string | null, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: `c-${id}`, name: id, jurisdiction: jur, entityType: 'corporation',
  role: 'Group entity', ownershipPct: null, related: true, nlTaxStatus: 'resident', ...patch,
});
const cls = (entityId: string, patch: Partial<ClassificationItem> = {}): ClassificationItem => ({
  entityId, homeState: 'US', homeClass: 'opaque', sourceState: 'NL', sourceClass: 'opaque',
  hybrid: false, status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});
const tx = (id: string, from: string, to: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id, fromEntityId: from, toEntityId: to, kind: 'loan', instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});
const facts = (entities: FactEntity[], transactions: TransactionItem[], classifications: ClassificationItem[] = []): AppendixFacts => ({
  entities, actingTogether: [], classifications, transactions,
});

describe('seed reproduces the AI bucket while naming the reason', () => {
  it('cross-border, AI-relevant, unset foreign view -> needs, possible hybrid entity mismatch', () => {
    const f = facts([ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US')], [tx('T1', 'E1', 'E2')]);
    expect(effTxStatus(f, f.transactions[0])).toBe('needs');
    expect(effCrossBorder(f, f.transactions[0])).toBe('yes');
    expect(effHybridEntityMismatch(f, f.transactions[0])).toBe('tbd');
    expect(txStatusReason(f, f.transactions[0])).toBe('possible hybrid entity mismatch');
  });

  it('cross-border, AI-relevant, no entity reason -> needs, possible hybrid financial instrument', () => {
    // Both classifications resolved and equal: no entity mismatch, so the open item
    // is the instrument itself.
    const f = facts(
      [ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US', { nlTaxStatus: 'resident' })],
      [tx('T1', 'E1', 'E2')],
      [cls('E2', { homeClass: 'opaque' })], // local non-transparent == NL non-transparent, no diff
    );
    expect(effHybridEntityMismatch(f, f.transactions[0])).toBe('no');
    expect(effHybridInstrument(f, f.transactions[0])).toBe('tbd');
    expect(txStatusReason(f, f.transactions[0])).toBe('possible hybrid financial instrument');
  });

  it('confirmed hybrid difference -> needs, hybrid entity mismatch', () => {
    const f = facts(
      [ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US', { nlTaxStatus: 'transparent' })],
      [tx('T1', 'E1', 'E2')],
      [cls('E2', { homeClass: 'opaque' })], // NL transparent vs local opaque -> real mismatch
    );
    expect(effHybridEntityMismatch(f, f.transactions[0])).toBe('yes');
    expect(txStatusReason(f, f.transactions[0])).toBe('hybrid entity mismatch');
  });

  it('a domestic flow with a missing relevant flag is no risk, not auto-needs', () => {
    const f = facts([ent('E1', 'NL', { role: 'Taxpayer' }), ent('E3', 'NL')], [tx('T2', 'E1', 'E3')]);
    expect(effCrossBorder(f, f.transactions[0])).toBe('no');
    expect(effTxStatus(f, f.transactions[0])).toBe('no_risk');
    expect(txStatusLabel(f, f.transactions[0])).toBe('No risk identified');
  });

  it('an AI-not-relevant flow stays no risk', () => {
    const f = facts([ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US')], [tx('T1', 'E1', 'E2', { relevant: false, relevanceReason: 'Within the fiscal unity' })]);
    expect(effTxStatus(f, f.transactions[0])).toBe('no_risk');
    expect(txMemoReason(f, f.transactions[0])).toBe('Within the fiscal unity');
  });
});

describe('editing a characteristic moves the status and the memo line', () => {
  const base = facts([ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US')], [tx('T1', 'E1', 'E2', { relevant: false })]);

  it('setting hybrid financial instrument = Yes flips a cleared flow to needs', () => {
    expect(effTxStatus(base, base.transactions[0])).toBe('no_risk');
    const next = withTxCharacteristic(base, 'T1', 'hybridInstrument', 'yes');
    const t = next.transactions[0];
    expect(effHybridInstrument(next, t)).toBe('yes');
    expect(effTxStatus(next, t)).toBe('needs');
    expect(txStatusLabel(next, t)).toBe('Needs assessment · hybrid financial instrument');
    expect(t.source).toBe('edited');
  });

  it('the rationale becomes the memo line', () => {
    const next = withTxRationale(base, 'T1', 'Ordinary trade payable, no hybrid feature.');
    expect(txMemoReason(next, next.transactions[0])).toBe('Ordinary trade payable, no hybrid feature.');
  });

  it('setting cross-border = No relaxes the mismatch seeds to N/A', () => {
    const f = facts([ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US')], [tx('T1', 'E1', 'E2')]);
    expect(effTxStatus(f, f.transactions[0])).toBe('needs');
    const next = withTxCharacteristic(f, 'T1', 'crossBorder', 'no');
    const t = next.transactions[0];
    expect(effHybridEntityMismatch(next, t)).toBe('na');
    expect(effImportedMismatch(next, t)).toBe('na');
    expect(effTxStatus(next, t)).toBe('no_risk');
  });
});

describe('status override', () => {
  const f = facts([ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US')], [tx('T1', 'E1', 'E2')]);

  it('forces no risk even when a category is open, and carries the reason into the memo', () => {
    expect(deriveTxStatus(f, f.transactions[0])).toBe('needs');
    const next = withTxStatusOverride(f, 'T1', 'no_risk', 'Instrument is plain equity, no mismatch.');
    const t = next.transactions[0];
    expect(isTxStatusOverridden(t)).toBe(true);
    expect(effTxStatus(next, t)).toBe('no_risk');
    expect(txMemoReason(next, t)).toBe('Instrument is plain equity, no mismatch.');
  });

  it('clearing the override falls back to the derived status', () => {
    const overridden = withTxStatusOverride(f, 'T1', 'no_risk', 'x');
    const cleared = withTxStatusOverride(overridden, 'T1', null, null);
    const t = cleared.transactions[0];
    expect(isTxStatusOverridden(t)).toBe(false);
    expect(effTxStatus(cleared, t)).toBe('needs');
  });
});

describe('buckets and descriptive edits', () => {
  it('needs / no-risk buckets partition the transactions', () => {
    const f = facts(
      [ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US'), ent('E3', 'NL')],
      [tx('T1', 'E1', 'E2'), tx('T2', 'E1', 'E3'), tx('T3', 'E1', 'E2', { relevant: false })],
    );
    expect(needsAssessmentTransactions(f).map((t) => t.id)).toEqual(['T1']);
    expect(noRiskTransactions(f).map((t) => t.id)).toEqual(['T2', 'T3']);
  });

  it('withTxField edits a descriptive field and stamps the flow edited', () => {
    const f = facts([ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US')], [tx('T1', 'E1', 'E2')]);
    const next = withTxField(f, 'T1', { instrument: 'Shareholder loan' });
    expect(next.transactions[0].instrument).toBe('Shareholder loan');
    expect(next.transactions[0].source).toBe('edited');
  });
});
