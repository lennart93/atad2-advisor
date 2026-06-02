import { describe, it, expect } from 'vitest';
import { validate } from '../validator';
import type { StructureEntity, StructureEdge } from '../types';

function ent(id: string, overrides: Partial<StructureEntity> = {}): StructureEntity {
  return {
    id,
    chart_id: 'chart-1',
    name: `Entity ${id}`,
    legal_form: 'B.V.',
    jurisdiction_iso: 'NL',
    entity_type: 'corporation',
    is_taxpayer: false,
    position_x: 0,
    position_y: 0,
    source: 'ai_extracted',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function edge(from: string, to: string, pct: number | null): StructureEdge {
  return {
    id: `${from}-${to}`,
    chart_id: 'chart-1',
    from_entity_id: from,
    to_entity_id: to,
    kind: 'ownership',
    ownership_pct: pct,
    ownership_voting_only: null,
    transaction_type: null,
    amount_eur: null,
    is_mismatch: false,
    mismatch_classification: null,
    mismatch_atad2_article: null,
    label: null,
    source: 'ai_extracted',
    created_at: '',
    updated_at: '',
  };
}

describe('validate — ownership-sum', () => {
  it('passes when single edge is 100%', () => {
    const r = validate([ent('a'), ent('b')], [edge('a', 'b', 100)]);
    expect(r.ownershipSumIssues).toEqual([]);
  });

  it('passes when null pct (treated as 100%)', () => {
    const r = validate([ent('a'), ent('b')], [edge('a', 'b', null)]);
    expect(r.ownershipSumIssues).toEqual([]);
  });

  it('passes when two parents sum to 100% exactly', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 96.65), edge('b', 'c', 3.35)],
    );
    expect(r.ownershipSumIssues).toEqual([]);
  });

  it('flags 87.3%', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 50), edge('b', 'c', 37.3)],
    );
    expect(r.ownershipSumIssues).toHaveLength(1);
    expect(r.ownershipSumIssues[0].child_id).toBe('c');
    expect(r.ownershipSumIssues[0].sum_pct).toBeCloseTo(87.3, 2);
  });

  it('flags 102.7%', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 62.7), edge('b', 'c', 40)],
    );
    expect(r.ownershipSumIssues).toHaveLength(1);
    expect(r.ownershipSumIssues[0].sum_pct).toBeCloseTo(102.7, 2);
  });

  it('tolerates 100.005% within ±0.01', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 50.0025), edge('b', 'c', 50.0025)],
    );
    expect(r.ownershipSumIssues).toEqual([]);
  });
});

describe('validate — missing fields', () => {
  it('passes when all fields present', () => {
    const r = validate([ent('a')], []);
    expect(r.missingFields).toEqual([]);
  });

  it('flags missing legal_form', () => {
    const r = validate([ent('a', { legal_form: null })], []);
    expect(r.missingFields).toEqual([{ entity_id: 'a', missing: ['legal_form'] }]);
  });

  it('flags missing jurisdiction_iso (empty string)', () => {
    const r = validate([ent('a', { jurisdiction_iso: '' })], []);
    expect(r.missingFields).toEqual([{ entity_id: 'a', missing: ['jurisdiction_iso'] }]);
  });

  it('flags both missing on same entity', () => {
    const r = validate([ent('a', { legal_form: null, jurisdiction_iso: '' })], []);
    expect(r.missingFields).toEqual([
      { entity_id: 'a', missing: ['legal_form', 'jurisdiction_iso'] },
    ]);
  });

  it('does not flag missing legal_form on an individual', () => {
    const r = validate(
      [ent('a', { legal_form: null, entity_type: 'individual' })],
      [],
    );
    expect(r.missingFields).toEqual([]);
  });

  it('does not flag missing legal_form on a trust_or_non_entity', () => {
    const r = validate(
      [ent('a', { legal_form: null, entity_type: 'trust_or_non_entity' })],
      [],
    );
    expect(r.missingFields).toEqual([]);
  });

  it('still flags missing jurisdiction_iso on a trust_or_non_entity', () => {
    const r = validate(
      [ent('a', { legal_form: null, jurisdiction_iso: '', entity_type: 'trust_or_non_entity' })],
      [],
    );
    expect(r.missingFields).toEqual([
      { entity_id: 'a', missing: ['jurisdiction_iso'] },
    ]);
  });
});

describe('validate — cycles', () => {
  it('passes on a DAG', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'b', 100), edge('b', 'c', 100)],
    );
    expect(r.cycles).toEqual([]);
  });

  it('detects A→B→A', () => {
    const r = validate(
      [ent('a'), ent('b')],
      [edge('a', 'b', 100), edge('b', 'a', 100)],
    );
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0].sort()).toEqual(['a', 'b']);
  });

  it('detects A→B→C→A (length 3)', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'b', 100), edge('b', 'c', 100), edge('c', 'a', 100)],
    );
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('detects two independent cycles', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c'), ent('d')],
      [
        edge('a', 'b', 100),
        edge('b', 'a', 100),
        edge('c', 'd', 100),
        edge('d', 'c', 100),
      ],
    );
    expect(r.cycles).toHaveLength(2);
  });
});

describe('validate — hasBlocking', () => {
  it('false on clean data', () => {
    const r = validate([ent('a')], []);
    expect(r.hasBlocking).toBe(false);
  });

  it('true when missing fields', () => {
    const r = validate([ent('a', { legal_form: null })], []);
    expect(r.hasBlocking).toBe(true);
  });

  it('true when cycle', () => {
    const r = validate(
      [ent('a'), ent('b')],
      [edge('a', 'b', 100), edge('b', 'a', 100)],
    );
    expect(r.hasBlocking).toBe(true);
  });

  it('false when only ownership-sum issue (warn, not block)', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 50), edge('b', 'c', 37.3)],
    );
    expect(r.hasBlocking).toBe(false);
  });
});
