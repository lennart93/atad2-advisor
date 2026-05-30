// src/components/structure/nodes/EntityNode.tsx
import { memo } from 'react';
import { Handle, Position, useConnection, type Node, type NodeProps } from '@xyflow/react';
import { geometryFor } from '@/lib/structure/shapeGeometry';
import { fillFor, PALETTE } from '@/lib/structure/palette';
import { NODE_WIDTH, NODE_HEIGHT, measureWidth } from '@/lib/structure/labelMeasure';
import type { EntityType } from '@/lib/structure/types';

export interface EntityNodeData extends Record<string, unknown> {
  name: string;
  nameLines: string[];   // pre-wrapped name lines from wrapLabels()
  legal_form: string | null;
  jurisdiction_iso: string;
  entity_type: EntityType;
  is_taxpayer: boolean;
  source: 'ai_extracted' | 'user_added' | 'user_edited';
  focused?: boolean;
}

export type EntityNodeType = Node<EntityNodeData, 'entity'>;

const NAME_LINE_HEIGHT = 14;        // 13px font + 1px leading
const ASCENT_OFFSET = 11;           // distance from baseline of first line to its visual top

function EntityNodeComp({ id, data, selected }: NodeProps<EntityNodeType>) {
  const W = NODE_WIDTH;
  const H = NODE_HEIGHT;
  const geom = geometryFor(data.entity_type, W, H);
  const fill = fillFor(data);
  const isIndividual = data.entity_type === 'individual';

  // During an endpoint-reconnect drag, highlight this node when the pointer is
  // over it: green = valid drop target, red = invalid (e.g. same as other end).
  // The selector keeps this node from re-rendering on every unrelated frame.
  const dropTarget = useConnection((c) =>
    c.inProgress && c.toNode?.id === id
      ? (c.isValid === false ? 'invalid' : 'valid')
      : null,
  );

  const lines = data.nameLines && data.nameLines.length > 0 ? data.nameLines : [data.name];

  // Center the name block in the area above the jurisdiction line.
  // Available area: 0 to (H - 18) where the jurisdiction line baseline sits.
  const nameBlockY = (H - lines.length * NAME_LINE_HEIGHT - 12) / 2 + ASCENT_OFFSET;

  return (
    <div style={{ width: W, height: H, position: 'relative' }}>
      <Handle type="target" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0 }} />

      <svg
        width={W}
        height={H}
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? '2px solid #1f5489' : 'none',
          outlineOffset: 4,
          borderRadius: 2,
        }}
      >
        {geom.outer.kind === 'rect' && (
          <rect
            width={W} height={H} rx={geom.outer.rx}
            fill={fill}
            stroke="#1a1a1a"
            strokeWidth={1.5}
          />
        )}
        {geom.outer.kind === 'polygon' && (
          <polygon
            points={geom.outer.points} fill={fill}
            stroke="#1a1a1a"
            strokeWidth={1.5}
          />
        )}
        {geom.outer.kind === 'ellipse' && (
          <ellipse cx={W / 2} cy={H / 2} rx={W / 2} ry={H / 2} fill={fill}
            stroke="#1a1a1a"
            strokeWidth={1.5}
          />
        )}
        {geom.outer.kind === 'individual' && (
          <g>
            <circle cx={W / 2} cy={20} r={11}
              fill={PALETTE.individual}
              stroke="#1a1a1a"
              strokeWidth={1.5}
            />
            <polygon
              points={`${W / 2 - 30},${H - 8} ${W / 2 - 24},${H - 42} ${W / 2 + 24},${H - 42} ${W / 2 + 30},${H - 8}`}
              fill={PALETTE.individual}
              stroke="#1a1a1a"
              strokeWidth={1.5}
            />
          </g>
        )}

        {geom.inner?.kind === 'ellipse' && (
          <ellipse cx={W / 2} cy={H / 2} rx={geom.inner.rx} ry={geom.inner.ry}
            fill="none" stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92} />
        )}
        {geom.inner?.kind === 'polygon' && (
          <polygon points={geom.inner.points} fill="none"
            stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92} />
        )}
        {geom.inner?.kind === 'polyline' && (
          <polyline points={geom.inner.points} fill="none"
            stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92} />
        )}

        {!isIndividual && (
          <>
            {(geom.outer.kind === 'polygon' || geom.outer.kind === 'ellipse') &&
              needsTextBackdrop(geom.outer.kind, W, H, nameBlockY, lines) && (
              <rect
                x={W * 0.1}
                y={nameBlockY - 12}
                width={W * 0.8}
                height={lines.length * NAME_LINE_HEIGHT + 6}
                fill="rgba(150, 150, 150, 0.95)"
                rx={2}
              />
            )}
            <text
              fontFamily="Inter, system-ui, sans-serif"
              fontSize={13}
              fontWeight={700}
              fill={PALETTE.text}
              textAnchor="middle"
            >
              {lines.map((line, i) => (
                <tspan key={i} x={W / 2} y={nameBlockY + i * NAME_LINE_HEIGHT}>
                  {line}
                </tspan>
              ))}
            </text>
            <text
              x={W / 2}
              y={H - 16}
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

        {data.focused && (
          <rect
            x={-3} y={-3}
            width={W + 6} height={H + 6}
            fill="none"
            stroke="#2d7d6e"
            strokeWidth={2}
            strokeDasharray="3 3"
            rx={4}
          />
        )}
        {dropTarget && (
          <rect
            x={-3} y={-3}
            width={W + 6} height={H + 6}
            fill="none"
            stroke={dropTarget === 'invalid' ? '#dc2626' : '#16a34a'}
            strokeWidth={2.5}
            rx={4}
          />
        )}
      </svg>
      {isIndividual && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: H + 4,
          textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, color: '#1d252b' }}>{lines.join(' ')}</div>
          <div style={{ fontSize: 10.5, color: '#6b6660' }}>({data.jurisdiction_iso})</div>
        </div>
      )}
    </div>
  );
}

// Returns true iff the widest wrapped line would visibly spill past the shape
// outline at the text's vertical band. Only relevant for non-rect shapes
// (triangle, oval) — rect shapes already give full-width clearance.
function needsTextBackdrop(
  kind: 'polygon' | 'ellipse',
  W: number,
  H: number,
  nameBlockY: number,
  lines: string[],
): boolean {
  const topY = nameBlockY - 12;
  const bottomY = topY + lines.length * NAME_LINE_HEIGHT + 6;
  const longest = Math.max(...lines.map((l) => measureWidth(l)));
  // 4px padding so glyphs don't kiss the outline.
  const needed = longest + 4;

  if (kind === 'ellipse') {
    const rx = W / 2;
    const ry = H / 2;
    const dy = Math.max(Math.abs(topY - ry), Math.abs(bottomY - ry));
    if (dy >= ry) return true;
    const available = 2 * rx * Math.sqrt(1 - (dy / ry) ** 2);
    return needed > available;
  }
  // Downward triangle: apex at (W/2, 0), base at y=H. Width at y = W * y / H.
  const narrowestY = Math.max(0, topY);
  const available = (W * narrowestY) / H;
  return needed > available;
}

export const EntityNode = memo(EntityNodeComp);
