import { describe, it, expect } from 'vitest';
import {
  computeOwnershipPath,
  computeSafeDetourX,
  computeDefaultLabelPos,
} from '../OwnershipEdge';
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
    // Pack obstacles densely so no probe within range is free (incl. the
    // ±2-step probes the lane routing added).
    const obstacles = [
      0, // target
      -HALF_STEP, +HALF_STEP,
      -STEP, +STEP,
      -STEP * 1.5, +STEP * 1.5,
      -STEP * 2, +STEP * 2,
    ];
    const detour = computeSafeDetourX(0, 100, obstacles);
    expect(detour).toBe(0); // fallback
  });
});

describe('computeDefaultLabelPos — % resting placement', () => {
  // Single-tier fan-out: parent bottom at y=100, children top at y=200.
  const parent = { sourceX: 500, sourceY: 100, targetY: 200 };

  it('centres a LONE straight edge on the line (single child, single owner)', () => {
    const pos = computeDefaultLabelPos({
      ...parent, targetX: 500, convergingOwners: 1, siblingCount: 1,
    });
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(150); // midpoint of 100..200
  });

  it('drops a straight edge BELOW the bus when its parent fans out', () => {
    const pos = computeDefaultLabelPos({
      ...parent, targetX: 500, convergingOwners: 1, siblingCount: 4,
    });
    // No longer the midpoint — rests just above the child, clear of the bus.
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(200 - 22);
    expect(pos.y).toBeGreaterThan(150); // strictly below the bus crossing
  });

  it('rests a non-straight single-owner edge just above its child', () => {
    const pos = computeDefaultLabelPos({
      ...parent, targetX: 800, convergingOwners: 1, siblingCount: 1,
    });
    expect(pos.x).toBe(800);
    expect(pos.y).toBe(200 - 22);
  });

  it('clears the TAXPAYER pill that straddles the child top edge', () => {
    // De pill beslaat targetY-8 .. targetY+8; het labelvak is ~16px hoog rond
    // zijn middelpunt. Het label-middelpunt moet dus minstens 18px boven de
    // dochter-top rusten, anders hangt het % over het woord TAXPAYER.
    const pos = computeDefaultLabelPos({
      ...parent, targetX: 800, convergingOwners: 1, siblingCount: 1,
    });
    expect(pos.y).toBeLessThanOrEqual(200 - 18);
  });

  it('drops a converging % under its OWN parent when that parent has one child', () => {
    const pos = computeDefaultLabelPos({
      ...parent, targetX: 800, convergingOwners: 2, siblingCount: 1,
    });
    // Single-child holdco → anchored under the source, on its one line down.
    expect(pos.x).toBe(500);
    expect(pos.y).toBe(100 + 22);
  });

  it('sends a converging % to the CHILD when its parent is a fan-out hub', () => {
    // S4 Energy case: 6 children (hub) AND one of several owners of the child.
    const pos = computeDefaultLabelPos({
      ...parent, targetX: 1200, convergingOwners: 3, siblingCount: 6,
    });
    // Under a hub "below the parent" is ambiguous, so the % goes to the child.
    expect(pos.x).toBe(1200);
    expect(pos.y).toBe(200 - 22);
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
