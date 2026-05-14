import type { RoutedFlowPoint } from '@/lib/structure/flowRouting';

const EPS = 0.01;

export function isOrthogonal(points: RoutedFlowPoint[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const horizontal = Math.abs(p.y - q.y) < EPS;
    const vertical = Math.abs(p.x - q.x) < EPS;
    if (!horizontal && !vertical) return false;
  }
  return true;
}

/** Insert a new waypoint splitting segment `segmentIndex` at `at`. */
export function addWaypoint(
  points: RoutedFlowPoint[],
  segmentIndex: number,
  at: RoutedFlowPoint,
): RoutedFlowPoint[] {
  const next = points.slice();
  next.splice(segmentIndex + 1, 0, { ...at });
  return next;
}

/**
 * Remove the waypoint at `index`. Returns the new path if it stays orthogonal,
 * or null if removal would create a diagonal segment.
 */
export function removeWaypoint(
  points: RoutedFlowPoint[],
  index: number,
): RoutedFlowPoint[] | null {
  if (index <= 0 || index >= points.length - 1) return null; // can't remove endpoints
  const next = points.slice();
  next.splice(index, 1);
  return isOrthogonal(next) ? next : null;
}

/**
 * Drag segment `segmentIndex` (between points[i] and points[i+1]) by {dx, dy}.
 * A horizontal segment only honors dy; a vertical segment only honors dx.
 * The two endpoints of the segment move; the neighboring segments stretch.
 */
export function dragSegment(
  points: RoutedFlowPoint[],
  segmentIndex: number,
  delta: { dx: number; dy: number },
): RoutedFlowPoint[] {
  const next = points.map((p) => ({ ...p }));
  const a = next[segmentIndex];
  const b = next[segmentIndex + 1];
  const horizontal = Math.abs(a.y - b.y) < EPS;
  if (horizontal) {
    a.y += delta.dy;
    b.y += delta.dy;
  } else {
    a.x += delta.dx;
    b.x += delta.dx;
  }
  return next;
}

export function snapToGrid(point: RoutedFlowPoint, grid: number): RoutedFlowPoint {
  return {
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid,
  };
}

/**
 * Snap a coordinate to the nearest value in `candidates` within `threshold`.
 * Used to align a dragged segment with other parallel segments so flows line
 * up. Returns `value` unchanged when nothing is close enough.
 */
export function snapToParallel(
  value: number,
  candidates: number[],
  threshold: number,
): number {
  let best = value;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
