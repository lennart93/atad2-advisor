import { describe, it, expect } from 'vitest';
import type {
  AppendixFacts, AppendixRow, FactEntity, TransactionItem, ClassificationItem,
  ActingTogetherCluster, Status,
} from '@/lib/appendix/types';
import { appendixMootRowIds } from '@/lib/appendix/controlType';
import {
  txNeedsAttention, splitTransactions,
  entityNeedsAttention, classificationsById,
  groupNeedsAttention, actingSectionNeedsAttention, clientGroupCount,
  conditionNeedsAttention, partADigest, partBDigest, sectionWorstStatus,
} from '@/lib/appendix/needsAttention';

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
const group = (id: string, patch: Partial<ActingTogetherCluster> = {}): ActingTogetherCluster => ({
  id, memberEntityIds: [], combinedPct: null, likelihood: 'likely', reasoning: '',
  excludedFromClient: false, source: 'ai', ...patch,
});
const row = (rowId: string, status: Status | null, patch: Partial<AppendixRow> = {}): AppendixRow => ({
  rowId, aiStatus: status, aiReasoning: null, aiProvenance: null, status, reasoning: null,
  provenance: null, excludedFromClient: false, source: 'ai', stale: false, staleReason: null,
  editedBy: null, editedAt: null, ...patch,
});
const facts = (
  entities: FactEntity[], transactions: TransactionItem[] = [],
  extra: Partial<AppendixFacts> = {},
): AppendixFacts => ({
  entities, actingTogether: [], classifications: [], transactions, ...extra,
});

describe('txNeedsAttention / splitTransactions', () => {
  it('cross-border flow needs attention; domestic flow is routine', () => {
    const f = facts(
      [ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US'), ent('E3', 'NL')],
      [tx('T1', 'E1', 'E2'), tx('T2', 'E1', 'E3')],
    );
    expect(txNeedsAttention(f, f.transactions[0])).toBe(true);
    expect(txNeedsAttention(f, f.transactions[1])).toBe(false);
    const split = splitTransactions(f);
    expect(split.flagged.map((t) => t.id)).toEqual(['T1']);
    expect(split.routine.map((t) => t.id)).toEqual(['T2']);
  });
});

describe('entityNeedsAttention', () => {
  it('flags a missing jurisdiction', () => {
    const e = ent('E4', null);
    expect(entityNeedsAttention(e, undefined)).toBe(true);
  });
  it('flags a foreign entity with an open home-state classification', () => {
    const e = ent('E5', 'US', { entityType: null });
    expect(entityNeedsAttention(e, undefined)).toBe(true);
  });
  it('does not flag an NL entity', () => {
    const e = ent('E6', 'NL');
    expect(entityNeedsAttention(e, undefined)).toBe(false);
  });
  it('does not flag the taxpayer or a demoted entity', () => {
    expect(entityNeedsAttention(ent('E1', null, { role: 'Taxpayer' }), undefined)).toBe(false);
    expect(entityNeedsAttention(ent('E7', null, { edits: { relevanceOverride: 'out' } }), undefined)).toBe(false);
  });
  it('a resolved foreign classification clears the flag', () => {
    const e = ent('E8', 'US', { entityType: null });
    expect(entityNeedsAttention(e, cls('E8', { homeClass: 'opaque' }))).toBe(false);
  });
});

describe('acting-together', () => {
  it('an AI hint needs attention, a manual group is settled', () => {
    expect(groupNeedsAttention(group('A1'))).toBe(true);
    expect(groupNeedsAttention(group('A2', { origin: 'manual' }))).toBe(false);
  });
  it('section needs attention when a hint exists', () => {
    const f = facts([ent('E1', 'NL', { role: 'Taxpayer' })], [], { actingTogether: [group('A1')] });
    expect(actingSectionNeedsAttention(f)).toBe(true);
  });
  it('a settled manual-only section does not need attention', () => {
    const f = facts([ent('E1', 'NL', { role: 'Taxpayer' })], [], { actingTogether: [group('A1', { origin: 'manual' })] });
    expect(actingSectionNeedsAttention(f)).toBe(false);
    expect(clientGroupCount(f)).toBe(1);
  });
});

describe('conditionNeedsAttention', () => {
  const moot = (rows: AppendixRow[]) => appendixMootRowIds(rows.map((r) => ({ rowId: r.rowId, status: r.status })));
  it('flags a triggered substantive condition', () => {
    const r = row('3.1', 'Triggered');
    expect(conditionNeedsAttention(r, moot([r]))).toBe(true);
  });
  it('flags an insufficient-information condition', () => {
    const r = row('3.1', 'Insufficient information');
    expect(conditionNeedsAttention(r, moot([r]))).toBe(true);
  });
  it('flags an ungrounded row', () => {
    const r = row('3.2', 'N/A', { ungrounded: true });
    expect(conditionNeedsAttention(r, moot([r]))).toBe(true);
  });
  it('does not flag a gate, a clean test or an N/A row', () => {
    const gate = row('1.1', 'Triggered');       // gate row -> never a finding
    const clean = row('3.1', 'Not triggered');   // risk_if_met, not triggered -> clear
    const na = row('4.1', 'N/A');
    const set = moot([gate, clean, na]);
    expect(conditionNeedsAttention(gate, set)).toBe(false);
    expect(conditionNeedsAttention(clean, set)).toBe(false);
    expect(conditionNeedsAttention(na, set)).toBe(false);
  });
});

describe('digests', () => {
  it('partADigest counts entities/groups/transactions and total flagged', () => {
    const f = facts(
      [ent('E1', 'NL', { role: 'Taxpayer' }), ent('E2', 'US'), ent('E9', null)],
      [tx('T1', 'E1', 'E2'), tx('T2', 'E1', 'E1')],
      { actingTogether: [group('A1', { origin: 'manual' })] },
    );
    const d = partADigest(f);
    expect(d.entities).toBe(3);
    expect(d.groups).toBe(1);
    expect(d.transactions).toBe(2);
    // E9 (missing jur) + T1 (cross-border) flagged; T2 domestic, manual group settled.
    expect(d.needReview).toBe(2);
  });
  it('partBDigest counts conditions and flagged findings', () => {
    const rows = [row('1.1', 'Triggered'), row('3.1', 'Triggered'), row('3.2', 'Not triggered')];
    const d = partBDigest(rows);
    expect(d.conditions).toBe(3);
    expect(d.needReview).toBe(1); // only 3.1
  });
});

describe('sectionWorstStatus', () => {
  it('returns the most severe substantive status', () => {
    const rows = [row('3.1', 'Not triggered'), row('3.2', 'Triggered'), row('3.3', 'Insufficient information')];
    const set = appendixMootRowIds(rows.map((r) => ({ rowId: r.rowId, status: r.status })));
    expect(sectionWorstStatus(rows, set)).toBe('Triggered');
  });
  it('ignores gate rows', () => {
    const rows = [row('1.1', 'Triggered'), row('3.1', 'Not triggered')];
    const set = appendixMootRowIds(rows.map((r) => ({ rowId: r.rowId, status: r.status })));
    expect(sectionWorstStatus(rows, set)).toBe('Not triggered');
  });
});
