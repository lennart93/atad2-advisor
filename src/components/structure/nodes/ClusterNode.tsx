// src/components/structure/nodes/ClusterNode.tsx
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';
import { BOX } from '@/lib/structure/shapeGeometry';

export interface ClusterNodeData extends Record<string, unknown> {
  count: number;
  /** ISO codes mapped to count, e.g. {NL:8, DE:4} */
  jurisdictions: Record<string, number>;
  /** "all-NL" | "all-foreign" | "mixed" — drives the fill */
  jurisdictionMix: 'all-NL' | 'all-foreign' | 'mixed';
  onExpand: () => void;
}

export type ClusterNodeType = Node<ClusterNodeData, 'cluster'>;

const W = BOX.width + 16;
const H = BOX.height + 12;
const STACK_OFFSET = 4;

function ClusterNodeComp({ data, selected }: NodeProps<ClusterNodeType>) {
  const fill = data.jurisdictionMix === 'all-foreign' ? PALETTE.foreign : PALETTE.nl;
  const fillRight = data.jurisdictionMix === 'mixed' ? PALETTE.foreign : fill;
  const jurisdictionsLine = Object.entries(data.jurisdictions)
    .sort(([, a], [, b]) => b - a)
    .map(([iso, n]) => `${iso} · ${n}`)
    .join('   ');

  return (
    <div
      style={{ width: W + STACK_OFFSET * 2, height: H + STACK_OFFSET * 2, position: 'relative', cursor: 'pointer' }}
      onClick={data.onExpand}
      title="Click to expand"
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <svg
        width={W + STACK_OFFSET * 2}
        height={H + STACK_OFFSET * 2}
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? `2px solid #1f5489` : 'none',
          outlineOffset: 6,
          borderRadius: 2,
        }}
      >
        {/* Two background rects for "stacked" depth */}
        <rect x={STACK_OFFSET * 2} y={STACK_OFFSET * 2} width={W} height={H} rx={2}
          fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75} opacity={0.55}/>
        <rect x={STACK_OFFSET} y={STACK_OFFSET} width={W} height={H} rx={2}
          fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75} opacity={0.78}/>
        {/* Front rect — split fill if mixed */}
        {data.jurisdictionMix === 'mixed' ? (
          <>
            <rect x={0} y={0} width={W / 2} height={H} rx={2}
              fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
            <rect x={W / 2} y={0} width={W / 2} height={H} rx={2}
              fill={fillRight} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
          </>
        ) : (
          <rect x={0} y={0} width={W} height={H} rx={2}
            fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
        )}
        {/* Label */}
        <text x={W / 2} y={H / 2 - 4}
          fontFamily="Inter, system-ui, sans-serif" fontSize={13} fontWeight={700}
          fill={PALETTE.text} textAnchor="middle">
          {data.count} other {data.count === 1 ? 'subsidiary' : 'subsidiaries'}
        </text>
        <text x={W / 2} y={H / 2 + 14}
          fontFamily="Inter, system-ui, sans-serif" fontSize={10} fontWeight={500}
          fill={PALETTE.textMuted} textAnchor="middle">
          {jurisdictionsLine}
        </text>
        <text x={W / 2} y={H - 6}
          fontFamily="Inter, system-ui, sans-serif" fontSize={9.5} fontWeight={500}
          fill={PALETTE.textMuted} textAnchor="middle">
          click to expand
        </text>
      </svg>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComp);
