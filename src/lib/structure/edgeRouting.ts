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
// (targetY - 14) vrij van de onderste rail.
export const LANE_STEP = 16;
export const LANE_TOP_PAD = 28;
export const LANE_BOTTOM_PAD = 24;

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

/**
 * Pure banen-planning op rij-volgorde + X-posities (Y speelt geen rol).
 * Deterministisch: dezelfde rijen + edges geven altijd hetzelfde plan, zodat
 * tierLayout (gap-hoogtes) en StructureChart (concrete Y's) op één lijn zitten.
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
  // Al vergeven daal-kolommen: {x, vanaf-rij, tot-rij, dochter}. Lijnen naar
  // DEZELFDE dochter mogen een kolom delen (ze voegen toch samen), lijnen naar
  // verschillende dochters niet.
  const takenDetours: Array<{ x: number; fromRow: number; toRow: number; to: string }> = [];

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

  // Stabiele volgorde zodat detour-toewijzing deterministisch is.
  const ordered = edges
    .filter((e) => {
      const r1 = rowOf.get(e.from);
      const r2 = rowOf.get(e.to);
      return r1 !== undefined && r2 !== undefined && r2 > r1;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const e of ordered) {
    const r1 = rowOf.get(e.from)!;
    const r2 = rowOf.get(e.to)!;
    const sx = xOf.get(e.from)!;
    const tx = xOf.get(e.to)!;
    const gapA = r1;
    const isAligned = Math.abs(tx - sx) < STRAIGHT_EPS;

    if (r2 === r1 + 1) {
      if (isAligned) {
        byEdge.set(e.id, {
          kind: 'straight', sourceGap: gapA,
          laneA: null, detourX: null, targetGap: null, laneB: null,
        });
      } else {
        extendGroup(`A|${gapA}|${e.from}`, gapA, sx, tx);
        byEdge.set(e.id, {
          kind: 'adjacent', sourceGap: gapA,
          laneA: -1, detourX: null, targetGap: null, laneB: null, // laneA volgt na kleuring
        });
      }
      continue;
    }

    // Lange lijn: verzamel de node-kolommen van de tussenliggende rijen.
    const intermediateXs: number[] = [];
    for (let r = r1 + 1; r < r2; r++) {
      for (const slot of rows[r]) intermediateXs.push(slot.x);
    }
    const relevantTaken = takenDetours
      .filter((d) => d.to !== e.to && d.fromRow < r2 && d.toRow > r1)
      .map((d) => d.x);

    // Recht boven elkaar én de kolom is vrij → pure verticale lijn.
    if (isAligned) {
      const columnFree =
        !intermediateXs.some((ix) => Math.abs(tx - ix) < SAFE_HALF_WIDTH) &&
        !relevantTaken.some((dx) => Math.abs(tx - dx) < DETOUR_MIN_SEPARATION);
      if (columnFree) {
        takenDetours.push({ x: tx, fromRow: r1, toRow: r2, to: e.to });
        byEdge.set(e.id, {
          kind: 'straight', sourceGap: gapA,
          laneA: null, detourX: null, targetGap: null, laneB: null,
        });
        continue;
      }
    }

    const detourX = pickDetourColumn(tx, sx, intermediateXs, relevantTaken);
    takenDetours.push({ x: detourX, fromRow: r1, toRow: r2, to: e.to });
    extendGroup(`A|${gapA}|${e.from}`, gapA, sx, detourX);

    const needsJogBack = Math.abs(detourX - tx) >= 0.5;
    const gapB = r2 - 1;
    if (needsJogBack) extendGroup(`B|${gapB}|${e.to}`, gapB, detourX, tx);

    byEdge.set(e.id, {
      kind: 'longskip', sourceGap: gapA,
      laneA: -1, detourX,
      targetGap: needsJogBack ? gapB : null,
      laneB: needsJogBack ? -1 : null,
    });
  }

  // Baan-toewijzing per gap: interval-kleuring. Rails die elkaar (met marge)
  // horizontaal overlappen komen in verschillende banen; niet-overlappende
  // rails mogen een baan delen.
  const laneOfGroup = new Map<string, number>();
  const gaps = new Set<number>();
  for (const g of railGroups.values()) gaps.add(g.gap);
  const laneCountByGap: number[] = new Array(Math.max(rows.length - 1, 0)).fill(0);

  for (const gap of gaps) {
    const groups = Array.from(railGroups.values())
      .filter((g) => g.gap === gap)
      .sort((a, b) => a.min - b.min || a.max - b.max || a.key.localeCompare(b.key));
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
      laneOfGroup.set(g.key, lane);
    }
    if (gap >= 0 && gap < laneCountByGap.length) laneCountByGap[gap] = lanes.length;
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
