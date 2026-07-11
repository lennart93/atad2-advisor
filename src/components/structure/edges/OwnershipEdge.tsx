import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useInternalNode,
  useStore,
  type Edge,
  type EdgeProps,
  type ReactFlowState,
} from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';
import { getAppScale } from '@/lib/appScale';
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/structure/labelMeasure';
import { computeSafeDetourX, type RoutedEdgeSpec } from '@/lib/structure/edgeRouting';

// Herexport voor bestaande imports/tests; de implementatie woont in de
// routing-lib zodat de baan-planning en de fallback dezelfde logica delen.
export { computeSafeDetourX };

export interface PathInputs {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /**
   * Center-X positions of entities that sit strictly between source-row and
   * target-row in Y. The long-skip vertical must avoid these columns to
   * prevent the visual "edge runs behind a node" problem.
   * When omitted or empty, falls back to a half-step heuristic.
   * Alleen gebruikt door de legacy fallback (routing ontbreekt).
   */
  intermediateXs?: number[];
  /**
   * Baan-routing uit routeOwnershipEdges (StructureChart). Wanneer aanwezig
   * tekent de edge orthogonaal via de toegewezen rail-Y's, zodat horizontale
   * balken van verschillende moeders nooit op dezelfde hoogte samenvallen.
   * Ontbreekt de routing (los gesleepte node, opwaartse edge), dan valt de
   * tekening terug op het oude smoothstep/long-skip gedrag.
   */
  routing?: RoutedEdgeSpec | null;
}

/**
 * Orthogonaal pad langs hoekpunten met afgeronde bochten. Segmenten korter
 * dan de bocht-straal krijgen een kleinere straal zodat het pad nooit
 * "terugkrult".
 */
function roundedOrthPath(pts: Array<{ x: number; y: number }>): string {
  const r = 4;
  const p: Array<{ x: number; y: number }> = [];
  for (const pt of pts) {
    const last = p[p.length - 1];
    if (last && Math.abs(last.x - pt.x) < 0.01 && Math.abs(last.y - pt.y) < 0.01) continue;
    p.push(pt);
  }
  if (p.length < 2) return '';
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const prev = p[i - 1];
    const cur = p[i];
    const next = p[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rad = Math.min(r, inLen / 2, outLen / 2);
    if (rad < 0.5) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const inDx = Math.sign(cur.x - prev.x);
    const inDy = Math.sign(cur.y - prev.y);
    const outDx = Math.sign(next.x - cur.x);
    const outDy = Math.sign(next.y - cur.y);
    d += ` L ${cur.x - inDx * rad} ${cur.y - inDy * rad}`;
    d += ` Q ${cur.x} ${cur.y} ${cur.x + outDx * rad} ${cur.y + outDy * rad}`;
  }
  const last = p[p.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export interface PathResult {
  path: string;
  /** Long-skip = parent reaches a child >1 tier down OR into a row-wrap. */
  isLongSkip: boolean;
  /** X-column the long vertical drop sits in (only meaningful when isLongSkip). */
  detourX?: number;
}

/** Pure path computation, extracted for testability. */
export function computeOwnershipPath(p: PathInputs): PathResult {
  // Baan-routing aanwezig → orthogonaal tekenen via de toegewezen rails.
  if (p.routing) {
    const r = p.routing;
    if (r.kind === 'straight' || r.railY1 == null) {
      // Uitgelijnde bron/dochter → één schone verticaal. Zijn de X'en NIET
      // gelijk (een versleepte node, of routing die even achterloopt op de
      // live handle-posities), dan NOOIT een diagonale M→L trekken: val terug
      // op een haakse daal → verdeel → daal via de midlijn. Zo blijven de
      // segmenten altijd horizontaal/verticaal, ook buiten de nette layout.
      if (Math.abs(p.targetX - p.sourceX) < 0.5) {
        return {
          path: `M ${p.sourceX} ${p.sourceY} L ${p.targetX} ${p.targetY}`,
          isLongSkip: r.kind === 'longskip',
        };
      }
      const midY = (p.sourceY + p.targetY) / 2;
      const path = roundedOrthPath([
        { x: p.sourceX, y: p.sourceY },
        { x: p.sourceX, y: midY },
        { x: p.targetX, y: midY },
        { x: p.targetX, y: p.targetY },
      ]);
      return { path, isLongSkip: r.kind === 'longskip' };
    }
    if (r.kind === 'adjacent') {
      const path = roundedOrthPath([
        { x: p.sourceX, y: p.sourceY },
        { x: p.sourceX, y: r.railY1 },
        { x: p.targetX, y: r.railY1 },
        { x: p.targetX, y: p.targetY },
      ]);
      return { path, isLongSkip: false };
    }
    // longskip: via de daal-kolom; met of zonder invoeg-rail boven de dochter.
    const detourX = r.detourX ?? p.targetX;
    if (r.railY2 == null || Math.abs(detourX - p.targetX) < 0.5) {
      const path = roundedOrthPath([
        { x: p.sourceX, y: p.sourceY },
        { x: p.sourceX, y: r.railY1 },
        { x: p.targetX, y: r.railY1 },
        { x: p.targetX, y: p.targetY },
      ]);
      return { path, isLongSkip: true, detourX };
    }
    const path = roundedOrthPath([
      { x: p.sourceX, y: p.sourceY },
      { x: p.sourceX, y: r.railY1 },
      { x: detourX, y: r.railY1 },
      { x: detourX, y: r.railY2 },
      { x: p.targetX, y: r.railY2 },
      { x: p.targetX, y: p.targetY },
    ]);
    return { path, isLongSkip: true, detourX };
  }

  const isStraight = Math.abs(p.targetX - p.sourceX) < 5;
  const dy = Math.abs(p.targetY - p.sourceY);
  const isLongSkip = !isStraight && dy > 200;

  if (!isLongSkip) {
    const [path] = getSmoothStepPath({
      sourceX: p.sourceX, sourceY: p.sourceY,
      targetX: p.targetX, targetY: p.targetY,
      borderRadius: 4,
    });
    return { path, isLongSkip: false };
  }

  // Long-skip route: drop just under source, jog horizontally into a SAFE
  // column (preferably target.X, or a nearby gap if target.X is blocked by
  // an intermediate-row entity), drop the long way down in that safe column,
  // then jog horizontally back to target's column at busY2 (just above
  // target row) and drop into target's top handle. This keeps the long
  // vertical OUT of every intermediate-row entity body, so the line never
  // visually passes "behind" another node.
  const busY1 = p.sourceY + 37;
  const busY2 = p.targetY - 37;
  const xDir = p.targetX > p.sourceX ? 1 : -1;
  const detourX = computeSafeDetourX(
    p.targetX,
    p.sourceX,
    p.intermediateXs ?? [],
  );
  const r = 4;

  // If detourX equals targetX (no sideways step needed), the second half of
  // the path collapses to a straight vertical and the QQ-jog-back is a no-op.
  // Render it as a clean 3-segment path instead of an L-bend-back.
  if (Math.abs(detourX - p.targetX) < 0.5) {
    const path =
      `M ${p.sourceX} ${p.sourceY} ` +
      `L ${p.sourceX} ${busY1 - r} ` +
      `Q ${p.sourceX} ${busY1} ${p.sourceX + xDir * r} ${busY1} ` +
      `L ${p.targetX - xDir * r} ${busY1} ` +
      `Q ${p.targetX} ${busY1} ${p.targetX} ${busY1 + r} ` +
      `L ${p.targetX} ${p.targetY}`;
    return { path, isLongSkip: true, detourX };
  }

  // detourX is offset from targetX → need the jog-back at busY2.
  const xDir2 = p.targetX > detourX ? 1 : -1;
  const path =
    `M ${p.sourceX} ${p.sourceY} ` +
    `L ${p.sourceX} ${busY1 - r} ` +
    `Q ${p.sourceX} ${busY1} ${p.sourceX + xDir * r} ${busY1} ` +
    `L ${detourX - xDir * r} ${busY1} ` +
    `Q ${detourX} ${busY1} ${detourX} ${busY1 + r} ` +
    `L ${detourX} ${busY2 - r} ` +
    `Q ${detourX} ${busY2} ${detourX + xDir2 * r} ${busY2} ` +
    `L ${p.targetX - xDir2 * r} ${busY2} ` +
    `Q ${p.targetX} ${busY2} ${p.targetX} ${busY2 + r} ` +
    `L ${p.targetX} ${p.targetY}`;
  return { path, isLongSkip: true, detourX };
}

// Hoe ver onder de onderkant van de moeder het %-label op de lijn komt te
// staan in de "meerdere eigenaren"-modus (chart-px).
const PARENT_DROP_OFFSET = 22;

// Hoe ver BOVEN de top-handle van de dochter het %-label standaard rust als het
// niet in het midden van de lijn mag staan (chart-px). Net onder de bus.
const NEAR_CHILD_OFFSET = 14;

export interface DefaultLabelPosInput {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /**
   * How many visible % labels converge on this edge's CHILD (incl. itself).
   * >= 2 means several owners share the child.
   */
  convergingOwners: number;
  /**
   * How many ownership edges share this edge's PARENT (incl. itself). >= 2
   * means the parent fans out to siblings whose smooth-step routes form one
   * shared horizontal bus at the mid-line.
   */
  siblingCount: number;
}

/**
 * Smart resting position (absolute chart coords) for an ownership-% label,
 * before any manual offset. Pure so the placement rules are unit-testable.
 *
 * The whole placement policy lives here:
 * - Several owners on one child → drop each % under its OWN parent so they
 *   spread out instead of stacking above the shared child. BUT only when that
 *   parent owns a single child: under a fan-out hub "below the parent" could
 *   mean any of its lines, so a hub's converging % goes to the child end.
 * - A lone straight edge centres its % on the line (cleanest single drop).
 * - A straight edge under a fan-out hub would land its centred % on the
 *   siblings' shared bus, so it drops to the child like a non-straight edge.
 * - Any other edge rests its % just above its child, below the bus.
 */
export function computeDefaultLabelPos(p: DefaultLabelPosInput): { x: number; y: number } {
  const isStraight = Math.abs(p.targetX - p.sourceX) < 5;
  const range = p.targetY - p.sourceY;
  const parentIsHub = p.siblingCount >= 2;

  // Drop under the own parent only when that parent has a single, unambiguous
  // line down — never under a fan-out hub.
  const underParent = p.convergingOwners >= 2 && !parentIsHub;
  if (underParent) {
    return { x: p.sourceX, y: p.sourceY + PARENT_DROP_OFFSET };
  }

  const nearChild = !isStraight || parentIsHub;
  const t =
    nearChild && Math.abs(range) > 1
      ? (p.targetY - NEAR_CHILD_OFFSET - p.sourceY) / range
      : 0.5;
  return { x: p.targetX, y: p.sourceY + range * t };
}

export interface OwnershipEdgeData extends Record<string, unknown> {
  ownership_pct: number | null;
  onPctChange?: (edgeId: string, newPct: number) => void;
  /**
   * Center-X positions of entities sitting strictly between source-row and
   * target-row in Y. Used by long-skip routing to keep the long vertical
   * out of intermediate-row entity columns. Computed in StructureChart.
   */
  intermediateXs?: number[];
  /**
   * Baan-routing (rail-Y's + daal-kolom) uit routeOwnershipEdges, berekend in
   * StructureChart over de hele kaart. Null/afwezig → legacy tekening.
   */
  routing?: RoutedEdgeSpec | null;
  /**
   * Persisted free 2D label offset (chart px) from the target's top handle.
   * NULL on both = not hand-placed; fall back to legacy label_t, then the
   * smart default position.
   */
  label_dx?: number | null;
  label_dy?: number | null;
  /**
   * Legacy: persisted label position along the source→target line, 0..1.
   * Still honored for charts saved before 2D offsets existed. First 2D drag
   * writes dx/dy and clears this.
   */
  label_t?: number | null;
  /**
   * How many visible % labels converge on this edge's child (incl. itself).
   * >= 2 → place the label under its own parent instead of above the shared
   * child, so siblings don't stack and none sits on the bus crossing.
   */
  convergingLabels?: number;
  /**
   * How many ownership edges share this edge's parent (incl. itself). >= 2
   * means the parent fans out to siblings whose horizontal bus crosses the
   * mid-line, so a STRAIGHT child must rest its % below the bus, not on it.
   */
  siblingCount?: number;
  /** User clicked the label's × — suppress the % on the chart (value kept). */
  label_hidden?: boolean | null;
  onLabelMove?: (edgeId: string, dx: number, dy: number) => void;
  onLabelHide?: (edgeId: string) => void;
}

export type OwnershipEdgeType = Edge<OwnershipEdgeData, 'ownership'>;

export function OwnershipEdge({
  sourceX: measuredSourceX,
  sourceY: measuredSourceY,
  targetX: measuredTargetX,
  targetY: measuredTargetY,
  source,
  target,
  id,
  data,
  selected,
}: EdgeProps<OwnershipEdgeType>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(data?.ownership_pct ?? ''));
  // Lokale offset-draft terwijl je sleept (scherm-px omgerekend naar chart-px
  // via de viewport-zoom). Pas op mouseup gaat {dx,dy} via onLabelMove naar de
  // DB. NULL = geen actieve sleep, gebruik de persisted/default rustpositie.
  const [dragDraft, setDragDraft] = useState<{ dx: number; dy: number } | null>(null);
  const [hover, setHover] = useState(false);
  const zoom = useStore((s: ReactFlowState) => s.transform[2]);

  // De sourceX/targetY die React Flow aanlevert komen uit een DOM-meting van
  // de handles (getBoundingClientRect), en die meting telt de globale
  // html-zoom (--app-scale) mee terwijl de node-posities dat niet doen. Elk
  // eindpunt verschuift daardoor 15%: 12px rechts van het kaart-midden en de
  // bron-stub begint onder de kaart. De ankers zijn hier deterministisch —
  // altijd midden-onder de bron en midden-boven de dochter op de vaste
  // 160x100-geometrie — dus reken ze zelf uit vanaf de node-posities. De
  // gemeten waarden blijven alleen als vangnet voor een onbekende node.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceX = sourceNode
    ? sourceNode.internals.positionAbsolute.x + NODE_WIDTH / 2
    : measuredSourceX;
  const sourceY = sourceNode
    ? sourceNode.internals.positionAbsolute.y + NODE_HEIGHT
    : measuredSourceY;
  const targetX = targetNode
    ? targetNode.internals.positionAbsolute.x + NODE_WIDTH / 2
    : measuredTargetX;
  const targetY = targetNode ? targetNode.internals.positionAbsolute.y : measuredTargetY;

  const { path } = computeOwnershipPath({
    sourceX, sourceY, targetX, targetY,
    intermediateXs: data?.intermediateXs,
    routing: data?.routing,
  });

  const range = targetY - sourceY;

  // Slimme standaardpositie (absolute chart-coords). Het hele beleid (midden,
  // vlak boven de dochter, of onder de eigen moeder) zit in computeDefaultLabelPos;
  // hier geven we alleen de tellingen door: hoeveel eigenaren op deze dochter
  // samenkomen en hoeveel lijnen uit de moeder vertakken.
  const { x: defX, y: defY } = computeDefaultLabelPos({
    sourceX, sourceY, targetX, targetY,
    convergingOwners: data?.convergingLabels ?? 0,
    siblingCount: data?.siblingCount ?? 0,
  });

  // Handmatige offsets worden bewaard t.o.v. een STABIEL referentiepunt (de
  // top-handle van de dochter) zodat ze niet verspringen als de modus wisselt.
  const refX = targetX;
  const refY = targetY;

  // Rustpositie als offset t.o.v. de referentie. Voorrang: handmatige 2D-offset
  // > legacy label_t (alleen verticaal, op de dochter-kolom) > slimme default.
  let restDx: number;
  let restDy: number;
  if (data?.label_dx != null || data?.label_dy != null) {
    restDx = data?.label_dx ?? 0;
    restDy = data?.label_dy ?? 0;
  } else if (data?.label_t != null && Math.abs(range) > 1) {
    restDx = targetX - refX;
    restDy = sourceY + range * data.label_t - refY;
  } else {
    restDx = defX - refX;
    restDy = defY - refY;
  }

  const dx = dragDraft?.dx ?? restDx;
  const dy = dragDraft?.dy ?? restDy;
  const labelX = refX + dx;
  const labelY = refY + dy;

  const save = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) data?.onPctChange?.(id, parsed);
    setEditing(false);
  };

  const showLabel = !data?.label_hidden && (data?.ownership_pct != null || editing);

  // Click vs drag op het %-vakje: <4px beweging = klik (edit-modus), anders
  // vrij 2D-slepen. Listeners worden imperatief geattacht/gedetacht per
  // sleep-sessie zodat closures fris blijven en er geen verweesde
  // window-listeners achterblijven.
  const startDragOrEdit = (e: React.MouseEvent) => {
    if (editing) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startDx = dx;
    const startDy = dy;
    let moved = false;

    // clientX/Y zijn scherm-px waar de globale html-zoom al in zit; deel dus
    // door de viewport-zoom EN de app-schaal om op chart-px uit te komen.
    const z = Math.max(0.01, zoom * getAppScale());

    const onMove = (ev: MouseEvent) => {
      const ddxScreen = ev.clientX - startX;
      const ddyScreen = ev.clientY - startY;
      if (!moved && Math.hypot(ddxScreen, ddyScreen) < 4) return;
      moved = true;
      setDragDraft({ dx: startDx + ddxScreen / z, dy: startDy + ddyScreen / z });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (moved) {
        setDragDraft((cur) => {
          if (cur) data?.onLabelMove?.(id, cur.dx, cur.dy);
          return null;
        });
      } else {
        setDraft(String(data?.ownership_pct ?? ''));
        setEditing(true);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const dragging = dragDraft != null;
  // De × verschijnt alleen bij hover (en niet tijdens bewerken/slepen), zodat
  // de kaart rustig blijft en de knop niet in de PNG-capture belandt.
  const showHide =
    hover && !editing && !dragging && data?.ownership_pct != null && data?.onLabelHide != null;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? PALETTE.ownershipSelectedStroke : PALETTE.ownershipStroke,
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            // React Flow zet de edge-label-laag op pointer-events:none, dus zonder
            // 'all' lekken klikken door naar het canvas en kun je niet slepen of
            // wegklikken. nodrag/nopan houden het pannen/slepen van het canvas
            // tegen terwijl je het label versleept.
            className="nodrag nopan"
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: PALETTE.background,
              padding: '1px 4px',
              fontFamily: "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontSize: 11,
              fontWeight: 500,
              color: PALETTE.textMuted,
              fontVariantNumeric: 'tabular-nums',
              pointerEvents: 'all',
              // Zorg dat het %-vakje boven de gestippelde FE-rand komt te liggen.
              zIndex: 5,
            }}
          >
            {editing ? (
              <input
                type="number"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') {
                    setDraft(String(data?.ownership_pct ?? ''));
                    setEditing(false);
                  }
                }}
                // Editor opens on the user's own click; moving focus into it is expected.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                style={{
                  width: 50, fontSize: 11, padding: '2px 4px',
                  border: '1px solid #8a8479', borderRadius: 2,
                  fontFamily: "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif",
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              // Mouse drag affordance on the chart label; the keyboard path for
              // editing the percentage is the Ownership field in the edge inspector panel.
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions
              <div
                onMouseDown={startDragOrEdit}
                style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
                title="Drag to move, click to edit"
              >
                {data?.ownership_pct != null ? `${data.ownership_pct}%` : ''}
              </div>
            )}
            {showHide && (
              <button
                type="button"
                aria-label="Hide percentage"
                title="Hide this percentage"
                data-snapshot-exclude="true"
                // mousedown niet laten doorlekken naar de sleep-handler.
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onClick={(e) => { e.stopPropagation(); data?.onLabelHide?.(id); }}
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -7,
                  width: 15,
                  height: 15,
                  padding: 0,
                  borderRadius: 8,
                  border: '1px solid #b5b4ad',
                  background: '#ffffff',
                  color: '#5f5e5a',
                  fontSize: 11,
                  lineHeight: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 6,
                }}
              >
                ×
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
