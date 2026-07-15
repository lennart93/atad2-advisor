// Orthogonal edge routing for the structure chart.
//
// Probleem dat dit oplost: React Flow's smoothstep legt de horizontale balk
// van ELKE edge op precies hetzelfde midden tussen twee rijen. Zodra meerdere
// moeders in dezelfde rij dochters (deels gedeeld) in de rij eronder bezitten,
// lopen al die balken op dezelfde hoogte dwars over elkaar heen — de "knoop".
//
// De aanpak hier is klassiek org-chart: de ruimte tussen twee rijen wordt
// verdeeld in horizontale BANEN (lanes). Elke moeder krijgt voor haar waaier
// één eigen rail; rails die elkaar horizontaal zouden raken komen in
// verschillende banen. Lange lijnen (meer dan één rij overslaan) dalen via een
// vrije kolom (niet door een node heen, niet bovenop een andere lange lijn) en
// voegen vlak boven de dochter weer in.
//
// De planning (planLanes) is puur en werkt op rij-volgorde + X-posities,
// zodat tierLayout er de benodigde tussenruimte-hoogte uit kan afleiden en
// StructureChart er — met identiek resultaat — de concrete Y's uit rekent.

import { NODE_WIDTH, NODE_HEIGHT } from './labelMeasure';

// Minimale horizontale ruimte tussen twee nodes in een rij. Woont hier (en
// niet in tierLayout) zodat tierLayout ↔ edgeRouting geen import-cirkel vormen;
// tierLayout re-exporteert hem voor bestaande imports.
export const MIN_GAP = 32;

// Kolom-stappen voor het zoeken van een vrije daal-kolom; matcht de packing
// van tierLayout zodat een detour netjes in een kolom-gat valt.
const COL_STEP = NODE_WIDTH + MIN_GAP;
const COL_STEP_HALF = COL_STEP / 2;

// Minimale vrije ruimte tussen een daal-kolom en een node-lichaam:
// halve nodebreedte + 4px marge zodat de lijn nooit een rand schampt.
export const SAFE_HALF_WIDTH = NODE_WIDTH / 2 + 4;

// Twee losse lange verticalen mogen niet (bijna) samenvallen.
const DETOUR_MIN_SEPARATION = 16;

// Verticale maatvoering van de banen in een tussenruimte. LANE_TOP_PAD houdt
// het "%-onder-de-moeder"-label (sourceY + 22, zie OwnershipEdge) vrij van de
// bovenste rail; LANE_BOTTOM_PAD houdt het "%-boven-de-dochter"-label
// (targetY - 22, verhoogd zodat het vrij blijft van de TAXPAYER-badge die 8px
// boven de kaart uitsteekt) vrij van de onderste rail.
export const LANE_STEP = 16;
export const LANE_TOP_PAD = 32;
export const LANE_BOTTOM_PAD = 32;

// Horizontale marge waarbinnen twee rails NIET dezelfde baan mogen delen.
const RAIL_CLEARANCE = 24;

// Verticaal uitgelijnd genoeg om als rechte lijn te tekenen.
const STRAIGHT_EPS = 5;

// Nodes waarvan de top binnen deze afstand ligt horen bij dezelfde rij.
// Na een layout-pass is dit exact 0; de tolerantie vangt handmatig gesleepte
// nodes die "vrijwel" op de rij staan.
const ROW_TOLERANCE = 6;

/**
 * Zoek een vrije kolom voor een lange verticale daal-lijn. Voorkeur: de kolom
 * van de dochter zelf (rechte val in haar top-handle); anders stapsgewijs
 * opzij in kolom-gaten, met lichte voorkeur richting de moeder.
 */
export function computeSafeDetourX(
  targetX: number,
  sourceX: number,
  intermediateXs: number[],
): number {
  return pickDetourColumn(targetX, sourceX, intermediateXs, []);
}

function pickDetourColumn(
  targetX: number,
  sourceX: number,
  intermediateXs: number[],
  takenXs: number[],
): number {
  const isFree = (x: number) =>
    !intermediateXs.some((ix) => Math.abs(x - ix) < SAFE_HALF_WIDTH) &&
    !takenXs.some((tx) => Math.abs(x - tx) < DETOUR_MIN_SEPARATION);

  if (isFree(targetX)) return targetX;

  const xDir = targetX > sourceX ? 1 : -1;
  const offsets = [
    -xDir * COL_STEP_HALF, xDir * COL_STEP_HALF,
    -xDir * COL_STEP,      xDir * COL_STEP,
    -xDir * COL_STEP * 1.5, xDir * COL_STEP * 1.5,
    -xDir * COL_STEP * 2,   xDir * COL_STEP * 2,
  ];
  for (const dx of offsets) {
    const candidate = targetX + dx;
    if (isFree(candidate)) return candidate;
  }
  return targetX; // botsing onvermijdelijk bij deze layout
}

export interface LaneRowSlot {
  id: string;
  /** CENTER-x van de node. */
  x: number;
}

export interface LanePlanEdge {
  id: string;
  from: string;
  to: string;
}

export interface EdgeLanePlan {
  kind: 'straight' | 'adjacent' | 'longskip';
  /** Gap-index onder de bron-rij (gap g = tussen rij g en rij g+1). */
  sourceGap: number;
  /** Baan van de rail onder de bron; null = geen rail (rechte lijn). */
  laneA: number | null;
  /** Kolom van de lange verticaal (alleen longskip). */
  detourX: number | null;
  /** Gap-index boven de doel-rij (alleen longskip met zijstap). */
  targetGap: number | null;
  /** Baan van de invoeg-rail boven de dochter; null = rechte val de dochter in. */
  laneB: number | null;
}

export interface LanePlan {
  byEdge: Map<string, EdgeLanePlan>;
  /** Aantal banen per gap (index = gap tussen rij i en rij i+1). */
  laneCountByGap: number[];
}

interface RailGroup {
  key: string;
  gap: number;
  min: number;
  max: number;
}

// Een corridor: aaneengesloten x-interval dat in ALLE tussenliggende rijen
// van een lange lijn vrij is van node-lichamen (incl. SAFE_HALF_WIDTH marge).
interface Corridor {
  L: number;
  R: number;
}

/**
 * Vrije daal-corridors tussen de node-kolommen van de tussenliggende rijen.
 * De uiterste corridors zijn open (Infinity); een corridor mag 0px breed zijn
 * (precies één lijnpositie).
 */
function freeCorridors(intermediateXs: number[]): Corridor[] {
  const cols = Array.from(new Set(intermediateXs)).sort((a, b) => a - b);
  if (cols.length === 0) return [{ L: -Infinity, R: Infinity }];
  const out: Corridor[] = [{ L: -Infinity, R: cols[0] - SAFE_HALF_WIDTH }];
  for (let i = 0; i < cols.length - 1; i++) {
    const L = cols[i] + SAFE_HALF_WIDTH;
    const R = cols[i + 1] - SAFE_HALF_WIDTH;
    if (R - L >= -0.01) out.push({ L, R });
  }
  out.push({ L: cols[cols.length - 1] + SAFE_HALF_WIDTH, R: Infinity });
  return out;
}

const clampX = (x: number, c: Corridor) => Math.min(Math.max(x, c.L), c.R);

/**
 * Pure banen-planning op rij-volgorde + X-posities (Y speelt geen rol).
 * Deterministisch: dezelfde rijen + edges geven altijd hetzelfde plan, zodat
 * tierLayout (gap-hoogtes) en StructureChart (concrete Y's) op één lijn zitten.
 *
 * Lange lijnen kiezen hun daal-kolom in twee stappen:
 *  1. corridor-keuze: elke vrije corridor krijgt een kruisings-score (jog die
 *     over andermans waaier-rail zou lopen weegt zwaarst, dan verticalen die
 *     dwars door een rail prikken), daarna telt afstand tot de dochter;
 *  2. verdeling: lijnen die dezelfde corridor kozen worden — gesorteerd op
 *     dochter-kolom — naast elkaar gelegd, zodat hun jogs elkaar niet kruisen.
 *     Lijnen naar dezelfde dochter delen één kolom (ze voegen toch samen).
 */
export function planLanes(rows: LaneRowSlot[][], edges: LanePlanEdge[]): LanePlan {
  const rowOf = new Map<string, number>();
  const xOf = new Map<string, number>();
  rows.forEach((row, i) => {
    for (const slot of row) {
      rowOf.set(slot.id, i);
      xOf.set(slot.id, slot.x);
    }
  });

  const byEdge = new Map<string, EdgeLanePlan>();
  const railGroups = new Map<string, RailGroup>();

  const extendGroup = (key: string, gap: number, ...xs: number[]) => {
    let g = railGroups.get(key);
    if (!g) {
      g = { key, gap, min: Math.min(...xs), max: Math.max(...xs) };
      railGroups.set(key, g);
      return;
    }
    for (const x of xs) {
      if (x < g.min) g.min = x;
      if (x > g.max) g.max = x;
    }
  };

  // Stabiele volgorde zodat de planning deterministisch is.
  const ordered = edges
    .filter((e) => {
      const r1 = rowOf.get(e.from);
      const r2 = rowOf.get(e.to);
      return r1 !== undefined && r2 !== undefined && r2 > r1;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // ---- Pas 1: aangrenzende edges. Hun waaier-rails (A) staan daarna vast,
  // zodat de corridor-score van lange lijnen er rekening mee kan houden.
  const longs: typeof ordered = [];
  for (const e of ordered) {
    const r1 = rowOf.get(e.from)!;
    const r2 = rowOf.get(e.to)!;
    const sx = xOf.get(e.from)!;
    const tx = xOf.get(e.to)!;
    if (r2 > r1 + 1) {
      longs.push(e);
      continue;
    }
    if (Math.abs(tx - sx) < STRAIGHT_EPS) {
      byEdge.set(e.id, {
        kind: 'straight', sourceGap: r1,
        laneA: null, detourX: null, targetGap: null, laneB: null,
      });
    } else {
      extendGroup(`A|${r1}|${e.from}`, r1, sx, tx);
      byEdge.set(e.id, {
        kind: 'adjacent', sourceGap: r1,
        laneA: -1, detourX: null, targetGap: null, laneB: null, // laneA volgt na kleuring
      });
    }
  }

  const aGroupsInGap = (gap: number): RailGroup[] =>
    Array.from(railGroups.values()).filter((g) => g.gap === gap && g.key.startsWith('A|'));

  // ---- Pas 2: corridor-keuze per lange lijn.
  interface LongPick {
    e: LanePlanEdge;
    r1: number;
    r2: number;
    sx: number;
    tx: number;
    corridor: Corridor;
    desired: number;
  }
  const picks: LongPick[] = [];
  for (const e of longs) {
    const r1 = rowOf.get(e.from)!;
    const r2 = rowOf.get(e.to)!;
    const sx = xOf.get(e.from)!;
    const tx = xOf.get(e.to)!;
    const gapB = r2 - 1;

    const intermediateXs: number[] = [];
    for (let r = r1 + 1; r < r2; r++) {
      for (const slot of rows[r]) intermediateXs.push(slot.x);
    }

    let best: { corridor: Corridor; rep: number; score: number; dTx: number; dSx: number } | null =
      null;
    for (const corridor of freeCorridors(intermediateXs)) {
      const rep = clampX(tx, corridor);
      let score = 0;
      // Jog over andermans waaier-rail heen = het zwaarst (vlecht-effect).
      const jogMin = Math.min(rep, tx);
      const jogMax = Math.max(rep, tx);
      for (const g of aGroupsInGap(gapB)) {
        if (jogMax - jogMin >= 0.5 && jogMin < g.max && g.min < jogMax) score += 2;
        if (g.min < rep && rep < g.max) score += 1; // verticaal dwars door de rail
      }
      for (let gg = r1 + 1; gg < gapB; gg++) {
        for (const g of aGroupsInGap(gg)) {
          if (g.min < rep && rep < g.max) score += 1;
        }
      }
      const cand = { corridor, rep, score, dTx: Math.abs(rep - tx), dSx: Math.abs(rep - sx) };
      if (
        best === null ||
        cand.score < best.score ||
        (cand.score === best.score &&
          (cand.dTx < best.dTx ||
            (cand.dTx === best.dTx &&
              (cand.dSx < best.dSx || (cand.dSx === best.dSx && cand.corridor.L < best.corridor.L)))))
      ) {
        best = cand;
      }
    }
    picks.push({ e, r1, r2, sx, tx, corridor: best!.corridor, desired: best!.rep });
  }

  // ---- Pas 3: kolom-verdeling binnen elke corridor. Lijnen naar dezelfde
  // dochter delen één kolom; verder gesorteerd op gewenste positie zodat de
  // jogs links/rechts netjes uitwaaieren zonder elkaar te kruisen.
  const byCorridor = new Map<string, LongPick[]>();
  for (const p of picks) {
    const key = `${p.corridor.L}|${p.corridor.R}`;
    const list = byCorridor.get(key) ?? [];
    list.push(p);
    byCorridor.set(key, list);
  }

  for (const members of byCorridor.values()) {
    const byTarget = new Map<string, LongPick[]>();
    for (const p of members) {
      const list = byTarget.get(p.e.to) ?? [];
      list.push(p);
      byTarget.set(p.e.to, list);
    }
    const cols = Array.from(byTarget.values()).sort(
      (a, b) => a[0].desired - b[0].desired || a[0].e.to.localeCompare(b[0].e.to),
    );
    const { L, R } = members[0].corridor;
    let sep = DETOUR_MIN_SEPARATION;
    if (cols.length > 1 && Number.isFinite(L) && Number.isFinite(R)) {
      sep = Math.min(sep, Math.max(6, (R - L) / (cols.length - 1)));
    }
    const xs = cols.map((c) => c[0].desired);
    for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + sep);
    if (Number.isFinite(R) && xs[xs.length - 1] > R) {
      const over = xs[xs.length - 1] - R;
      for (let i = 0; i < xs.length; i++) xs[i] -= over;
    }
    if (Number.isFinite(L) && xs[0] < L) {
      xs[0] = L;
      for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + sep);
    }

    cols.forEach((colMembers, i) => {
      const detourX = xs[i];
      for (const p of colMembers) {
        const gapB = p.r2 - 1;
        const needsJogBack = Math.abs(detourX - p.tx) >= 0.5;
        // Recht onder de bron én recht boven de dochter → pure verticale lijn.
        if (!needsJogBack && Math.abs(p.tx - p.sx) < STRAIGHT_EPS) {
          byEdge.set(p.e.id, {
            kind: 'straight', sourceGap: p.r1,
            laneA: null, detourX: null, targetGap: null, laneB: null,
          });
          continue;
        }
        extendGroup(`A|${p.r1}|${p.e.from}`, p.r1, p.sx, detourX);
        if (needsJogBack) extendGroup(`B|${gapB}|${p.e.to}`, gapB, detourX, p.tx);
        byEdge.set(p.e.id, {
          kind: 'longskip', sourceGap: p.r1,
          laneA: -1, detourX,
          targetGap: needsJogBack ? gapB : null,
          laneB: needsJogBack ? -1 : null,
        });
      }
    });
  }

  // Baan-toewijzing per gap: interval-kleuring, in twee klassen. Waaier-rails
  // (A) krijgen de bovenste banen, invoeg-rails (B) liggen daar altijd ONDER
  // (dicht bij de dochter). Zo daalt de staart van een lange lijn nooit dwars
  // door — of bovenop — de bron-daal van een moeder in de rij erboven.
  const laneOfGroup = new Map<string, number>();
  const gaps = new Set<number>();
  for (const g of railGroups.values()) gaps.add(g.gap);
  const laneCountByGap: number[] = new Array(Math.max(rows.length - 1, 0)).fill(0);

  const colorClass = (groups: RailGroup[], laneOffset: number): number => {
    const lanes: Array<Array<{ min: number; max: number }>> = [];
    for (const g of groups) {
      let lane = 0;
      for (; lane < lanes.length; lane++) {
        const clash = lanes[lane].some(
          (o) => g.min < o.max + RAIL_CLEARANCE && o.min < g.max + RAIL_CLEARANCE,
        );
        if (!clash) break;
      }
      if (lane === lanes.length) lanes.push([]);
      lanes[lane].push({ min: g.min, max: g.max });
      laneOfGroup.set(g.key, laneOffset + lane);
    }
    return lanes.length;
  };

  for (const gap of gaps) {
    const inGap = Array.from(railGroups.values())
      .filter((g) => g.gap === gap)
      .sort((a, b) => a.min - b.min || a.max - b.max || a.key.localeCompare(b.key));
    const aCount = colorClass(inGap.filter((g) => g.key.startsWith('A|')), 0);
    const bCount = colorClass(inGap.filter((g) => g.key.startsWith('B|')), aCount);
    if (gap >= 0 && gap < laneCountByGap.length) laneCountByGap[gap] = aCount + bCount;
  }

  // Vul de definitieve baan-indexen in.
  const edgeById = new Map(ordered.map((e) => [e.id, e]));
  for (const [id, plan] of byEdge) {
    const edge = edgeById.get(id)!;
    if (plan.laneA === -1) {
      plan.laneA = laneOfGroup.get(`A|${plan.sourceGap}|${edge.from}`) ?? 0;
    }
    if (plan.laneB === -1) {
      plan.laneB = laneOfGroup.get(`B|${plan.targetGap}|${edge.to}`) ?? 0;
    }
  }

  return { byEdge, laneCountByGap };
}

/** Benodigde hoogte van een tussenruimte voor `laneCount` banen. */
export function gapHeightForLanes(laneCount: number, baseGap: number): number {
  if (laneCount <= 1) return baseGap;
  return Math.max(baseGap, LANE_TOP_PAD + LANE_BOTTOM_PAD + (laneCount - 1) * LANE_STEP);
}

export interface RoutedNode {
  id: string;
  /** Top-left, zoals React Flow posities. */
  x: number;
  y: number;
}

export interface RoutedEdgeSpec {
  kind: 'straight' | 'adjacent' | 'longskip';
  /** Y van de rail onder de bron (null bij een rechte lijn). */
  railY1: number | null;
  /** Kolom van de lange verticaal (alleen longskip). */
  detourX: number | null;
  /** Y van de invoeg-rail boven de dochter (null = rechte val). */
  railY2: number | null;
}

/**
 * Concrete routing vanuit live posities: clustert nodes in rijen, plant de
 * banen en rekent per edge de rail-Y's uit. Edges die niet strikt omlaag lopen
 * (zelfde rij, omhoog, onbekende node) ontbreken in de map — de edge-component
 * valt daar terug op de oude smoothstep-tekening.
 */
export function routeOwnershipEdges(args: {
  nodes: RoutedNode[];
  edges: LanePlanEdge[];
  nodeWidth?: number;
  nodeHeight?: number;
}): Map<string, RoutedEdgeSpec> {
  const w = args.nodeWidth ?? NODE_WIDTH;
  const h = args.nodeHeight ?? NODE_HEIGHT;
  const out = new Map<string, RoutedEdgeSpec>();
  if (args.nodes.length === 0) return out;

  // Rijen: cluster op top-Y met kleine tolerantie.
  const sorted = [...args.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rowsNodes: RoutedNode[][] = [];
  for (const n of sorted) {
    const last = rowsNodes[rowsNodes.length - 1];
    if (last && Math.abs(n.y - last[0].y) <= ROW_TOLERANCE) {
      last.push(n);
    } else {
      rowsNodes.push([n]);
    }
  }

  const laneRows: LaneRowSlot[][] = rowsNodes.map((row) =>
    row.map((n) => ({ id: n.id, x: n.x + w / 2 })),
  );
  const rowTop = rowsNodes.map((row) => Math.min(...row.map((n) => n.y)));
  const rowBottom = rowsNodes.map((row) => Math.max(...row.map((n) => n.y + h)));

  const plan = planLanes(laneRows, args.edges);

  // Rail-Y per (gap, lane): banen gecentreerd in de bruikbare band van de gap.
  const laneY = (gap: number, lane: number): number => {
    const gapTop = rowBottom[gap];
    const gapBottom = rowTop[gap + 1];
    const L = Math.max(plan.laneCountByGap[gap] ?? 1, 1);
    const bandTop = gapTop + LANE_TOP_PAD;
    const bandBottom = gapBottom - LANE_BOTTOM_PAD;
    if (bandBottom <= bandTop) return gapTop + (gapBottom - gapTop) / 2;
    const step = L > 1 ? Math.min(LANE_STEP, (bandBottom - bandTop) / (L - 1)) : 0;
    const center = (bandTop + bandBottom) / 2;
    return center - ((L - 1) / 2) * step + lane * step;
  };

  for (const [id, p] of plan.byEdge) {
    out.set(id, {
      kind: p.kind,
      railY1: p.laneA != null ? laneY(p.sourceGap, p.laneA) : null,
      detourX: p.detourX,
      railY2: p.laneB != null && p.targetGap != null ? laneY(p.targetGap, p.laneB) : null,
    });
  }
  return out;
}
