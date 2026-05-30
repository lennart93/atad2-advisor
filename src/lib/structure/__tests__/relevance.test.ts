import { describe, it, expect } from 'vitest';
import { isAtad2Relevant, groupNonRelevantSiblings } from '@/lib/structure/relevance';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const ent = (id: string, overrides: Partial<StructureEntity> = {}): StructureEntity => ({
  id, chart_id: 'c1', name: id, legal_form: null, jurisdiction_iso: 'NL',
  entity_type: 'corporation', is_taxpayer: false,
  position_x: 0, position_y: 0, source: 'ai_extracted',
  created_at: '', updated_at: '', ...overrides,
});

const ownEdge = (from: string, to: string, id = `${from}->${to}`): StructureEdge => ({
  id, chart_id: 'c1', from_entity_id: from, to_entity_id: to, kind: 'ownership',
  ownership_pct: 100, ownership_voting_only: null,
  transaction_type: null, amount_eur: null, is_mismatch: false,
  mismatch_classification: null, mismatch_atad2_article: null,
  label: null, source: 'ai_extracted', created_at: '', updated_at: '',
});

describe('isAtad2Relevant', () => {
  it('returns true for the taxpayer', () => {
    const tx = ent('tx', { is_taxpayer: true });
    expect(isAtad2Relevant(tx, [tx], [], 'tx')).toBe(true);
  });

  it('returns true for an ancestor of the taxpayer', () => {
    const parent = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const edges = [ownEdge('p', 'tx')];
    expect(isAtad2Relevant(parent, [parent, tx], edges, 'tx')).toBe(true);
  });

  it('returns true for hybrid entity types', () => {
    const dh = ent('dh', { entity_type: 'dh_entity' });
    const hp = ent('hp', { entity_type: 'hybrid_partnership' });
    const rh = ent('rh', { entity_type: 'reverse_hybrid' });
    expect(isAtad2Relevant(dh, [dh], [], '')).toBe(true);
    expect(isAtad2Relevant(hp, [hp], [], '')).toBe(true);
    expect(isAtad2Relevant(rh, [rh], [], '')).toBe(true);
  });

  it('returns false for a plain subsidiary with no special status', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const sub = ent('sub');
    const edges = [ownEdge('tx', 'sub')];
    expect(isAtad2Relevant(sub, [tx, sub], edges, 'tx')).toBe(false);
  });
});

describe('groupNonRelevantSiblings', () => {
  it('returns no clusters when fewer than 2 non-relevant siblings share a parent', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const sub = ent('sub');
    const edges = [ownEdge('tx', 'sub')];
    const result = groupNonRelevantSiblings([tx, sub], edges, 'tx');
    expect(result.clusters).toEqual([]);
  });

  it('clusters 2+ non-relevant siblings of the same parent', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const b = ent('b');
    const c = ent('c');
    const ownership = [ownEdge('tx', 'a'), ownEdge('tx', 'b'), ownEdge('tx', 'c')];
    const result = groupNonRelevantSiblings([tx, a, b, c], ownership, 'tx');
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].parent_id).toBe('tx');
    expect(result.clusters[0].member_ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps an entity outside the cluster if it has any relevant descendant', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const inter = ent('inter');
    const dh = ent('dh', { entity_type: 'dh_entity' });
    const dull = ent('dull');
    const dull2 = ent('dull2');
    const edges = [
      ownEdge('tx', 'inter'),
      ownEdge('inter', 'dh'),
      ownEdge('tx', 'dull'),
      ownEdge('tx', 'dull2'),
    ];
    const result = groupNonRelevantSiblings([tx, inter, dh, dull, dull2], edges, 'tx');
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].member_ids.sort()).toEqual(['dull', 'dull2']);
  });
});
