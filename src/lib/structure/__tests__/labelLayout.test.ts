import { describe, it, expect } from 'vitest';
import { computeConvergingLabelCounts, type EdgeLabelInput } from '../labelLayout';

const mk = (
  id: string,
  target: string,
  hasLabel = true,
): EdgeLabelInput => ({ id, target, hasLabel });

describe('computeConvergingLabelCounts', () => {
  it('counts visible labels converging on each target', () => {
    const out = computeConvergingLabelCounts([
      mk('a', 'child'),
      mk('b', 'child'),
      mk('c', 'child'),
      mk('solo', 'other'),
    ]);
    expect(out.get('a')).toBe(3);
    expect(out.get('b')).toBe(3);
    expect(out.get('c')).toBe(3);
    expect(out.get('solo')).toBe(1);
  });

  it('does not count hidden/empty labels toward convergence', () => {
    const out = computeConvergingLabelCounts([
      mk('a', 'child'),
      mk('hidden', 'child', false),
    ]);
    // Only one visible label on the child → no overlap, stays above the child.
    expect(out.get('a')).toBe(1);
    expect(out.get('hidden')).toBe(1);
  });

  it('reports zero for a target with no visible labels', () => {
    const out = computeConvergingLabelCounts([mk('x', 'child', false)]);
    expect(out.get('x')).toBe(0);
  });

  it('keeps targets independent', () => {
    const out = computeConvergingLabelCounts([
      mk('a', 'c1'),
      mk('b', 'c1'),
      mk('d', 'c2'),
    ]);
    expect(out.get('a')).toBe(2);
    expect(out.get('d')).toBe(1);
  });
});
