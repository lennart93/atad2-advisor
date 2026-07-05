import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/structure/labelMeasure';

export interface ClusterNodeData extends Record<string, unknown> {
  count: number;
  jurisdictions: Record<string, number>;
  jurisdictionMix: 'all-NL' | 'all-foreign' | 'mixed';
  name: string;
  onExpand: () => void;
}

export type ClusterNodeType = Node<ClusterNodeData, 'cluster'>;

const W = NODE_WIDTH;
const H = NODE_HEIGHT;
const OFFSET = 4;
const CHART_FONT = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif";

function ClusterNodeComp({ data, selected }: NodeProps<ClusterNodeType>) {
  return (
    <div
      style={{ width: W + OFFSET * 2, height: H + OFFSET * 2, position: 'relative', cursor: 'pointer' }}
      onClick={() => data.onExpand()}
    >
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <svg
        width={W + OFFSET * 2}
        height={H + OFFSET * 2}
        style={{
          overflow: 'visible',
          outline: selected ? `2px solid ${PALETTE.selectedStroke}` : 'none',
          outlineOffset: 4,
          borderRadius: 2,
        }}
      >
        {/* back paper */}
        <rect x={OFFSET * 2} y={OFFSET * 2} width={W} height={H} rx={2}
          fill="#f6f3ec" stroke="#cdc7ba" strokeWidth={1} />
        {/* mid paper */}
        <rect x={OFFSET} y={OFFSET} width={W} height={H} rx={2}
          fill="#efe9df" stroke="#cdc7ba" strokeWidth={1} />
        {/* front rect */}
        <rect x={0} y={0} width={W} height={H} rx={2}
          fill="#ffffff" stroke={PALETTE.nodeStroke} strokeWidth={1.25} />
        <text x={W / 2} y={H / 2 - 4}
          fontFamily={CHART_FONT} fontSize={12} fontWeight={500}
          fill={PALETTE.text} textAnchor="middle">
          {data.name}
        </text>
        <text x={W / 2} y={H / 2 + 14}
          fontFamily={CHART_FONT} fontSize={10} fontWeight={500}
          fill={PALETTE.textMuted} textAnchor="middle">
          ({data.count} entities)
        </text>
      </svg>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComp);
