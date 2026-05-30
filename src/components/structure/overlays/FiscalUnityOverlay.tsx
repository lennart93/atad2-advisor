import { useStore, type ReactFlowState } from '@xyflow/react';
import type { StructureGroup } from '@/lib/structure/types';

interface Props {
  groupings: StructureGroup[];
  onLabelClick?: (groupId: string, screenX: number, screenY: number) => void;
}

const PADDING = 16;
const LABEL_HEIGHT = 18;

export function FiscalUnityOverlay({ groupings, onLabelClick }: Props) {
  const nodeLookup = useStore((s: ReactFlowState) => s.nodeLookup);
  const transform = useStore((s: ReactFlowState) => s.transform);

  if (groupings.length === 0) return null;
  const [tx, ty, scale] = transform;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${scale})`}>
        {groupings.map((g) => {
          const memberPositions = g.member_ids
            .map((id) => nodeLookup.get(id))
            .filter((n): n is NonNullable<ReturnType<typeof nodeLookup.get>> => Boolean(n));
          if (memberPositions.length === 0) return null;

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const node of memberPositions) {
            const x = node.position.x;
            const y = node.position.y;
            const w = node.measured?.width ?? 130;
            const h = node.measured?.height ?? 80;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
          }

          const x = minX - PADDING;
          const y = minY - PADDING;
          const w = maxX - minX + PADDING * 2;
          const h = maxY - minY + PADDING * 2;

          const stroke = g.kind === 'fiscal_unity' ? '#555' : '#999';
          const dasharray = g.kind === 'fiscal_unity' ? '4 4' : '8 4';
          // Lege label = niets tekenen op de rand, behalve een kleine
          // onzichtbare klik-zone in de linkerbovenhoek zodat de gebruiker
          // alsnog op de groep kan klikken om hem te bewerken of te verwijderen.
          const hasLabel = g.label.trim().length > 0;
          const labelText = hasLabel ? g.label : '';
          const labelWidth = hasLabel ? Math.max(140, labelText.length * 7) : 20;

          return (
            <g key={g.id}>
              <rect x={x} y={y} width={w} height={h}
                fill="none" stroke={stroke} strokeWidth={1.5}
                strokeDasharray={dasharray} rx={4} />
              <rect
                x={x + 8} y={y - LABEL_HEIGHT / 2}
                width={labelWidth} height={LABEL_HEIGHT}
                fill={hasLabel ? '#fff' : 'transparent'}
                stroke={hasLabel ? stroke : 'none'}
                strokeWidth={0.5} rx={2}
                style={{ pointerEvents: onLabelClick ? 'auto' : 'none', cursor: onLabelClick ? 'pointer' : 'default' }}
                onClick={(e) => {
                  if (!onLabelClick) return;
                  e.stopPropagation();
                  onLabelClick(g.id, e.clientX, e.clientY);
                }}
              />
              {hasLabel && (
                <text
                  x={x + 14} y={y + 4}
                  fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
                  fill="#333"
                  style={{ pointerEvents: 'none' }}
                >
                  {labelText}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
