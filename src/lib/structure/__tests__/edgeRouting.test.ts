import { describe, it, expect, beforeEach } from 'vitest';
import {
  planLanes,
  routeOwnershipEdges,
  gapHeightForLanes,
  computeSafeDetourX,
  SAFE_HALF_WIDTH,
  LANE_TOP_PAD,
  LANE_BOTTOM_PAD,
  type LaneRowSlot,
} from '@/lib/structure/edgeRouting';
import { tierLayout } from '@/lib/structure/tierLayout';
import { NODE_WIDTH, NODE_HEIGHT, _resetCacheForTests as resetLabelCache } from '@/lib/structure/labelMeasure';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

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

describe('planLanes — baan-toewijzing per tussenruimte', () => {
  const rows: LaneRowSlot[][] = [
    [{ id: 'A', x: 0 }],
    [{ id: 'B', x: -200 }, { id: 'C', x: 0 }, { id: 'D', x: 200 }],
    [{ id: 'E', x: -200 }, { id: 'F', x: 0 }, { id: 'G', x: 200 }],
  ];

  it('verticaal uitgelijnde adjacent edge is een rechte lijn zonder rail', () => {
    const plan = planLanes(rows, [{ id: 'e1', from: 'B', to: 'E' }]);
    expect(plan.byEdge.get('e1')!.kind).toBe('straight');
    expect(plan.byEdge.get('e1')!.laneA).toBeNull();
    expect(plan.laneCountByGap[1]).toBe(0);
  });

  it('overlappende rails van verschillende moeders krijgen verschillende banen', () => {
    // B → F (span -200..0) en C → E (span -200..0) overlappen volledig.
    const plan = planLanes(rows, [
      { id: 'bf', from: 'B', to: 'F' },
      { id: 'ce', from: 'C', to: 'E' },
    ]);
    const bf = plan.byEdge.get('bf')!;
    const ce = plan.byEdge.get('ce')!;
    expect(bf.kind).toBe('adjacent');
    expect(ce.kind).toBe('adjacent');
    expect(bf.laneA).not.toBe(ce.laneA);
    expect(plan.laneCountByGap[1]).toBe(2);
  });

  it('niet-overlappende rails mogen een baan delen', () => {
    // B → E is recht (geen rail); gebruik twee losse waaiers ver uit elkaar.
    const wide: LaneRowSlot[][] = [
      [{ id: 'P', x: -400 }, { id: 'Q', x: 400 }],
      [{ id: 'p1', x: -500 }, { id: 'p2', x: -300 }, { id: 'q1', x: 300 }, { id: 'q2', x: 500 }],
    ];
    const plan = planLanes(wide, [
      { id: 'pp1', from: 'P', to: 'p1' },
      { id: 'pp2', from: 'P', to: 'p2' },
      { id: 'qq1', from: 'Q', to: 'q1' },
      { id: 'qq2', from: 'Q', to: 'q2' },
    ]);
    // Elke moeder één rail; de spans [-500..-300] en [300..500] raken elkaar
    // niet → zelfde baan → gap heeft maar 1 baan nodig.
    expect(plan.laneCountByGap[0]).toBe(1);
    expect(plan.byEdge.get('pp1')!.laneA).toBe(plan.byEdge.get('qq1')!.laneA);
  });

  it('lange lijn daalt via een vrije kolom, niet door een tussenliggende node', () => {
    // A (rij 0) → G (rij 2). Kolom van G (x=200) is in rij 1 bezet door D.
    const plan = planLanes(rows, [{ id: 'ag', from: 'A', to: 'G' }]);
    const ag = plan.byEdge.get('ag')!;
    expect(ag.kind).toBe('longskip');
    expect(ag.detourX).not.toBeNull();
    for (const ix of [-200, 0, 200]) {
      expect(Math.abs(ag.detourX! - ix)).toBeGreaterThanOrEqual(SAFE_HALF_WIDTH);
    }
    // Zijstap nodig → invoeg-rail boven de doelrij.
    expect(ag.targetGap).toBe(1);
    expect(ag.laneB).not.toBeNull();
  });

  it('twee lange lijnen naar verschillende dochters delen geen daal-kolom', () => {
    const wideRows: LaneRowSlot[][] = [
      [{ id: 'A', x: 0 }, { id: 'Z', x: 192 }],
      [{ id: 'B', x: -200 }, { id: 'C', x: 0 }, { id: 'D', x: 200 }],
      [{ id: 'E', x: -200 }, { id: 'F', x: 0 }, { id: 'G', x: 200 }],
    ];
    const plan = planLanes(wideRows, [
      { id: 'ag', from: 'A', to: 'G' },
      { id: 'zf', from: 'Z', to: 'F' },
    ]);
    const ag = plan.byEdge.get('ag')!;
    const zf = plan.byEdge.get('zf')!;
    const colOf = (p: typeof ag) => p.detourX ?? NaN;
    expect(Math.abs(colOf(ag) - colOf(zf))).toBeGreaterThanOrEqual(16);
  });
});

describe('gapHeightForLanes', () => {
  it('groeit pas boven de basishoogte bij 3+ banen', () => {
    expect(gapHeightForLanes(0, 80)).toBe(80);
    expect(gapHeightForLanes(1, 80)).toBe(80);
    expect(gapHeightForLanes(2, 80)).toBe(80); // 28+24+16 = 68 < 80
    expect(gapHeightForLanes(3, 80)).toBe(84);
    expect(gapHeightForLanes(4, 80)).toBe(100);
  });
});

describe('computeSafeDetourX — compat', () => {
  it('geeft targetX terug als de kolom vrij is', () => {
    expect(computeSafeDetourX(500, 100, [])).toBe(500);
  });
  it('stapt opzij bij een geblokkeerde kolom', () => {
    expect(computeSafeDetourX(500, 100, [500])).not.toBe(500);
  });
});

describe('routeOwnershipEdges — concrete rail-Y’s', () => {
  it('legt rails strikt tussen de rijen, binnen de label-vrije band', () => {
    // Twee rijen: boven op y=0, onder op y=180 (NODE_HEIGHT=100, gap=80).
    const nodes = [
      { id: 'P', x: -80, y: 0 },
      { id: 'Q', x: 300, y: 0 },
      { id: 'a', x: -180, y: 180 },
      { id: 'b', x: 20, y: 180 },
      { id: 'c', x: 220, y: 180 },
    ];
    const routed = routeOwnershipEdges({
      nodes,
      edges: [
        { id: 'pa', from: 'P', to: 'a' },
        { id: 'pb', from: 'P', to: 'b' },
        { id: 'qb', from: 'Q', to: 'b' },
        { id: 'qc', from: 'Q', to: 'c' },
      ],
    });
    const gapTop = 0 + NODE_HEIGHT;
    const gapBottom = 180;
    for (const id of ['pa', 'pb', 'qb', 'qc']) {
      const r = routed.get(id)!;
      expect(r.kind).toBe('adjacent');
      expect(r.railY1!).toBeGreaterThanOrEqual(gapTop + LANE_TOP_PAD - 0.01);
      expect(r.railY1!).toBeLessThanOrEqual(gapBottom - LANE_BOTTOM_PAD + 0.01);
    }
    // P-waaier en Q-waaier overlappen rond x≈20..220 → verschillende banen.
    expect(routed.get('pa')!.railY1).not.toBe(routed.get('qb')!.railY1);
    // Binnen één waaier: alle edges op dezelfde rail (één visuele balk).
    expect(routed.get('pa')!.railY1).toBe(routed.get('pb')!.railY1);
    expect(routed.get('qb')!.railY1).toBe(routed.get('qc')!.railY1);
  });

  it('edges omhoog of binnen één rij ontbreken (fallback op smoothstep)', () => {
    const nodes = [
      { id: 'P', x: 0, y: 0 },
      { id: 'a', x: -100, y: 180 },
      { id: 'b', x: 100, y: 180 },
    ];
    const routed = routeOwnershipEdges({
      nodes,
      edges: [
        { id: 'up', from: 'a', to: 'P' }, // omhoog: onbepaald, geen routing
        { id: 'side', from: 'a', to: 'b' }, // zelfde rij
      ],
    });
    expect(routed.has('up')).toBe(false);
    expect(routed.has('side')).toBe(false);
  });
});

describe('S4-scenario: layout + routing samen geven een strakke kaart', () => {
  beforeEach(() => resetLabelCache());

  // Reconstructie van de kaart uit de screenshots: taxpayer met 5 dochters,
  // daaronder 5 kleindochters met gemengde eigenaren (incl. een direct belang
  // van de taxpayer twee rijen omlaag en een kruis-belang).
  const entities = [
    ent('cci'),
    ent('s4energy', { is_taxpayer: true }),
    ent('etsGroningen'), ent('etsZeeland'), ent('s4EnergyNL'), ent('s4Ancillary'), ent('s4Engineering'),
    ent('energyDock'), ent('s4AncillaryI'), ent('s4NoordHolland'), ent('s4Gronext'), ent('s4Manufacturing'),
  ];
  const edges = [
    ownEdge('cci', 's4energy'),
    ownEdge('s4energy', 'etsGroningen'),
    ownEdge('s4energy', 'etsZeeland'),
    ownEdge('s4energy', 's4EnergyNL'),
    ownEdge('s4energy', 's4Ancillary'),
    ownEdge('s4energy', 's4Engineering'),
    ownEdge('etsGroningen', 'energyDock'),
    ownEdge('s4EnergyNL', 's4AncillaryI'),
    ownEdge('s4EnergyNL', 's4NoordHolland'),
    ownEdge('s4Ancillary', 's4Gronext'),
    ownEdge('s4Engineering', 's4Manufacturing'),
    // Multi-parent: taxpayer houdt direct een belang twee rijen lager, en er
    // is een kruis-belang tussen takken. Dit is wat de knoop veroorzaakte.
    ownEdge('s4energy', 's4NoordHolland'),
    ownEdge('etsZeeland', 's4Gronext'),
  ];

  it('elke rang staat op precies één Y en de routing houdt rails uit elkaar', () => {
    const { positions } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });

    // Rijen strak: rang 2 en rang 3 elk op exact één Y.
    const yOf = (id: string) => positions.get(id)!.y;
    const tier2 = ['etsGroningen', 'etsZeeland', 's4EnergyNL', 's4Ancillary', 's4Engineering'];
    const tier3 = ['energyDock', 's4AncillaryI', 's4NoordHolland', 's4Gronext', 's4Manufacturing'];
    expect(new Set(tier2.map(yOf)).size).toBe(1);
    expect(new Set(tier3.map(yOf)).size).toBe(1);

    const nodes = entities.map((e) => {
      const p = positions.get(e.id)!;
      return { id: e.id, x: p.x, y: p.y };
    });
    const routed = routeOwnershipEdges({
      nodes,
      edges: edges.map((e) => ({ id: e.id, from: e.from_entity_id, to: e.to_entity_id })),
    });

    // Iedere neerwaartse edge is gerouteerd.
    for (const e of edges) expect(routed.has(e.id)).toBe(true);

    // Geen twee rails van verschillende moeders op dezelfde hoogte terwijl ze
    // horizontaal overlappen: dat wás de knoop.
    const centerX = (id: string) => positions.get(id)!.x + NODE_WIDTH / 2;
    type Rail = { y: number; min: number; max: number; group: string };
    const rails: Rail[] = [];
    for (const e of edges) {
      const r = routed.get(e.id)!;
      if (r.railY1 != null) {
        const sx = centerX(e.from_entity_id);
        const endX = r.detourX ?? centerX(e.to_entity_id);
        rails.push({
          y: r.railY1,
          min: Math.min(sx, endX),
          max: Math.max(sx, endX),
          group: `A|${e.from_entity_id}`,
        });
      }
      if (r.railY2 != null && r.detourX != null) {
        const tx = centerX(e.to_entity_id);
        rails.push({
          y: r.railY2,
          min: Math.min(r.detourX, tx),
          max: Math.max(r.detourX, tx),
          group: `B|${e.to_entity_id}`,
        });
      }
    }
    for (let i = 0; i < rails.length; i++) {
      for (let j = i + 1; j < rails.length; j++) {
        const a = rails[i];
        const b = rails[j];
        if (a.group === b.group) continue;
        const overlap = a.min < b.max && b.min < a.max;
        if (overlap) {
          expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(4);
        }
      }
    }

    // Lange verticalen blijven uit de kolommen van tussenliggende nodes.
    const rowYs = Array.from(new Set(nodes.map((n) => n.y))).sort((a, b) => a - b);
    for (const e of edges) {
      const r = routed.get(e.id)!;
      if (r.kind !== 'longskip' || r.detourX == null) continue;
      const srcY = positions.get(e.from_entity_id)!.y;
      const tgtY = positions.get(e.to_entity_id)!.y;
      const between = nodes.filter((n) => n.y > srcY && n.y < tgtY);
      for (const n of between) {
        expect(Math.abs(r.detourX - (n.x + NODE_WIDTH / 2))).toBeGreaterThanOrEqual(
          SAFE_HALF_WIDTH - 0.01,
        );
      }
      expect(rowYs.length).toBeGreaterThan(2);
    }
  });
});
