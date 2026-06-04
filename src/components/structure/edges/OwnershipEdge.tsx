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

export interface OwnershipEdgeData extends Record<string, unknown> {
  ownership_pct: number | null;
  ownership_voting_only: boolean | null;
  onPctChange?: (edgeId: string, newPct: number) => void;
  /**
   * Center-X positions of entities sitting strictly between source-row and
   * target-row in Y. Used by long-skip routing to keep the long vertical
   * out of intermediate-row entity columns. Computed in StructureChart.
   */
  intermediateXs?: number[];
  /**
   * Persisted label position along the source→target line, 0..1.
   * NULL = use the default (midpoint for straight, just-above-target for jog).
   */
  label_t?: number | null;
  onLabelTChange?: (edgeId: string, newT: number) => void;
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
  // Lokale draft voor label_t terwijl je sleept (omgezet naar chart-coords
  // via de viewport-zoom; pas op mouseup gaat de waarde via onLabelTChange
  // naar de DB). NULL = geen actieve sleep, gebruik persisted of default.
  const [tDraft, setTDraft] = useState<number | null>(null);
  const zoom = useStore((s: ReactFlowState) => s.transform[2]);

  const { path } = computeOwnershipPath({
    sourceX, sourceY, targetX, targetY,
    intermediateXs: data?.intermediateXs,
  });

  // Voor een rechte verticale lijn (ouder direct boven dochter, geen bus-jog)
  // zet het percentage op het MIDDEN van de lijn — anders staat 'ie tegen de
  // dochter aangedrukt bij lange drops zoals top-tier → tweede tier.
  // Voor smooth-step paden met een horizontale bus-jog blijft het label vlak
  // boven de dochter staan: dan horen alle siblings van dezelfde ouder op
  // dezelfde hoogte uitgelijnd, en valt het % logisch bij het onderste
  // (kind-specifieke) stuk lijn — niet halverwege bij de bus.
  const isStraight = Math.abs(targetX - sourceX) < 5;
  const range = targetY - sourceY;
  // Default-t alleen relevant zolang label_t == null. Voor straight: midden.
  // Voor jog: targetY-14 = even boven target, zelfde uitlijning als voorheen.
  const defaultT = isStraight
    ? 0.5
    : Math.abs(range) > 1
      ? (targetY - 14 - sourceY) / range
      : 0.5;
  const effectiveT = tDraft ?? data?.label_t ?? defaultT;
  const labelX = targetX;
  const labelY = sourceY + range * effectiveT;

  const save = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) data?.onPctChange?.(id, parsed);
    setEditing(false);
  };

  const showLabel = data?.ownership_pct != null || editing;

  // Click vs drag op het %-vakje: <4px beweging = klik (edit-modus), anders
  // slepen langs de lijn. Listeners worden imperatief geattacht/gedetached
  // per sleep-sessie zodat closures fris blijven en we geen verlaten
  // window-listeners hebben.
  const startDragOrEdit = (e: React.MouseEvent) => {
    if (editing) return;
    e.stopPropagation();
    const startY = e.clientY;
    const startT = effectiveT;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dyScreen = ev.clientY - startY;
      if (!moved && Math.abs(dyScreen) < 4) return;
      moved = true;
      if (Math.abs(range) < 1) return;
      const dyChart = dyScreen / Math.max(0.01, zoom);
      const newT = Math.max(0, Math.min(1, startT + dyChart / range));
      setTDraft(newT);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (moved) {
        setTDraft((cur) => {
          if (cur != null) data?.onLabelTChange?.(id, cur);
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

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: PALETTE.ownershipStroke, strokeWidth: selected ? 3 : 2 }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: PALETTE.background,
              padding: '1px 4px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#3a3530',
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
                  border: '1px solid #999', borderRadius: 2,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                onMouseDown={startDragOrEdit}
                style={{ cursor: tDraft != null ? 'ns-resize' : 'pointer', userSelect: 'none' }}
                title="Drag to slide along the line, click to edit"
              >
                {data?.ownership_pct != null
                  ? `${data.ownership_pct}%${data.ownership_voting_only ? ' (voting)' : ''}`
                  : ''}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
