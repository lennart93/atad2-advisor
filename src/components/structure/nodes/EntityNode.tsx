// src/components/structure/nodes/EntityNode.tsx
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { geometryFor, BOX } from '@/lib/structure/shapeGeometry';
import { fillFor, PALETTE } from '@/lib/structure/palette';
import type { EntityType } from '@/lib/structure/types';

export interface EntityNodeData extends Record<string, unknown> {
  name: string;
  legal_form: string | null;
  jurisdiction_iso: string;
  entity_type: EntityType;
  is_taxpayer: boolean;
  source: 'ai_extracted' | 'user_added' | 'user_edited';
}

export type EntityNodeType = Node<EntityNodeData, 'entity'>;

function EntityNodeComp({ data, selected }: NodeProps<EntityNodeType>) {
  const geom = geometryFor(data.entity_type);
  const fill = fillFor(data);
  const isIndividual = data.entity_type === 'individual';

  return (
    <div style={{ width: BOX.width, height: BOX.height, position: 'relative' }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <svg
        width={BOX.width}
        height={BOX.height}
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? `2px solid #1f5489` : 'none',
          outlineOffset: 4,
          borderRadius: 2,
        }}
      >
        {/* outer */}
        {geom.outer.kind === 'rect' && (
          <rect
            width={BOX.width}
            height={BOX.height}
            rx={geom.outer.rx}
            fill={fill}
            stroke={PALETTE.outerStroke}
            strokeWidth={0.75}
          />
        )}
        {geom.outer.kind === 'polygon' && (
          <polygon
            points={geom.outer.points}
            fill={fill}
            stroke={PALETTE.outerStroke}
            strokeWidth={0.75}
          />
        )}
        {geom.outer.kind === 'ellipse' && (
          <ellipse
            cx={BOX.width / 2}
            cy={BOX.height / 2}
            rx={BOX.width / 2}
            ry={BOX.height / 2}
            fill={fill}
            stroke={PALETTE.outerStroke}
            strokeWidth={0.75}
          />
        )}
        {geom.outer.kind === 'individual' && (
          <g>
            <circle cx={BOX.width / 2} cy={20} r={11} fill={PALETTE.individual} />
            <polygon
              points={`${BOX.width / 2 - 30},${BOX.height - 8} ${BOX.width / 2 - 24},${BOX.height - 42} ${BOX.width / 2 + 24},${BOX.height - 42} ${BOX.width / 2 + 30},${BOX.height - 8}`}
              fill={PALETTE.individual}
            />
          </g>
        )}

        {/* inner */}
        {geom.inner?.kind === 'ellipse' && (
          <ellipse
            cx={BOX.width / 2}
            cy={BOX.height / 2}
            rx={geom.inner.rx}
            ry={geom.inner.ry}
            fill="none"
            stroke={PALETTE.innerStroke}
            strokeWidth={1.6}
            opacity={0.92}
          />
        )}
        {geom.inner?.kind === 'polygon' && (
          <polygon
            points={geom.inner.points}
            fill="none"
            stroke={PALETTE.innerStroke}
            strokeWidth={1.6}
            opacity={0.92}
          />
        )}
        {geom.inner?.kind === 'polyline' && (
          <polyline
            points={geom.inner.points}
            fill="none"
            stroke={PALETTE.innerStroke}
            strokeWidth={1.6}
            opacity={0.92}
          />
        )}

        {/* label */}
        {!isIndividual && (
          <>
            <text
              x={BOX.width / 2}
              y={BOX.height / 2 - 4}
              fontFamily="Inter, system-ui, sans-serif"
              fontSize={13}
              fontWeight={700}
              fill={PALETTE.text}
              textAnchor="middle"
            >
              {truncate(data.name, 18)}
            </text>
            {data.legal_form && (
              <text
                x={BOX.width / 2}
                y={BOX.height / 2 + 12}
                fontFamily="Inter, system-ui, sans-serif"
                fontSize={11}
                fontWeight={500}
                fill={PALETTE.textMuted}
                textAnchor="middle"
              >
                {data.legal_form}
              </text>
            )}
            <text
              x={BOX.width / 2}
              y={BOX.height - 8}
              fontFamily="Inter, system-ui, sans-serif"
              fontSize={11}
              fontWeight={500}
              fill={PALETTE.textMuted}
              textAnchor="middle"
            >
              ({data.jurisdiction_iso})
            </text>
          </>
        )}
      </svg>
      {isIndividual && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: BOX.height + 4,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: '#1d252b' }}>{truncate(data.name, 18)}</div>
          <div style={{ fontSize: 10.5, color: '#6b6660' }}>({data.jurisdiction_iso})</div>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export const EntityNode = memo(EntityNodeComp);
