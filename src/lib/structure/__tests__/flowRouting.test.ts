import { describe, it, expect } from 'vitest';
import { routeFlows } from '../flowRouting';
import type { TransactionBundle } from '../bundleTransactions';

function bundle(from: string, to: string): TransactionBundle {
  return {
    bundleId: `${from}|${to}`,
    from_entity_id: from,
    to_entity_id: to,
    transactions: [],
    totalAmount: 100,
    hasMismatch: false,
  };
}

function rect(x: number, y: number) {
  return { x, y, width: 160, height: 100 };
}

describe('routeFlows — exit/entry side', () => {
  it('target right of source → exit right, entry left', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(0, 0)],
        ['b', rect(400, 0)],
      ]),
      tierBands: [{ topY: 0, bottomY: 100 }],
    });
    const f = r.get('a|b')!;
    expect(f.exitSide).toBe('right');
    expect(f.entrySide).toBe('left');
  });

  it('target left of source → exit left, entry right', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(400, 0)],
        ['b', rect(0, 0)],
      ]),
      tierBands: [{ topY: 0, bottomY: 100 }],
    });
    const f = r.get('a|b')!;
    expect(f.exitSide).toBe('left');
    expect(f.entrySide).toBe('right');
  });

  it('same-x flows spread across sides instead of all defaulting right', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b'), bundle('c', 'd')],
      entityRects: new Map([
        ['a', rect(0, 0)],
        ['b', rect(0, 300)],
        ['c', rect(0, 0)],
        ['d', rect(0, 300)],
      ]),
      tierBands: [
        { topY: 0, bottomY: 100 },
        { topY: 300, bottomY: 400 },
      ],
    });
    const sides = ['a|b', 'c|d'].map((id) => r.get(id)!.exitSide);
    expect(new Set(sides).size).toBe(2);
  });
});

describe('routeFlows — path geometry', () => {
  it('produces an orthogonal path (each segment is H or V)', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(0, 0)],
        ['b', rect(400, 300)],
      ]),
      tierBands: [
        { topY: 0, bottomY: 100 },
        { topY: 300, bottomY: 400 },
      ],
    });
    const f = r.get('a|b')!;
    expect(f.points.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < f.points.length; i++) {
      const p = f.points[i - 1];
      const q = f.points[i];
      const horizontal = Math.abs(p.y - q.y) < 0.01;
      const vertical = Math.abs(p.x - q.x) < 0.01;
      expect(horizontal || vertical).toBe(true);
    }
  });

  it('does not route through a non-endpoint entity box', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'c')],
      entityRects: new Map([
        ['a', rect(200, 0)],
        ['b', rect(200, 200)],
        ['c', rect(200, 400)],
      ]),
      tierBands: [
        { topY: 0, bottomY: 100 },
        { topY: 200, bottomY: 300 },
        { topY: 400, bottomY: 500 },
      ],
    });
    const f = r.get('a|c')!;
    const bBox = rect(200, 200);
    for (let i = 1; i < f.points.length; i++) {
      const p = f.points[i - 1];
      const q = f.points[i];
      const segMinX = Math.min(p.x, q.x);
      const segMaxX = Math.max(p.x, q.x);
      const segMinY = Math.min(p.y, q.y);
      const segMaxY = Math.max(p.y, q.y);
      const overlapsX = segMaxX > bBox.x + 1 && segMinX < bBox.x + bBox.width - 1;
      const overlapsY = segMaxY > bBox.y + 1 && segMinY < bBox.y + bBox.height - 1;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });
});

describe('routeFlows — lane/track assignment', () => {
  it('assigns distinct track offsets to flows sharing a lane', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b'), bundle('c', 'd'), bundle('e', 'f')],
      entityRects: new Map([
        ['a', rect(0, 0)],   ['b', rect(600, 0)],
        ['c', rect(0, 0)],   ['d', rect(600, 0)],
        ['e', rect(0, 0)],   ['f', rect(600, 0)],
      ]),
      tierBands: [{ topY: 0, bottomY: 100 }],
    });
    const offsets = ['a|b', 'c|d', 'e|f'].map((id) => r.get(id)!.trackOffset);
    expect(new Set(offsets).size).toBe(3);
  });
});

describe('routeFlows — label segment', () => {
  it('labelSegmentIndex points at the longest horizontal segment', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(0, 0)],
        ['b', rect(800, 300)],
      ]),
      tierBands: [
        { topY: 0, bottomY: 100 },
        { topY: 300, bottomY: 400 },
      ],
    });
    const f = r.get('a|b')!;
    const seg = [f.points[f.labelSegmentIndex], f.points[f.labelSegmentIndex + 1]];
    expect(Math.abs(seg[0].y - seg[1].y)).toBeLessThan(0.01); // horizontal
  });
});
