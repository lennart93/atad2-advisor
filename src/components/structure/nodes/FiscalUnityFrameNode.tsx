// src/components/structure/nodes/FiscalUnityFrameNode.tsx
//
// Rendert het gestippelde fiscale-eenheid-kader als een React Flow node
// BINNEN de viewport, zodat captureChartSnapshot het automatisch meeneemt
// in de PNG (de oude FiscalUnityOverlay was een sibling van .react-flow__viewport
// en viel buiten de capture; daardoor bleef de FE onzichtbaar in het
// assessment report).
//
// De sleep-handles staan nog in FiscalUnityOverlay — die zit op een hogere
// laag en is via data-snapshot-exclude uitgesloten van de capture.
import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';

export interface FiscalUnityFrameData extends Record<string, unknown> {
  width: number;
  height: number;
  label: string;
  kind: string;
  groupId: string;
  isSelected: boolean;
  onFrameClick?: (groupId: string) => void;
  onLabelClick?: (groupId: string, screenX: number, screenY: number) => void;
}

export type FiscalUnityFrameNodeType = Node<FiscalUnityFrameData, 'fiscalUnityFrame'>;

const LABEL_HEIGHT = 18;

function FiscalUnityFrameComp({ data }: NodeProps<FiscalUnityFrameNodeType>) {
  const { width, height, label, kind, groupId, isSelected, onFrameClick, onLabelClick } = data;
  const stroke = kind === 'fiscal_unity' ? '#8a8479' : '#b5b4ad';
  const dasharray = kind === 'fiscal_unity' ? '4 4' : '8 4';
  const hasLabel = label.trim().length > 0;

  return (
    <div
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        // Het frame zelf mag geen clicks vangen — alleen de stroke en het
        // label kunnen geklikt worden. Zo blijven entiteiten binnen het
        // kader normaal selecteerbaar.
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="none"
          stroke={stroke}
          strokeWidth={isSelected ? 2.5 : 1.5}
          strokeDasharray={dasharray}
          rx={4}
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            onFrameClick?.(groupId);
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: `-${LABEL_HEIGHT / 2}px`,
          left: '8px',
          minWidth: hasLabel ? undefined : `20px`,
          height: `${LABEL_HEIGHT}px`,
          padding: hasLabel ? '0 6px' : 0,
          background: hasLabel ? '#fff' : 'transparent',
          border: hasLabel ? `0.5px solid ${stroke}` : 'none',
          borderRadius: '2px',
          lineHeight: `${LABEL_HEIGHT}px`,
          // Same stack as EntityNode's CHART_FONT; Inter was the one
          // off-brand font declaration in the app.
          fontFamily: "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 11,
          fontWeight: 500,
          color: '#5f5e5a',
          pointerEvents: 'auto',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onLabelClick?.(groupId, e.clientX, e.clientY);
        }}
      >
        {hasLabel ? label : ''}
      </div>
    </div>
  );
}

export const FiscalUnityFrameNode = memo(FiscalUnityFrameComp);
