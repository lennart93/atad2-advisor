import { describe, it, expect } from 'vitest';
// The Deno edge-function copy. Deno cannot import from src/, so the tombstone
// logic lives there and vitest reaches in directly (same pattern as
// crossMirror.test.ts), so a regression fails here before it ships.
import {
  applyRemovalTombstones, txMergeKey as txMergeKeyDeno,
  type AppendixFacts, type FactEntity, type TransactionItem, type ActingTogetherCluster,
} from '../../../../supabase/functions/generate-appendix/factsBuild';
import { txMergeKey as txMergeKeyFrontend } from '@/lib/appendix/facts/transactionSet';

const ent = (id: string, chartId: string, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: chartId, name: `Entity ${id}`, jurisdiction: 'NL', entityType: 'corporation',
  role: 'Group entity', ownershipPct: 100, related: true, nlTaxStatus: null, ...patch,
});
const tx = (id: string, from: string, to: string, kind = 'loan'): TransactionItem => ({
  id, fromEntityId: from, toEntityId: to, kind, instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai',
});
const group = (id: string, members: string[]): ActingTogetherCluster => ({
  id, memberEntityIds: members, combinedPct: 50, likelihood: 'unclear',
  reasoning: 'x', excludedFromClient: false, source: 'ai',
});
const freshFacts = (patch: Partial<AppendixFacts> = {}): AppendixFacts => ({
  entities: [
    ent('E1', 'c1', { role: 'Taxpayer', related: false }),
    ent('E2', 'c2'),
    ent('E3', 'c3'),
  ],
  classifications: [
    { entityId: 'E2', homeState: 'US', homeClass: 'opaque', sourceState: 'NL', sourceClass: 'opaque', hybrid: false, status: 'proposed', excludedFromClient: false, source: 'ai' },
  ],
  transactions: [tx('T1', 'E1', 'E2'), tx('T2', 'E1', 'E3', 'royalty')],
  actingTogether: [group('A1', ['E2', 'E3'])],
  ...patch,
});

describe('applyRemovalTombstones (Deno mergeFacts pre-filter)', () => {
  it('is a no-op without tombstones (same object back)', () => {
    const fresh = freshFacts();
    expect(applyRemovalTombstones(null, fresh)).toBe(fresh);
    expect(applyRemovalTombstones({}, fresh)).toBe(fresh);
  });

  it('drops a tombstoned entity and cascades to classification, transactions and memberships', () => {
    const out = applyRemovalTombstones({ removedChartEntityIds: ['c2'] }, freshFacts());
    expect(out.entities.map((e) => e.id)).toEqual(['E1', 'E3']);
    expect(out.classifications).toHaveLength(0);
    expect(out.transactions.map((t) => t.id)).toEqual(['T2']);
    expect(out.actingTogether[0].memberEntityIds).toEqual(['E3']);
  });

  it('drops an acting-together group left without members', () => {
    const fresh = freshFacts({ actingTogether: [group('A1', ['E2'])] });
    const out = applyRemovalTombstones({ removedChartEntityIds: ['c2'] }, fresh);
    expect(out.actingTogether).toHaveLength(0);
  });

  it('drops a transaction whose merge key is tombstoned, leaving its parties alone', () => {
    const out = applyRemovalTombstones({ removedTxKeys: ['E1|E2|loan'] }, freshFacts());
    expect(out.transactions.map((t) => t.id)).toEqual(['T2']);
    expect(out.entities).toHaveLength(3);
    expect(out.classifications).toHaveLength(1);
  });

  it('an unmatched tombstone removes nothing', () => {
    const out = applyRemovalTombstones(
      { removedChartEntityIds: ['c-gone'], removedTxKeys: ['E9|E8|swap'] },
      freshFacts(),
    );
    expect(out.entities).toHaveLength(3);
    expect(out.transactions).toHaveLength(2);
  });
});

describe('cross-mirror: txMergeKey (frontend vs Deno)', () => {
  it('both sides produce the identical key for the same flow', () => {
    const flow = { fromEntityId: 'E1', toEntityId: 'E2', kind: 'Interest on loan' };
    expect(txMergeKeyFrontend(flow)).toBe(txMergeKeyDeno(flow));
  });
});
