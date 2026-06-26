import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useStore,
  type Edge,
  type EdgeProps,
  type ReactFlowState,
} from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';
import { NODE_WIDTH } from '@/lib/structure/labelMeasure';
import { MIN_GAP } from '@/lib/structure/tierLayout';

// Half-column step used as a probe distance when looking for a safe detour
// column away from target.X. Matches tierLayout's column packing.
const COL_STEP = NODE_WIDTH + MIN_GAP;
const COL_STEP_HALF = COL_STEP / 2;
// Minimum clearance between the detour vertical and any intermediate-row
// entity body. NODE_WIDTH/2 + 4px margin so the line doesn't graze a node edge.
const SAFE_HALF_WIDTH = NODE_WIDTH / 2 + 4;

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
   */
  intermediateXs?: number[];
}

export interface PathResult {
  path: string;
  /** Long-skip = parent reaches a child >1 tier down OR into a row-wrap. */
  isLongSkip: boolean;
  /** X-column the long vertical drop sits in (only meaningful when isLongSkip). */
  detourX?: number;
}

/**
 * Pick a detour column for the long vertical drop. Prefers target.X itself
 * (the cleanest visual: straight drop into the target's top-handle), and
 * only steps sideways into a column gap when target.X is blocked by an
 * intermediate-row entity. Probes outward in small steps, alternating sides
 * with a slight bias toward the source side first (matches the natural
 * direction the line is already travelling).
 */
export function computeSafeDetourX(
  targetX: number,
  sourceX: number,
  intermediateXs: number[],
): number {
  const isFree = (x: number) =>
    !intermediateXs.some((ix) => Math.abs(x - ix) < SAFE_HALF_WIDTH);

  // First try target column itself — clean straight drop.
  if (isFree(targetX)) return targetX;

  const xDir = targetX > sourceX ? 1 : -1;
  // Probe sequence: half-step toward source, half-step away, full step
  // toward source, full step away, 1.5 step toward source, 1.5 step away.
  // The toward-source bias keeps the visual flow consistent with the path's
  // existing direction.
  const offsets = [
    -xDir * COL_STEP_HALF, xDir * COL_STEP_HALF,
    -xDir * COL_STEP,      xDir * COL_STEP,
    -xDir * COL_STEP * 1.5, xDir * COL_STEP * 1.5,
  ];
  for (const dx of offsets) {
    const candidate = targetX + dx;
    if (isFree(candidate)) return candidate;
  }
  // Fallback: targetX anyway (collision is unavoidable with current layout).
  return targetX;
}

/** Pure path computation, extracted for testability. */
export function computeOwnershipPath(p: PathInputs): PathResult {
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
  /** User clicked the label's × — suppress the % on the chart (value kept). */
  label_hidden?: boolean | null;
  onLabelMove?: (edgeId: string, dx: number, dy: number) => void;
  onLabelHide?: (edgeId: string) => void;
}

export type OwnershipEdgeType = Edge<OwnershipEdgeData, 'ownership'>;

export function OwnershipEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
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

  const { path } = computeOwnershipPath({
    sourceX, sourceY, targetX, targetY,
    intermediateXs: data?.intermediateXs,
  });

  const isStraight = Math.abs(targetX - sourceX) < 5;
  const range = targetY - sourceY;

  // Slimme standaardpositie (absolute chart-coords):
  // - 1 eigenaar: het % staat direct BOVEN de dochter (rechte lijn: midden,
  //   anders vlak boven de dochter, zoals voorheen).
  // - 2+ eigenaren op dezelfde dochter: zet elk % op zijn EIGEN lijn, vlak
  //   onder de eigen moeder. Zo waaieren ze vanzelf uit (moeders staan uit
  //   elkaar) en valt de rechte-boven-de-dochter-eigenaar niet meer op de
  //   bus-kruising.
  const underParent = (data?.convergingLabels ?? 0) >= 2;
  let defX: number;
  let defY: number;
  if (underParent) {
    defX = sourceX;
    defY = sourceY + PARENT_DROP_OFFSET;
  } else {
    const t = isStraight
      ? 0.5
      : Math.abs(range) > 1
        ? (targetY - 14 - sourceY) / range
        : 0.5;
    defX = targetX;
    defY = sourceY + range * t;
  }

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

    const onMove = (ev: MouseEvent) => {
      const ddxScreen = ev.clientX - startX;
      const ddyScreen = ev.clientY - startY;
      if (!moved && Math.hypot(ddxScreen, ddyScreen) < 4) return;
      moved = true;
      const z = Math.max(0.01, zoom);
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
          strokeWidth: selected ? 1.75 : 1,
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
              fontFamily: 'Inter, system-ui, sans-serif',
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
                autoFocus
                style={{
                  width: 50, fontSize: 11, padding: '2px 4px',
                  border: '1px solid #8a8980', borderRadius: 2,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
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
