import { describe, it, expect } from 'vitest';
import { taxpayerCenteredViewport, type ChartBounds } from '@/lib/structure/viewportFraming';

const PANE_W = 1000;
const PANE_H = 800;

// Where does a chart-coord x land on screen, given the transform?
const screenX = (chartX: number, vp: { x: number; zoom: number }) => chartX * vp.zoom + vp.x;
const screenY = (chartY: number, vp: { y: number; zoom: number }) => chartY * vp.zoom + vp.y;

describe('taxpayerCenteredViewport', () => {
  it('places the taxpayer at the horizontal centre of the pane', () => {
    const bounds: ChartBounds = { minX: 0, maxX: 900, minY: 0, maxY: 400 };
    const taxpayerCenterX = 200; // left-of-centre in the tree
    const vp = taxpayerCenteredViewport({
      bounds,
      taxpayerCenterX,
      viewportWidth: PANE_W,
      viewportHeight: PANE_H,
    });
    expect(screenX(taxpayerCenterX, vp)).toBeCloseTo(PANE_W / 2, 4);
  });

  it('centres the tree vertically on its own mid-line', () => {
    const bounds: ChartBounds = { minX: -300, maxX: 300, minY: 100, maxY: 700 };
    const vp = taxpayerCenteredViewport({
      bounds,
      taxpayerCenterX: 0,
      viewportWidth: PANE_W,
      viewportHeight: PANE_H,
    });
    const midY = (bounds.minY + bounds.maxY) / 2;
    expect(screenY(midY, vp)).toBeCloseTo(PANE_H / 2, 4);
  });

  it('keeps every node visible: both edges fit inside the pane', () => {
    // Lopsided tree: taxpayer near the left, lots of structure to the right.
    const bounds: ChartBounds = { minX: 0, maxX: 1600, minY: 0, maxY: 300 };
    const taxpayerCenterX = 80;
    const vp = taxpayerCenteredViewport({
      bounds,
      taxpayerCenterX,
      viewportWidth: PANE_W,
      viewportHeight: PANE_H,
      minZoom: 0.05,
    });
    expect(screenX(bounds.minX, vp)).toBeGreaterThanOrEqual(0);
    expect(screenX(bounds.maxX, vp)).toBeLessThanOrEqual(PANE_W);
    // Taxpayer still dead-centre even though the tree is heavily one-sided.
    expect(screenX(taxpayerCenterX, vp)).toBeCloseTo(PANE_W / 2, 4);
  });

  it('respects maxZoom for small charts so a single node is not blown up', () => {
    const bounds: ChartBounds = { minX: 0, maxX: 160, minY: 0, maxY: 100 };
    const vp = taxpayerCenteredViewport({
      bounds,
      taxpayerCenterX: 80,
      viewportWidth: PANE_W,
      viewportHeight: PANE_H,
      maxZoom: 1.0,
    });
    expect(vp.zoom).toBeLessThanOrEqual(1.0);
  });

  it('clamps to minZoom when the centred span is wider than the pane allows', () => {
    const bounds: ChartBounds = { minX: 0, maxX: 100000, minY: 0, maxY: 300 };
    const vp = taxpayerCenteredViewport({
      bounds,
      taxpayerCenterX: 50,
      viewportWidth: PANE_W,
      viewportHeight: PANE_H,
      minZoom: 0.3,
    });
    expect(vp.zoom).toBe(0.3);
    // Even when clamped, the taxpayer stays centred.
    expect(screenX(50, vp)).toBeCloseTo(PANE_W / 2, 4);
  });

  it('is symmetric: a centred taxpayer behaves like a plain fit', () => {
    const bounds: ChartBounds = { minX: -400, maxX: 400, minY: 0, maxY: 300 };
    const vp = taxpayerCenteredViewport({
      bounds,
      taxpayerCenterX: 0,
      viewportWidth: PANE_W,
      viewportHeight: PANE_H,
    });
    expect(screenX(bounds.minX, vp)).toBeCloseTo(PANE_W - screenX(bounds.maxX, vp), 4);
  });
});
