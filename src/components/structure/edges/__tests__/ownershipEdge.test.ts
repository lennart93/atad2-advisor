import { describe, it, expect } from 'vitest';
import { computeOwnershipPath, computeSafeDetourX } from '../OwnershipEdge';
import { NODE_WIDTH } from '@/lib/structure/labelMeasure';
import { MIN_GAP } from '@/lib/structure/tierLayout';

const STEP = NODE_WIDTH + MIN_GAP;
const HALF_STEP = STEP / 2;

describe('computeOwnershipPath — basic routing decisions', () => {
  it('uses smoothstep (no detour) when source and target are vertically aligned', () => {
    const r = computeOwnershipPath({ sourceX: 100, sourceY: 80, targetX: 100, targetY: 240 });
    expect(r.isLongSkip).toBe(false);
    expect(r.detourX).toBeUndefined();
  });

  it('uses smoothstep when dy is small even with X offset (single-tier edge)', () => {
    const r = computeOwnershipPath({ sourceX: 100, sourceY: 80, targetX: 300, targetY: 240 });
    expect(r.isLongSkip).toBe(false);
  });

  it('triggers long-skip routing when dy > 200 and X is offset', () => {
    const r = computeOwnershipPath({ sourceX: 100, sourceY: 80, targetX: 500, targetY: 480 });
    expect(r.isLongSkip).toBe(true);
    expect(r.detourX).toBeDefined();
  });

  it('long-skip path string contains both busbars (busY1 and busY2) when detour is offset', () => {
    // Force a sideways detour by putting an obstacle at target.X
    const r = computeOwnershipPath({
      sourceX: 100, sourceY: 80, targetX: 500, targetY: 480,
      intermediateXs: [500],
    });
    const busY1 = 80 + 37;
    const busY2 = 480 - 37;
    expect(r.path).toContain(`${busY1}`);
    expect(r.path).toContain(`${busY2}`);
  });
});

describe('computeSafeDetourX — obstacle avoidance', () => {
  it('returns targetX itself when target column is free (cleanest case)', () => {
    // No intermediate obstacles at targetX or nearby.
    expect(computeSafeDetourX(500, 100, [])).toBe(500);
    // Obstacles are far away — targetX still free.
    expect(computeSafeDetourX(500, 100, [200, 800])).toBe(500);
  });

  it('steps half a column toward source when target column is blocked', () => {
    // Obstacle at targetX. Source to the left → first probe is -xDir*HALF = -HALF.
    // BUT we also need that probe to be free. Put a second obstacle exactly at
    // targetX - HALF_STEP so the first probe is blocked, forcing +HALF.
    const obstacles = [500, 500 - HALF_STEP];
    const detour = computeSafeDetourX(500, 100, obstacles);
    expect(detour).toBe(500 + HALF_STEP);
  });

  it('user case: wrap-row 2 entity at gap between wrap-row 1 entities — straight drop', () => {
    // Source (S4 Energy) at X=0. Target (S4 Energy Nederland in wrap-row 2) at X=-288.
    // Wrap-row 1 entities at X = -384, -192, 0, 192, 384.
    // Target X = -288 is in the gap between -384 and -192, so the long
    // vertical at X=-288 passes between row 1 entities, not through them.
    const wrapRow1Xs = [-384, -192, 0, 192, 384];
    const detour = computeSafeDetourX(-288, 0, wrapRow1Xs);
    expect(detour).toBe(-288);
  });

  it('multi-tier skip case: target column blocked by intermediate row, step to safe gap', () => {
    // Source far left at X=-500. Target at X=200 with an intermediate entity
    // at exactly X=200 (column collision). The half-step probe at 200 - HALF
    // should land in a free gap.
    const obstacles = [200];
    const detour = computeSafeDetourX(200, -500, obstacles);
    expect(detour).not.toBe(200);
    expect(Math.abs(detour - 200)).toBe(HALF_STEP);
    // Source to the left → first probe is -xDir*HALF = -(+1)*HALF = -HALF
    // → detour at 200 - HALF.
    expect(detour).toBe(200 - HALF_STEP);
  });

  it('falls back to targetX when every probe is blocked', () => {
    // Pack obstacles densely so no probe within range is free.
    const obstacles = [
      0, // target
      -HALF_STEP, +HALF_STEP,
      -STEP, +STEP,
      -STEP * 1.5, +STEP * 1.5,
    ];
    const detour = computeSafeDetourX(0, 100, obstacles);
    expect(detour).toBe(0); // fallback
  });
});

describe('computeOwnershipPath — collapsed path when detour equals target', () => {
  it('emits the simpler 3-segment path when no sideways detour needed', () => {
    const r = computeOwnershipPath({
      sourceX: 100, sourceY: 80, targetX: 500, targetY: 480,
      intermediateXs: [], // nothing in the way
    });
    expect(r.isLongSkip).toBe(true);
    expect(r.detourX).toBe(500);
    // Path should NOT contain a second busY (busY2) since the vertical goes
    // straight from busY1 to targetY.
    const busY1 = 80 + 37;
    const busY2 = 480 - 37;
    expect(r.path).toContain(`${busY1}`);
    expect(r.path).not.toContain(`${busY2}`);
  });
});
