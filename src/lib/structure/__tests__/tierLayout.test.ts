import { describe, it, expect, beforeEach } from 'vitest';
import { selectAnchor, tierLayout, clusterId } from '@/lib/structure/tierLayout';
import type { Cluster } from '@/lib/structure/relevance';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';
import { _resetCacheForTests as resetLabelCache } from '@/lib/structure/labelMeasure';

// NODE_HEIGHT=100, TIER_GAP_BELOW=80 → tier Y step = 180 per single-row tier
const TIER_Y_STEP = 180; // NODE_HEIGHT + TIER_GAP_BELOW = 100 + 80
const NODE_W = 160;

const ent = (id: string, overrides: Partial<StructureEntity> = {}): StructureEntity => ({
  id, chart_id: 'c1', name: id, legal_form: null, jurisdiction_iso: 'NL',
  entity_type: 'corporation', is_taxpayer: false,
  position_x: 0, position_y: 0, source: 'ai_extracted',
  created_at: '', updated_at: '', ...overrides,
});

const ownEdge = (from: string, to: string): StructureEdge => ({
  id: `${from}->${to}`, chart_id: 'c1',
  from_entity_id: from, to_entity_id: to, kind: 'ownership',
  ownership_pct: 100, ownership_voting_only: null,
  transaction_type: null, amount_eur: null, is_mismatch: false,
  mismatch_classification: null, mismatch_atad2_article: null,
  label: null, source: 'ai_extracted', created_at: '', updated_at: '',
});

describe('selectAnchor', () => {
  it('picks the entity with is_taxpayer=true', () => {
    const a = ent('a');
    const b = ent('b', { is_taxpayer: true });
    expect(selectAnchor([a, b], [])).toBe('b');
  });

  it('falls back to UPE when no taxpayer flag', () => {
    const a = ent('a');
    const b = ent('b');
    expect(selectAnchor([a, b], [ownEdge('a', 'b')])).toBe('a');
  });

  it('returns null for empty input', () => {
    expect(selectAnchor([], [])).toBeNull();
  });
});

describe('tierLayout', () => {
  beforeEach(() => resetLabelCache());

  it('places taxpayer at Y=0 (top of rendered) when no parents; child below', () => {
    // NODE_HEIGHT=100, TIER_GAP_BELOW=80 → child Y = 180
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [tx, c],
      ownershipEdges: [ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('tx')!.y).toBe(0);
    expect(result.positions.get('c')!.y).toBe(TIER_Y_STEP);
  });

  it('places parent above taxpayer above child (3 ranks)', () => {
    // p → tx → c. Longest-path: p=rank 0 (Y=0), tx=rank 1 (Y=180), c=rank 2 (Y=360).
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [p, tx, c],
      ownershipEdges: [ownEdge('p', 'tx'), ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('p')!.y).toBe(0);
    expect(result.positions.get('tx')!.y).toBe(TIER_Y_STEP);
    expect(result.positions.get('c')!.y).toBe(TIER_Y_STEP * 2);
  });

  it('orphans land in the orphans array, not in positions', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const orphan = ent('orphan');
    const result = tierLayout({
      entities: [tx, orphan],
      ownershipEdges: [],
      clusters: [],
    });
    expect(result.positions.has('orphan')).toBe(false);
    expect(result.orphans.map((e) => e.id)).toEqual(['orphan']);
  });

  it('siblings within a tier are positioned symmetrically and centered around X=0', () => {
    // NODE_WIDTH=160, MIN_GAP=32 → step = 192.
    // 3 siblings, centers at -192, 0, +192 (uniform spacing).
    // top-left x = center - 80 → -272, -80, +112.
    const tx = ent('tx', { is_taxpayer: true });
    const c1 = ent('c1');
    const c2 = ent('c2');
    const c3 = ent('c3');
    const result = tierLayout({
      entities: [tx, c1, c2, c3],
      ownershipEdges: [ownEdge('tx', 'c1'), ownEdge('tx', 'c2'), ownEdge('tx', 'c3')],
      clusters: [],
    });
    const xs = ['c1', 'c2', 'c3'].map((id) => result.positions.get(id)!.x).sort((a, b) => a - b);
    // Uniform spacing: pairwise x-gap between top-left coords should equal (NODE_WIDTH + MIN_GAP) = 192
    expect(xs[1] - xs[0]).toBeCloseTo(192, 5);
    expect(xs[2] - xs[1]).toBeCloseTo(192, 5);
    // Middle node top-left x = -80 (center 0, minus width/2)
    expect(xs[1]).toBeCloseTo(-80, 5);
    // Pairwise gap ≥ MIN_GAP
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(32);
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(32);
  });

  it('a single entity in a tier sits centered on X=0 (top-left = -NODE_WIDTH/2)', () => {
    // NODE_WIDTH=160 → top-left x = -80
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [tx, c],
      ownershipEdges: [ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('c')!.x).toBe(-80);
  });

  it('cluster placeholders are positioned at parent.rank + 1', () => {
    // tx is taxpayer (rank 0, Y=0). cluster renders at rank 1 (Y=180).
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const b = ent('b');
    const cluster: Cluster = { parent_id: 'tx', member_ids: ['a', 'b'] };
    const result = tierLayout({
      entities: [tx, a, b],
      ownershipEdges: [ownEdge('tx', 'a'), ownEdge('tx', 'b')],
      clusters: [cluster],
    });
    const cId = clusterId(cluster);
    // tx at rank 0 (Y=0); cluster at rank 1 (Y=180)
    expect(result.clusterPositions.get(cId)!.y).toBe(TIER_Y_STEP);
    expect(result.positions.has('a')).toBe(false);
    expect(result.positions.has('b')).toBe(false);
  });

  it('returns ranksRendered ascending', () => {
    // p → tx → c. Longest-path ranks: p=0, tx=1, c=2.
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [p, tx, c],
      ownershipEdges: [ownEdge('p', 'tx'), ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.ranksRendered).toEqual([0, 1, 2]);
  });

  it('zij-eigenaar met alleen een diepe dochter schuift omlaag', () => {
    // castleton → s4energy → s4sub  (castleton: rang 0, s4energy: 1, s4sub: 2)
    // energiefonds → s4sub          (energiefonds is een UPE die alleen een dochter op rang 2 heeft)
    // Verwacht: energiefonds schuift naar rang 1 (= 2 − 1), dus zelfde Y als s4energy.
    const castleton = ent('castleton');
    const s4energy = ent('s4energy');
    const s4sub = ent('s4sub', { is_taxpayer: true });
    const energiefonds = ent('energiefonds');
    const result = tierLayout({
      entities: [castleton, s4energy, s4sub, energiefonds],
      ownershipEdges: [
        ownEdge('castleton', 's4energy'),
        ownEdge('s4energy', 's4sub'),
        ownEdge('energiefonds', 's4sub'),
      ],
      clusters: [],
    });
    expect(result.positions.get('castleton')!.y).toBe(0);
    expect(result.positions.get('s4energy')!.y).toBe(TIER_Y_STEP);
    expect(result.positions.get('energiefonds')!.y).toBe(TIER_Y_STEP);
    expect(result.positions.get('s4sub')!.y).toBe(TIER_Y_STEP * 2);
  });

  it('UPE met directe dochter op rang 1 blijft op rang 0', () => {
    // castleton → s4energy. Dochter zit op rang 1, dus snap = 1 − 1 = 0 → geen verschuiving.
    const castleton = ent('castleton');
    const s4energy = ent('s4energy', { is_taxpayer: true });
    const result = tierLayout({
      entities: [castleton, s4energy],
      ownershipEdges: [ownEdge('castleton', 's4energy')],
      clusters: [],
    });
    expect(result.positions.get('castleton')!.y).toBe(0);
    expect(result.positions.get('s4energy')!.y).toBe(TIER_Y_STEP);
  });

  it('elke ouder staat horizontaal pal boven zijn (centroid van) kinderen', () => {
    // Setup zoals user's chart: 1 hoofdketen (Castleton → S4 Energy → 2 kinderen)
    // plus 2 zij-eigenaren die elk 1 ander rang-2 kind bezitten. S4 Energy heeft ook
    // edges naar die kinderen zodat ze bereikbaar zijn vanaf de anchor.
    const castleton = ent('castleton', { is_taxpayer: true });
    const s4energy = ent('s4energy');
    const enNed = ent('enNed');
    const engineering = ent('engineering');
    const ancillary = ent('ancillary');
    const manufacturing = ent('manufacturing');
    const energiefonds = ent('energiefonds');
    const osse = ent('osse');
    const result = tierLayout({
      entities: [castleton, s4energy, enNed, engineering, ancillary, manufacturing, energiefonds, osse],
      ownershipEdges: [
        ownEdge('castleton', 's4energy'),
        ownEdge('s4energy', 'enNed'),
        ownEdge('s4energy', 'engineering'),
        ownEdge('s4energy', 'ancillary'),
        ownEdge('s4energy', 'manufacturing'),
        ownEdge('energiefonds', 'ancillary'),
        ownEdge('osse', 'manufacturing'),
      ],
      clusters: [],
    });
    // X opvragen als center (positions.x is top-left, +NODE_WIDTH/2 = center).
    const cx = (id: string) => result.positions.get(id)!.x + 80;
    // Energiefonds pal boven Ancillary (zijn ene kind):
    expect(cx('energiefonds')).toBeCloseTo(cx('ancillary'), 0);
    // Osse pal boven Manufacturing (zijn ene kind):
    expect(cx('osse')).toBeCloseTo(cx('manufacturing'), 0);
  });

  it('unity-leden binnen dezelfde rij worden contiguous geplaatst', () => {
    // 5 broers/zussen onder dezelfde ouder: a, b, c, d, e (alfabetisch).
    // Unity = {a, c, e} (3 niet-aanliggende leden). Verwacht: a, c, e komen
    // aaneengesloten te staan; b en d worden eruit geschoven.
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const b = ent('b');
    const c = ent('c');
    const d = ent('d');
    const e = ent('e');
    const result = tierLayout({
      entities: [tx, a, b, c, d, e],
      ownershipEdges: [
        ownEdge('tx', 'a'),
        ownEdge('tx', 'b'),
        ownEdge('tx', 'c'),
        ownEdge('tx', 'd'),
        ownEdge('tx', 'e'),
      ],
      clusters: [],
      groupings: [{
        id: 'g1',
        chart_id: 'c1',
        kind: 'fiscal_unity',
        label: 'F.E.',
        member_ids: ['a', 'c', 'e'],
        created_at: '',
      }],
    });
    const xs = [
      { id: 'a', x: result.positions.get('a')!.x },
      { id: 'b', x: result.positions.get('b')!.x },
      { id: 'c', x: result.positions.get('c')!.x },
      { id: 'd', x: result.positions.get('d')!.x },
      { id: 'e', x: result.positions.get('e')!.x },
    ].sort((p, q) => p.x - q.x);
    const order = xs.map((p) => p.id);
    const aIdx = order.indexOf('a');
    const cIdx = order.indexOf('c');
    const eIdx = order.indexOf('e');
    const members = [aIdx, cIdx, eIdx].sort((p, q) => p - q);
    expect(members[2] - members[0]).toBe(2); // 3 aaneengesloten posities
  });

  it('UPE met meerdere dochters op verschillende dieptes pakt de dichtstbij', () => {
    // upe → shallow (direct, rang 1) en upe → deep (via mid op rang 2)
    // Snap = min(1, 2) − 1 = 0. UPE blijft op rang 0.
    const upe = ent('upe');
    const shallow = ent('shallow', { is_taxpayer: true });
    const mid = ent('mid');
    const deep = ent('deep');
    const result = tierLayout({
      entities: [upe, shallow, mid, deep],
      ownershipEdges: [
        ownEdge('upe', 'shallow'),
        ownEdge('shallow', 'mid'),
        ownEdge('mid', 'deep'),
        ownEdge('upe', 'deep'),
      ],
      clusters: [],
    });
    // upe heeft een dichtstbij dochter op rang 1 → blijft op rang 0
    expect(result.positions.get('upe')!.y).toBe(0);
    expect(result.positions.get('shallow')!.y).toBe(TIER_Y_STEP);
  });
});

function entE(id: string, name = `Entity ${id}`, overrides: Partial<StructureEntity> = {}): StructureEntity {
  return {
    id, chart_id: 'c1', name, legal_form: 'B.V.', jurisdiction_iso: 'NL',
    entity_type: 'corporation', is_taxpayer: false,
    position_x: 0, position_y: 0, source: 'ai_extracted',
    created_at: '', updated_at: '', ...overrides,
  };
}
function edgeE(from: string, to: string): StructureEdge {
  return {
    id: `${from}-${to}`, chart_id: 'c1',
    from_entity_id: from, to_entity_id: to,
    kind: 'ownership', ownership_pct: 100, ownership_voting_only: null,
    transaction_type: null, amount_eur: null, is_mismatch: false,
    mismatch_classification: null, mismatch_atad2_article: null, label: null,
    source: 'ai_extracted', created_at: '', updated_at: '',
  };
}

describe('tierLayout — hybrid rewrite', () => {
  beforeEach(() => resetLabelCache());

  it('places multi-parent JV child centered between parents', () => {
    const entities = [
      entE('a', 'Parent A', { is_taxpayer: true }),
      entE('b', 'Parent B'),
      entE('c', 'JV Child'),
    ];
    const edges = [edgeE('a', 'c'), edgeE('b', 'c')];
    const { positions } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    const pa = positions.get('a')!;
    const pb = positions.get('b')!;
    const pc = positions.get('c')!;
    const expectedCx = (pa.x + pb.x) / 2;
    // Within one node-width tolerance — packing may shift slightly to avoid overlap.
    expect(Math.abs(pc.x - expectedCx)).toBeLessThan(150);
  });

  it('assigns longest-path rank: generation-skip case', () => {
    // A → B → C, plus A → C (direct). C must sit on rank 2, not rank 1.
    const entities = [entE('a', 'A', { is_taxpayer: true }), entE('b', 'B'), entE('c', 'C')];
    const edges = [edgeE('a', 'b'), edgeE('b', 'c'), edgeE('a', 'c')];
    const { ranks } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(2);
  });

  it('places all siblings on a single row when tier width fits', () => {
    const entities = [
      entE('a', 'Root', { is_taxpayer: true }),
      entE('b', 'B'),
      entE('c', 'C'),
      entE('d', 'D'),
      entE('e', 'E'),
    ];
    const edges = [edgeE('a', 'b'), edgeE('a', 'c'), edgeE('a', 'd'), edgeE('a', 'e')];
    const { positions } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    // All 4 children share the same Y
    const ys = ['b', 'c', 'd', 'e'].map((id) => positions.get(id)!.y);
    expect(new Set(ys).size).toBe(1);
  });

  it('wraps siblings into multiple rows when single-row width exceeds MAX_ROW_WIDTH', () => {
    // 10 children at NODE_WIDTH=160 + MIN_GAP=32 = 10*160 + 9*32 = 1888 > 1200 → must wrap
    const entities = [entE('root', 'Root', { is_taxpayer: true })];
    const edges: StructureEdge[] = [];
    for (let i = 0; i < 10; i++) {
      entities.push(entE(`n${i}`, `N${i}`));
      edges.push(edgeE('root', `n${i}`));
    }
    const { positions } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    // Children should be on at least 2 distinct Y values
    const childYs = new Set<number>();
    for (let i = 0; i < 10; i++) {
      childYs.add(positions.get(`n${i}`)!.y);
    }
    expect(childYs.size).toBeGreaterThanOrEqual(2);
  });

  it('distributes children evenly across rows', () => {
    // 13 children → rowsNeeded based on MAX_PER_ROW (~6); should distribute evenly
    const entities = [entE('root', 'Root', { is_taxpayer: true })];
    const edges: StructureEdge[] = [];
    for (let i = 0; i < 13; i++) {
      entities.push(entE(`n${i}`, `N${i}`));
      edges.push(edgeE('root', `n${i}`));
    }
    const { positions } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    // Count children per Y row
    const byY = new Map<number, number>();
    for (let i = 0; i < 13; i++) {
      const y = positions.get(`n${i}`)!.y;
      byY.set(y, (byY.get(y) ?? 0) + 1);
    }
    const counts = Array.from(byY.values()).sort((a, b) => b - a);
    // Difference between largest and smallest row should be <= 1
    expect(counts[0] - counts[counts.length - 1]).toBeLessThanOrEqual(1);
  });

  it('200-entity synthetic chart layout completes under 100ms', () => {
    const entities: StructureEntity[] = [entE('root', 'Root', { is_taxpayer: true })];
    const edges: StructureEdge[] = [];
    for (let i = 0; i < 199; i++) {
      const id = `n${i}`;
      entities.push(entE(id, `Node ${i}`));
      const parentIdx = Math.floor(Math.random() * entities.length - 1);
      const parent = parentIdx < 0 ? 'root' : entities[Math.max(0, parentIdx)].id;
      edges.push(edgeE(parent, id));
    }
    const start = performance.now();
    tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
