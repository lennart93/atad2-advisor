import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';

export interface OwnershipEdgeData extends Record<string, unknown> {
  ownership_pct: number | null;
  ownership_voting_only: boolean | null;
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
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const label =
    data?.ownership_pct != null
      ? `${data.ownership_pct}%${data.ownership_voting_only ? ' (voting)' : ''}`
      : '';
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: PALETTE.ownershipStroke, strokeWidth: selected ? 3 : 2 }}
      />
      {label && (
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
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
