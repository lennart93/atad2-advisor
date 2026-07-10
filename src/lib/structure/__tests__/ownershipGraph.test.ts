import { describe, it, expect } from 'vitest';
import {
  buildOwnershipGraph,
  reaches,
  effectiveFraction,
  effectivePctToSet,
  effectivePctFromSet,
  toOwnershipEdges,
  type OwnershipEdgeLite,
} from '@/lib/structure/ownershipGraph';

const e = (from: string, to: string, pct: number | null): OwnershipEdgeLite => ({ from, to, pct });

describe('toOwnershipEdges', () => {
  it('keeps only ownership edges and projects the shape', () => {
    const edges = [
      { from_entity_id: 'a', to_entity_id: 'b', ownership_pct: 60, kind: 'ownership' },
      { from_entity_id: 'a', to_entity_id: 'b', ownership_pct: null, kind: 'transaction' },
    ];
    expect(toOwnershipEdges(edges)).toEqual([{ from: 'a', to: 'b', pct: 60 }]);
  });

  it('treats a missing kind as ownership (back-compat)', () => {
    expect(toOwnershipEdges([{ from_entity_id: 'a', to_entity_id: 'b', ownership_pct: 50 }])).toHaveLength(1);
  });
});

describe('reaches', () => {
  const g = buildOwnershipGraph([e('top', 'mid', 100), e('mid', 'tp', 60), e('tp', 'sub', 100)]);

  it('finds an indirect ancestor of the taxpayer', () => {
    expect(reaches('top', new Set(['tp']), g)).toBe(true); // top -> mid -> tp
  });
  it('finds an indirect descendant via the taxpayer as source', () => {
    expect(reaches('tp', new Set(['sub']), g)).toBe(true);
  });
  it('is false for an unrelated node', () => {
    expect(reaches('sub', new Set(['tp']), g)).toBe(false);
  });
  it('never reports a target as reaching itself', () => {
    expect(reaches('tp', new Set(['tp']), g)).toBe(false);
  });
});

describe('effectiveFraction', () => {
  it('multiplies along a chain', () => {
    const g = buildOwnershipGraph([e('a', 'b', 50), e('b', 'c', 40)]);
    expect(effectiveFraction('a', 'c', g)).toBeCloseTo(0.2); // 0.5 * 0.4
  });

  it('sums diamond paths', () => {
    // a owns b (100%) and c (100%); both own d 50% each => a holds 100% of d.
    const g = buildOwnershipGraph([e('a', 'b', 100), e('a', 'c', 100), e('b', 'd', 50), e('c', 'd', 50)]);
    expect(effectiveFraction('a', 'd', g)).toBeCloseTo(1.0);
  });

  it('skips paths with an unknown percentage', () => {
    const g = buildOwnershipGraph([e('a', 'b', null), e('b', 'c', 80)]);
    expect(effectiveFraction('a', 'c', g)).toBe(0);
  });

  it('is cycle-safe', () => {
    const g = buildOwnershipGraph([e('a', 'b', 50), e('b', 'a', 50), e('b', 'c', 30)]);
    expect(effectiveFraction('a', 'c', g)).toBeCloseTo(0.15); // a->b->c only, no infinite loop
  });
});

describe('effectivePctToSet / FromSet', () => {
  const g = buildOwnershipGraph([e('parent', 'tp', 30), e('tp', 'sub', 80)]);

  it('parent stake in the taxpayer', () => {
    expect(effectivePctToSet('parent', ['tp'], g)).toBe(30);
  });
  it('taxpayer stake in a subsidiary', () => {
    expect(effectivePctFromSet(['tp'], 'sub', g)).toBe(80);
  });
  it('returns null when only connected via unknown pct', () => {
    const g2 = buildOwnershipGraph([e('parent', 'tp', null)]);
    expect(effectivePctToSet('parent', ['tp'], g2)).toBeNull();
  });
  it('caps at 100', () => {
    const g3 = buildOwnershipGraph([e('a', 'b', 100), e('a', 'c', 100), e('b', 'd', 80), e('c', 'd', 80)]);
    expect(effectivePctFromSet(['a'], 'd', g3)).toBe(100); // 1.6 capped
  });

  it('measures a parent against a nested taxpayer group by its apex share, not the summed chain', () => {
    // Three parents split the top of an 8-entity taxpayer chain 40/35/25; the top
    // holds 100% down the chain (t1 -> t2 -> ... -> t8). Each parent must show its
    // real share, not a chain-summed 100%.
    const chain = [
      e('t1', 't2', 100), e('t2', 't3', 100), e('t3', 't4', 100),
      e('t4', 't5', 100), e('t5', 't6', 100), e('t6', 't7', 100), e('t7', 't8', 100),
    ];
    const g4 = buildOwnershipGraph([
      e('p1', 't1', 40), e('p2', 't1', 35), e('p3', 't1', 25), ...chain,
    ]);
    const group = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
    expect(effectivePctToSet('p1', group, g4)).toBe(40);
    expect(effectivePctToSet('p2', group, g4)).toBe(35);
    expect(effectivePctToSet('p3', group, g4)).toBe(25);
  });

  it('adds genuinely separate apex holdings but not a re-counted chain member', () => {
    // Group has two disjoint tops a and b (neither owns the other); parent owns 30%
    // of a and 20% of b, and a owns c inside the group. Result: 30 + 20 = 50, with
    // c (owned by a) not adding a's stake a second time.
    const g5 = buildOwnershipGraph([e('p', 'a', 30), e('p', 'b', 20), e('a', 'c', 100)]);
    expect(effectivePctToSet('p', ['a', 'b', 'c'], g5)).toBe(50);
  });
});
