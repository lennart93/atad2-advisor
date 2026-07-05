// Guards the one hard promise of the connector routing: an ownership edge is
// drawn with ONLY horizontal and vertical segments — never a diagonal — at every
// level, and it lands on each node's centre. Covers two layers the older tests
// left open:
//   1. the FULL pipeline tierLayout → routeOwnershipEdges → computeOwnershipPath
//      (the earlier suites only checked the routing SPEC, not the drawn path);
//   2. the stale/dragged case where routing still says "straight" but the live
//      handle X's no longer line up — which used to emit a literal diagonal.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  routeOwnershipEdges,
  type RoutedEdgeSpec,
} from '@/lib/structure/edgeRouting';
import { computeOwnershipPath } from '@/components/structure/edges/OwnershipEdge';
import { tierLayout } from '@/lib/structure/tierLayout';
import {
  NODE_WIDTH,
  NODE_HEIGHT,
  _resetCacheForTests as resetLabelCache,
} from '@/lib/structure/labelMeasure';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const ent = (id: string, o: Partial<StructureEntity> = {}): StructureEntity => ({
  id, chart_id: 'c1', name: id, legal_form: null, jurisdiction_iso: 'NL',
  entity_type: 'corporation', is_taxpayer: false,
  position_x: 0, position_y: 0, source: 'ai_extracted',
  created_at: '', updated_at: '', ...o,
});
const ownEdge = (from: string, to: string): StructureEdge => ({
  id: `${from}->${to}`, chart_id: 'c1',
  from_entity_id: from, to_entity_id: to, kind: 'ownership',
  ownership_pct: 100, ownership_voting_only: null,
  transaction_type: null, amount_eur: null, is_mismatch: false,
  mismatch_classification: null, mismatch_atad2_article: null,
  label: null, source: 'ai_extracted', created_at: '', updated_at: '',
});

// Anchor points of an SVG path (M/L endpoints + the end point of each Q arc).
function pathPoints(d: string): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const re = /([MLQ])\s*([-\d.]+)[ ,]+([-\d.]+)(?:[ ,]+([-\d.]+)[ ,]+([-\d.]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1] === 'Q') pts.push({ x: parseFloat(m[4]), y: parseFloat(m[5]) });
    else pts.push({ x: parseFloat(m[2]), y: parseFloat(m[3]) });
  }
  return pts;
}
// A segment is a real slant only if it travels further than the 4px corner
// radius in BOTH axes (the rounded corners themselves are 4px arcs).
function diagonalSegments(d: string): string[] {
  const pts = pathPoints(d);
  const bad: string[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i].x - pts[i - 1].x);
    const dy = Math.abs(pts[i].y - pts[i - 1].y);
    if (dx > 5 && dy > 5) bad.push(`(${pts[i - 1].x},${pts[i - 1].y})->(${pts[i].x},${pts[i].y})`);
  }
  return bad;
}

describe('computeOwnershipPath — only horizontal/vertical segments', () => {
  it('aligned straight edge → one clean vertical', () => {
    const r: RoutedEdgeSpec = { kind: 'straight', railY1: null, detourX: null, railY2: null };
    const { path } = computeOwnershipPath({ sourceX: 100, sourceY: 80, targetX: 100, targetY: 240, routing: r });
    expect(diagonalSegments(path)).toEqual([]);
  });

  it('MISALIGNED straight edge (stale routing / dragged node) → orthogonal, lands on target centre', () => {
    const r: RoutedEdgeSpec = { kind: 'straight', railY1: null, detourX: null, railY2: null };
    const { path } = computeOwnershipPath({ sourceX: 100, sourceY: 80, targetX: 320, targetY: 240, routing: r });
    expect(diagonalSegments(path)).toEqual([]);
    const pts = pathPoints(path);
    expect(pts[0]).toEqual({ x: 100, y: 80 });                       // source handle
    expect(pts[pts.length - 1]).toEqual({ x: 320, y: 240 });         // target top-centre
  });

  it('malformed routing (railY1 null on any kind) → still orthogonal', () => {
    for (const kind of ['straight', 'adjacent', 'longskip'] as const) {
      const r: RoutedEdgeSpec = { kind, railY1: null, detourX: null, railY2: null };
      const { path } = computeOwnershipPath({ sourceX: 40, sourceY: 0, targetX: 260, targetY: 180, routing: r });
      expect(diagonalSegments(path), `kind=${kind}`).toEqual([]);
    }
  });
});

describe('full pipeline (tierLayout → routeOwnershipEdges → computeOwnershipPath) is orthogonal at every level', () => {
  beforeEach(() => resetLabelCache());

  const scenarios: Array<{ name: string; entities: StructureEntity[]; edges: StructureEdge[] }> = [
    (() => {
      // Multi-level: taxpayer, 5 children, grandchildren with mixed owners,
      // a direct 2-tier skip and a cross-holding.
      const entities = [
        ent('cci'), ent('s4', { is_taxpayer: true }),
        ent('ets1'), ent('ets2'), ent('nl'), ent('anc'), ent('eng'),
        ent('dock'), ent('anc1'), ent('nh'), ent('gron'), ent('manu'),
      ];
      const edges = [
        ownEdge('cci', 's4'),
        ownEdge('s4', 'ets1'), ownEdge('s4', 'ets2'), ownEdge('s4', 'nl'), ownEdge('s4', 'anc'), ownEdge('s4', 'eng'),
        ownEdge('ets1', 'dock'), ownEdge('nl', 'anc1'), ownEdge('nl', 'nh'), ownEdge('anc', 'gron'), ownEdge('eng', 'manu'),
        ownEdge('s4', 'nh'), ownEdge('ets2', 'gron'),
      ];
      return { name: 'multi-level group', entities, edges };
    })(),
    (() => {
      // Wide tier that row-wraps: one holdco with 9 subsidiaries (wrap-row 2
      // hangs under wrap-row 1 — the "second row of children" case).
      const entities = [ent('H', { is_taxpayer: true })];
      const edges: StructureEdge[] = [];
      for (let i = 1; i <= 9; i++) { entities.push(ent(`w${i}`)); edges.push(ownEdge('H', `w${i}`)); }
      return { name: 'wide row-wrap', entities, edges };
    })(),
    (() => {
      const entities = [ent('R', { is_taxpayer: true }), ent('P1'), ent('P2'), ent('P3')];
      const edges = [ownEdge('R', 'P1'), ownEdge('R', 'P2'), ownEdge('R', 'P3')];
      for (const p of ['P1', 'P2', 'P3']) for (let i = 0; i < 4; i++) { const c = `${p}c${i}`; entities.push(ent(c)); edges.push(ownEdge(p, c)); }
      return { name: 'three parents × four grandchildren', entities, edges };
    })(),
  ];

  for (const sc of scenarios) {
    it(`${sc.name}: every rendered edge is horizontal/vertical only`, () => {
      const { positions } = tierLayout({
        entities: sc.entities,
        ownershipEdges: sc.edges.filter((e) => e.kind === 'ownership'),
        clusters: [],
      });
      const nodes = sc.entities
        .filter((e) => positions.has(e.id))
        .map((e) => { const p = positions.get(e.id)!; return { id: e.id, x: p.x, y: p.y }; });
      const routed = routeOwnershipEdges({
        nodes,
        edges: sc.edges.map((e) => ({ id: e.id, from: e.from_entity_id, to: e.to_entity_id })),
      });

      for (const e of sc.edges) {
        const from = positions.get(e.from_entity_id)!;
        const to = positions.get(e.to_entity_id)!;
        const sourceX = from.x + NODE_WIDTH / 2;
        const targetX = to.x + NODE_WIDTH / 2;
        const { path } = computeOwnershipPath({
          sourceX, sourceY: from.y + NODE_HEIGHT,
          targetX, targetY: to.y,
          routing: (routed.get(e.id) ?? null) as RoutedEdgeSpec | null,
        });
        expect(diagonalSegments(path), `${e.id} path=${path}`).toEqual([]);
        // Terminates on the child's top-centre (connects to the node centre).
        const pts = pathPoints(path);
        expect(Math.abs(pts[pts.length - 1].x - targetX)).toBeLessThan(0.5);
      }
    });
  }
});
