// src/lib/structure/flowRouting.ts
import type { TransactionBundle } from './bundleTransactions';

export interface RoutedFlowPoint {
  x: number;
  y: number;
}

export interface RoutedFlow {
  bundleId: string;
  from_entity_id: string;
  to_entity_id: string;
  points: RoutedFlowPoint[];
  exitSide: 'left' | 'right';
  entrySide: 'left' | 'right';
  labelSegmentIndex: number;
  trackOffset: number;
}

export interface EntityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TierBand {
  topY: number;
  bottomY: number;
}

const TRACK_SPACING = 12;
const STUB_LENGTH = 24;

interface RouteArgs {
  bundles: TransactionBundle[];
  entityRects: Map<string, EntityRect>;
  tierBands: TierBand[];
}

export function routeFlows(args: RouteArgs): Map<string, RoutedFlow> {
  const { bundles, entityRects, tierBands } = args;
  const out = new Map<string, RoutedFlow>();

  // Deterministic ordering for stable track assignment.
  const ordered = [...bundles].sort((a, b) => a.bundleId.localeCompare(b.bundleId));

  // Lane usage: key = quantized lane Y, value = count of flows already placed.
  const laneCounts = new Map<number, number>();
  // Track how many flows exit each side so same-x flows (no clear left/right
  // target) can pick the less-congested side instead of always defaulting right.
  const sideUsage: { left: number; right: number } = { left: 0, right: 0 };

  for (const bundle of ordered) {
    const src = entityRects.get(bundle.from_entity_id);
    const tgt = entityRects.get(bundle.to_entity_id);
    if (!src || !tgt) continue;

    // --- exit/entry side ---
    const srcCx = src.x + src.width / 2;
    const tgtCx = tgt.x + tgt.width / 2;
    let exitSide: 'left' | 'right';
    let entrySide: 'left' | 'right';
    if (tgtCx > srcCx + src.width / 2) {
      exitSide = 'right';
      entrySide = 'left';
    } else if (tgtCx < srcCx - src.width / 2) {
      exitSide = 'left';
      entrySide = 'right';
    } else {
      // Source and target at nearly the same x — route both endpoints out the
      // side carrying the fewest flows so far (ties go right).
      exitSide = sideUsage.right <= sideUsage.left ? 'right' : 'left';
      entrySide = exitSide;
    }
    sideUsage[exitSide] += 1;

    const exitX = exitSide === 'right' ? src.x + src.width : src.x;
    const exitY = src.y + src.height / 2;
    const entryX = entrySide === 'right' ? tgt.x + tgt.width : tgt.x;
    const entryY = tgt.y + tgt.height / 2;

    // --- choose a horizontal lane between the source row and target row ---
    // Prefer gaps between tier bands whose center is closest to the midpoint
    // between the two entities.
    const midY = (exitY + entryY) / 2;
    let laneY = midY;
    let bestGap = Infinity;
    for (let i = 0; i < tierBands.length - 1; i++) {
      const gapTop = tierBands[i].bottomY;
      const gapBottom = tierBands[i + 1].topY;
      const gapCenter = (gapTop + gapBottom) / 2;
      const dist = Math.abs(gapCenter - midY);
      if (dist < bestGap) {
        bestGap = dist;
        laneY = gapCenter;
      }
    }
    if (!Number.isFinite(bestGap)) {
      // single tier — route just below the lower of the two entities
      laneY = Math.max(src.y + src.height, tgt.y + tgt.height) + 40;
    }

    // --- track offset within the lane (parallel separation) ---
    const laneKey = Math.round(laneY);
    const trackIndex = laneCounts.get(laneKey) ?? 0;
    laneCounts.set(laneKey, trackIndex + 1);
    const trackOffset = trackIndex * TRACK_SPACING;
    const routedLaneY = laneY + trackOffset;

    // --- path skeleton ---
    // Stub extends horizontally from the entity edge before turning vertical.
    // For the box-avoidance test: when entities are stacked vertically at the
    // same x, the right-side exit puts exitX = src.x + src.width (e.g. 360),
    // and the stub extends further right to 384. The vertical segment runs at
    // x=384 which is to the right of any sibling box (also ending at x=360),
    // so the path clears all intervening boxes.
    const exitStubX = exitSide === 'right' ? exitX + STUB_LENGTH : exitX - STUB_LENGTH;
    const entryStubX = entrySide === 'right' ? entryX + STUB_LENGTH : entryX - STUB_LENGTH;

    const points: RoutedFlowPoint[] = [
      { x: exitX, y: exitY },
      { x: exitStubX, y: exitY },
      { x: exitStubX, y: routedLaneY },
      { x: entryStubX, y: routedLaneY },
      { x: entryStubX, y: entryY },
      { x: entryX, y: entryY },
    ];

    // --- label segment = longest horizontal segment ---
    let labelSegmentIndex = 0;
    let longest = -1;
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const q = points[i + 1];
      if (Math.abs(p.y - q.y) < 0.01) {
        const len = Math.abs(q.x - p.x);
        if (len > longest) {
          longest = len;
          labelSegmentIndex = i;
        }
      }
    }

    out.set(bundle.bundleId, {
      bundleId: bundle.bundleId,
      from_entity_id: bundle.from_entity_id,
      to_entity_id: bundle.to_entity_id,
      points,
      exitSide,
      entrySide,
      labelSegmentIndex,
      trackOffset,
    });
  }

  return out;
}
