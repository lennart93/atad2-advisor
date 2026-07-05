import { describe, it, expect } from 'vitest';
import {
  computeConvergingLabelCounts,
  computeSiblingChildCounts,
  type EdgeLabelInput,
} from '../labelLayout';

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

describe('computeSiblingChildCounts', () => {
  it('counts edges sharing each parent, incl. itself', () => {
    // Parent P fans out to three children; Q has a single child.
    const out = computeSiblingChildCounts([
      { id: 'a', source: 'P' },
      { id: 'b', source: 'P' },
      { id: 'c', source: 'P' },
      { id: 'solo', source: 'Q' },
    ]);
    expect(out.get('a')).toBe(3);
    expect(out.get('b')).toBe(3);
    expect(out.get('c')).toBe(3);
    expect(out.get('solo')).toBe(1);
  });

  it('counts lines regardless of label visibility (hidden siblings still draw a bus)', () => {
    // The count is about edges/lines, not labels — there is no hasLabel input.
    const out = computeSiblingChildCounts([
      { id: 'visible', source: 'P' },
      { id: 'hidden', source: 'P' },
    ]);
    expect(out.get('visible')).toBe(2);
    expect(out.get('hidden')).toBe(2);
  });

  it('keeps parents independent', () => {
    const out = computeSiblingChildCounts([
      { id: 'a', source: 'P1' },
      { id: 'b', source: 'P1' },
      { id: 'd', source: 'P2' },
    ]);
    expect(out.get('a')).toBe(2);
    expect(out.get('d')).toBe(1);
  });
});
