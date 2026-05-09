import { describe, it, expect } from 'vitest';
import { geometryFor, BOX } from '@/lib/structure/shapeGeometry';

describe('shapeGeometry.geometryFor', () => {
  it('returns the standard 130x80 box size', () => {
    expect(BOX).toEqual({ width: 130, height: 80 });
  });

  describe('corporation', () => {
    it('returns a single rect outer shape, no inner', () => {
      const g = geometryFor('corporation');
      expect(g.outer).toEqual({ kind: 'rect', rx: 2 });
      expect(g.inner).toBeNull();
    });
  });

  describe('partnership', () => {
    it('returns a triangle apex-up', () => {
      const g = geometryFor('partnership');
      expect(g.outer.kind).toBe('polygon');
      expect((g.outer as any).points).toBe('65,0 130,80 0,80');
      expect(g.inner).toBeNull();
    });
  });

  describe('dh_entity', () => {
    it('returns rect outer + ellipse inner', () => {
      const g = geometryFor('dh_entity');
      expect(g.outer.kind).toBe('rect');
      expect(g.inner?.kind).toBe('ellipse');
    });
  });

  describe('hybrid_partnership', () => {
    it('returns rect outer + polyline (inverted-V, no base) inner', () => {
      const g = geometryFor('hybrid_partnership');
      expect(g.outer.kind).toBe('rect');
      expect(g.inner?.kind).toBe('polyline');
      expect((g.inner as any).points).toBe('8,72 65,12 122,72');
    });
  });

  describe('reverse_hybrid', () => {
    it('returns rect outer + downward triangle (apex down) inner', () => {
      const g = geometryFor('reverse_hybrid');
      expect(g.outer.kind).toBe('rect');
      expect(g.inner?.kind).toBe('polygon');
      expect((g.inner as any).points).toBe('8,8 122,8 65,72');
    });
  });

  describe('individual', () => {
    it('returns silhouette geometry (head + trapezoid)', () => {
      const g = geometryFor('individual');
      expect(g.outer.kind).toBe('individual');
    });
  });

  describe('trust_or_non_entity', () => {
    it('returns ellipse outer, no inner — same shape used for trust, foundation, STAK, VI/PE/branch', () => {
      const g = geometryFor('trust_or_non_entity');
      expect(g.outer.kind).toBe('ellipse');
      expect(g.inner).toBeNull();
    });
  });
});
