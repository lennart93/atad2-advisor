import { describe, it, expect } from 'vitest';
import {
  addWaypoint,
  removeWaypoint,
  dragSegment,
  snapToGrid,
  snapToParallel,
  isOrthogonal,
} from '@/components/structure/flowEditing/pathOps';
import type { RoutedFlowPoint } from '@/lib/structure/flowRouting';

const L: RoutedFlowPoint[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe('isOrthogonal', () => {
  it('true for an L-shaped path', () => {
    expect(isOrthogonal(L)).toBe(true);
  });
  it('false when a segment is diagonal', () => {
    expect(isOrthogonal([{ x: 0, y: 0 }, { x: 50, y: 50 }])).toBe(false);
  });
});

describe('addWaypoint', () => {
  it('splits a segment into two, path stays orthogonal', () => {
    const result = addWaypoint(L, 0, { x: 50, y: 0 });
    expect(result.length).toBe(4);
    expect(result[1]).toEqual({ x: 50, y: 0 });
    expect(isOrthogonal(result)).toBe(true);
  });
});

describe('removeWaypoint', () => {
  it('removes a corner when the path stays orthogonal', () => {
    const path = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const result = removeWaypoint(path, 1);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
  });
  it('returns null when removal would break orthogonality', () => {
    const result = removeWaypoint(L, 1);
    expect(result).toBeNull();
  });
  it('returns null for the first endpoint', () => {
    expect(removeWaypoint(L, 0)).toBeNull();
  });
  it('returns null for the last endpoint', () => {
    expect(removeWaypoint(L, L.length - 1)).toBeNull();
  });
});

describe('dragSegment', () => {
  it('dragging a horizontal segment vertically moves both its points and keeps neighbors orthogonal', () => {
    const result = dragSegment(L, 0, { dx: 0, dy: 20 });
    expect(result[0]).toEqual({ x: 0, y: 20 });
    expect(result[1]).toEqual({ x: 100, y: 20 });
    expect(result[2].x).toBe(100);
    expect(isOrthogonal(result)).toBe(true);
  });

  it('dragging a vertical segment horizontally moves both its points and ignores dy', () => {
    const result = dragSegment(L, 1, { dx: 30, dy: 99 });
    expect(result[1]).toEqual({ x: 130, y: 0 });
    expect(result[2]).toEqual({ x: 130, y: 100 });
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(isOrthogonal(result)).toBe(true);
  });
});

describe('snapToGrid', () => {
  it('snaps a point to the nearest 8px gridline', () => {
    expect(snapToGrid({ x: 11, y: 5 }, 8)).toEqual({ x: 8, y: 8 });
    expect(snapToGrid({ x: 20, y: 23 }, 8)).toEqual({ x: 24, y: 24 });
  });
});

describe('snapToParallel', () => {
  it('snaps to the nearest parallel segment within threshold', () => {
    expect(snapToParallel(103, [50, 100, 200], 6)).toBe(100);
  });
  it('leaves the value unchanged when nothing is within threshold', () => {
    expect(snapToParallel(103, [50, 200], 6)).toBe(103);
  });
  it('picks the closest candidate when several are within threshold', () => {
    expect(snapToParallel(102, [100, 105], 6)).toBe(100);
  });
});
