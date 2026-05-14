import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';

export interface OwnershipEdgeData extends Record<string, unknown> {
  ownership_pct: number | null;
  ownership_voting_only: boolean | null;
  onPctChange?: (edgeId: string, newPct: number) => void;
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

  const [path] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY,
    borderRadius: 4,
  });
  // Position label in the middle of the relevant straight segment of the path.
  //  - Straight edge (source and target vertically aligned): midpoint of the line.
  //  - Short hark edge: middle of the LAST vertical drop (above the child) —
  //    sits at 75% along source→target since the bus is at the 50% mark.
  //  - Long hark (generation-skip): the bottom-half drop visually sits below the
  //    intermediate tier where other labels live, so place label on the FIRST
  //    drop (above the bus) instead — 25% along source→target, aligned with the
  //    source's column.
  const isStraight = Math.abs(targetX - sourceX) < 5;
  const dy = Math.abs(targetY - sourceY);
  // Adjacent tier edges measure ~180px between tier bottoms/tops; anything
  // taller means we skip at least one tier and should use the top-half rule.
  const isLongSkip = !isStraight && dy > 200;
  const labelX = isLongSkip ? sourceX : targetX;
  const labelY = isStraight
    ? (sourceY + targetY) / 2
    : isLongSkip
      ? sourceY * 0.75 + targetY * 0.25
      : sourceY * 0.25 + targetY * 0.75;

  const save = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) data?.onPctChange?.(id, parsed);
    setEditing(false);
  };

  const showLabel = data?.ownership_pct != null || editing;

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
              padding: '0 4px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 11.5,
              fontWeight: 600,
              color: '#3a3530',
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
                onClick={(e) => { e.stopPropagation(); setDraft(String(data?.ownership_pct ?? '')); setEditing(true); }}
                style={{ cursor: 'pointer' }}
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
