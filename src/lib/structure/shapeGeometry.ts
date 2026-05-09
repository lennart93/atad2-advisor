import type { EntityType } from './types';

export const BOX = { width: 130, height: 80 } as const;

export type OuterShape =
  | { kind: 'rect'; rx: number }
  | { kind: 'polygon'; points: string }
  | { kind: 'ellipse' }
  | { kind: 'individual' };

export type InnerShape =
  | { kind: 'ellipse'; rx: number; ry: number }
  | { kind: 'polygon'; points: string }
  | { kind: 'polyline'; points: string };

export interface Geometry {
  outer: OuterShape;
  inner: InnerShape | null;
}

const W = BOX.width;
const H = BOX.height;
const RECT: OuterShape = { kind: 'rect', rx: 2 };

export function geometryFor(type: EntityType): Geometry {
  switch (type) {
    case 'corporation':
      return { outer: RECT, inner: null };

    case 'partnership':
      return {
        outer: { kind: 'polygon', points: `${W / 2},0 ${W},${H} 0,${H}` },
        inner: null,
      };

    case 'dh_entity':
      return {
        outer: RECT,
        inner: { kind: 'ellipse', rx: W / 2 - 5, ry: H / 2 - 6 },
      };

    case 'hybrid_partnership':
      return {
        outer: RECT,
        inner: { kind: 'polyline', points: `8,${H - 8} ${W / 2},12 ${W - 8},${H - 8}` },
      };

    case 'reverse_hybrid':
      return {
        outer: RECT,
        inner: { kind: 'polygon', points: `8,8 ${W - 8},8 ${W / 2},${H - 8}` },
      };

    case 'individual':
      return { outer: { kind: 'individual' }, inner: null };

    case 'trust_or_non_entity':
      return { outer: { kind: 'ellipse' }, inner: null };
  }
}
