import { describe, it, expect } from 'vitest';
import { computeSnapshotViewport, isUsablePngDataUrl } from '../captureChartSnapshot';

describe('computeSnapshotViewport', () => {
  it('frames a bounds box with padding into a target transform', () => {
    const bounds = { x: 0, y: 0, width: 400, height: 300 };
    const vp = computeSnapshotViewport(bounds, { padding: 0.1, maxWidth: 2000, maxHeight: 2000 });
    expect(vp.width).toBeGreaterThanOrEqual(400);
    expect(vp.height).toBeGreaterThanOrEqual(300);
    expect(Number.isFinite(vp.transform.x)).toBe(true);
    expect(Number.isFinite(vp.transform.y)).toBe(true);
    expect(vp.transform.zoom).toBeGreaterThan(0);
  });

  it('clamps oversized charts to the max dimensions', () => {
    const bounds = { x: 0, y: 0, width: 10000, height: 8000 };
    const vp = computeSnapshotViewport(bounds, { padding: 0, maxWidth: 2000, maxHeight: 2000 });
    expect(vp.width).toBeLessThanOrEqual(2000);
    expect(vp.height).toBeLessThanOrEqual(2000);
  });

  it('handles an empty bounds box without producing NaN', () => {
    const vp = computeSnapshotViewport({ x: 0, y: 0, width: 0, height: 0 }, { padding: 0.1, maxWidth: 2000, maxHeight: 2000 });
    expect(Number.isNaN(vp.width)).toBe(false);
    expect(Number.isNaN(vp.height)).toBe(false);
  });

  it('floors a tiny single-entity chart to the minimum canvas with breathing room', () => {
    // A lone taxpayer node (~160x130). Without a floor this crops tight and the
    // box balloons when the Overview scales it to fill the height.
    const bounds = { x: 0, y: 0, width: 160, height: 130 };
    const vp = computeSnapshotViewport(bounds, {
      padding: 0.1, maxWidth: 2400, maxHeight: 2400, minWidth: 600, minHeight: 400,
    });
    expect(vp.width).toBeGreaterThanOrEqual(600);
    expect(vp.height).toBeGreaterThanOrEqual(400);
    // The node occupies only a fraction of the floored canvas → whitespace, not
    // a tight crop that fills the frame.
    expect(160 / vp.width).toBeLessThan(0.5);
  });

  it('never magnifies a small chart beyond its natural size', () => {
    const bounds = { x: 0, y: 0, width: 160, height: 130 };
    const vp = computeSnapshotViewport(bounds, {
      padding: 0.1, maxWidth: 2400, maxHeight: 2400, minWidth: 600, minHeight: 400,
    });
    expect(vp.transform.zoom).toBeLessThanOrEqual(1);
  });

  it('leaves a chart already larger than the floor untouched (tight crop preserved)', () => {
    const bounds = { x: 0, y: 0, width: 1200, height: 800 };
    const floored = computeSnapshotViewport(bounds, {
      padding: 0.1, maxWidth: 2400, maxHeight: 2400, minWidth: 600, minHeight: 400,
    });
    const unfloored = computeSnapshotViewport(bounds, {
      padding: 0.1, maxWidth: 2400, maxHeight: 2400,
    });
    expect(floored.width).toBe(unfloored.width);
    expect(floored.height).toBe(unfloored.height);
  });
});

describe('isUsablePngDataUrl', () => {
  it('accepts a substantial png data url', () => {
    expect(isUsablePngDataUrl('data:image/png;base64,' + 'A'.repeat(8000))).toBe(true);
  });
  it('rejects null', () => {
    expect(isUsablePngDataUrl(null)).toBe(false);
  });
  it('rejects a non-png string', () => {
    expect(isUsablePngDataUrl('data:image/jpeg;base64,' + 'A'.repeat(8000))).toBe(false);
  });
  it('rejects a small data url (likely a blank capture)', () => {
    expect(isUsablePngDataUrl('data:image/png;base64,AAAA')).toBe(false);
  });
});
