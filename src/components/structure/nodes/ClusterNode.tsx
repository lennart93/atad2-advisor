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

function ClusterNodeComp({ data, selected }: NodeProps<ClusterNodeType>) {
  const frontFill =
    data.jurisdictionMix === 'all-NL'
      ? PALETTE.nl
      : data.jurisdictionMix === 'all-foreign'
      ? PALETTE.foreign
      : '#7a766f';

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
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? '2px solid #1f5489' : 'none',
          outlineOffset: 4,
          borderRadius: 2,
        }}
      >
        {/* back paper */}
        <rect x={OFFSET * 2} y={OFFSET * 2} width={W} height={H} rx={2}
          fill="#d8d2c8" stroke="#8a857d" strokeWidth={1} />
        {/* mid paper */}
        <rect x={OFFSET} y={OFFSET} width={W} height={H} rx={2}
          fill="#e3ddd0" stroke="#8a857d" strokeWidth={1} />
        {/* front rect */}
        <rect x={0} y={0} width={W} height={H} rx={2}
          fill={frontFill} stroke="#3a3530" strokeWidth={1} />
        <text x={W / 2} y={H / 2 - 4}
          fontFamily="Inter, system-ui, sans-serif" fontSize={12} fontWeight={700}
          fill={PALETTE.text} textAnchor="middle">
          {data.name}
        </text>
        <text x={W / 2} y={H / 2 + 14}
          fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
          fill={PALETTE.textMuted} textAnchor="middle">
          ({data.count} entities)
        </text>
      </svg>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComp);
