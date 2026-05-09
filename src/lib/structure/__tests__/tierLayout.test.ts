import { describe, it, expect } from 'vitest';
import { selectAnchor, assignRanks, tierLayout, clusterId } from '@/lib/structure/tierLayout';
import type { Cluster } from '@/lib/structure/relevance';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const ent = (id: string, overrides: Partial<StructureEntity> = {}): StructureEntity => ({
  id, chart_id: 'c1', name: id, legal_form: null, jurisdiction_iso: 'NL',
  entity_type: 'corporation', is_taxpayer: false,
  position_x: 0, position_y: 0, source: 'ai_extracted',
  created_at: '', updated_at: '', ...overrides,
});

const ownEdge = (from: string, to: string): StructureEdge => ({
  id: `${from}->${to}`, chart_id: 'c1',
  from_entity_id: from, to_entity_id: to, kind: 'ownership',
  ownership_pct: 100, ownership_voting_only: null,
  transaction_type: null, amount_eur: null, is_mismatch: false,
  mismatch_classification: null, mismatch_atad2_article: null,
  label: null, source: 'ai_extracted', created_at: '', updated_at: '',
});

describe('selectAnchor', () => {
  it('picks the entity with is_taxpayer=true', () => {
    const a = ent('a');
    const b = ent('b', { is_taxpayer: true });
    expect(selectAnchor([a, b], [])).toBe('b');
  });

  it('falls back to UPE when no taxpayer flag', () => {
    const a = ent('a');
    const b = ent('b');
    expect(selectAnchor([a, b], [ownEdge('a', 'b')])).toBe('a');
  });

  it('returns null for empty input', () => {
    expect(selectAnchor([], [])).toBeNull();
  });
});

describe('assignRanks', () => {
  it('places taxpayer at rank 0, parent at -1, child at +1', () => {
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const ranks = assignRanks([p, tx, c], [ownEdge('p', 'tx'), ownEdge('tx', 'c')], 'tx');
    expect(ranks.get('tx')).toBe(0);
    expect(ranks.get('p')).toBe(-1);
    expect(ranks.get('c')).toBe(1);
  });

  it('orphans (no path to taxpayer) are not in the ranks map', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const orphan = ent('orphan');
    const ranks = assignRanks([tx, orphan], [], 'tx');
    expect(ranks.has('orphan')).toBe(false);
  });
});

describe('tierLayout', () => {
  it('places taxpayer at Y=0 (top of rendered) when no parents; child below', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [tx, c],
      ownershipEdges: [ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('tx')!.y).toBe(0);
    expect(result.positions.get('c')!.y).toBe(160);
  });

  it('places parent above taxpayer above child (3 ranks)', () => {
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [p, tx, c],
      ownershipEdges: [ownEdge('p', 'tx'), ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('p')!.y).toBe(0);
    expect(result.positions.get('tx')!.y).toBe(160);
    expect(result.positions.get('c')!.y).toBe(320);
  });

  it('orphans land in the orphans array, not in positions', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const orphan = ent('orphan');
    const result = tierLayout({
      entities: [tx, orphan],
      ownershipEdges: [],
      clusters: [],
    });
    expect(result.positions.has('orphan')).toBe(false);
    expect(result.orphans.map((e) => e.id)).toEqual(['orphan']);
  });

  it('siblings within a tier are evenly spread and centered around X=0', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const c1 = ent('c1');
    const c2 = ent('c2');
    const c3 = ent('c3');
    const result = tierLayout({
      entities: [tx, c1, c2, c3],
      ownershipEdges: [ownEdge('tx', 'c1'), ownEdge('tx', 'c2'), ownEdge('tx', 'c3')],
      clusters: [],
    });
    const xs = ['c1', 'c2', 'c3'].map((id) => result.positions.get(id)!.x).sort((a, b) => a - b);
    // HORIZ_SEP = 180 → centered: -180, 0, 180
    expect(xs[0]).toBe(-180);
    expect(xs[1]).toBe(0);
    expect(xs[2]).toBe(180);
  });

  it('a single entity in a tier sits at X=0', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [tx, c],
      ownershipEdges: [ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('c')!.x).toBe(0);
  });

  it('cluster placeholders are positioned at parent.rank + 1', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const b = ent('b');
    const cluster: Cluster = { parent_id: 'tx', member_ids: ['a', 'b'] };
    const result = tierLayout({
      entities: [tx, a, b],
      ownershipEdges: [ownEdge('tx', 'a'), ownEdge('tx', 'b')],
      clusters: [cluster],
    });
    const cId = clusterId(cluster);
    // tx at rank 0 (Y=0); cluster at Y=160 (rank +1)
    expect(result.clusterPositions.get(cId)!.y).toBe(160);
    expect(result.positions.has('a')).toBe(false);
    expect(result.positions.has('b')).toBe(false);
  });

  it('returns ranksRendered ascending', () => {
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [p, tx, c],
      ownershipEdges: [ownEdge('p', 'tx'), ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.ranksRendered).toEqual([-1, 0, 1]);
  });
});
