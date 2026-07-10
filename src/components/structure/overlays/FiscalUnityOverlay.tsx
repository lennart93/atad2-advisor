// src/components/structure/overlays/FiscalUnityOverlay.tsx
//
// Sleep-handles voor het geselecteerde fiscale-eenheid kader. Het kader
// zelf (gestippelde rand + label) wordt sinds Issue [FE in report] gerenderd
// als React Flow node (FiscalUnityFrameNode) BINNEN de viewport, zodat de
// PNG-snapshot het automatisch meeneemt. De handles blijven hier omdat ze
// transform-aware moeten zijn (constante schermgrootte ongeacht zoom) en
// alleen verschijnen wanneer een FE actief geselecteerd is.
//
// De wrapper-SVG heeft data-snapshot-exclude="true" zodat — mocht de
// capture-strategie ooit veranderen — de handles niet per ongeluk in een
// gefinalizede PNG terechtkomen.
import { useState, useEffect, useRef } from 'react';
import { useStore, type ReactFlowState } from '@xyflow/react';
import { getAppScale } from '@/lib/appScale';
import {
  EMPTY_DELTAS,
  isEmptyDeltas,
  type EdgeDeltas,
  type FrameLayout,
} from '@/lib/structure/fiscalUnityLayout';

interface Props {
  frameLayouts: FrameLayout[];
  /** Welk FE-kader is momenteel geselecteerd (krijgt sleep-handles). */
  selectedId?: string | null;
  /**
   * Aanroepen bij mouseup van een handle-sleep — laat het parent-component de
   * nieuwe deltas naar de DB persistente. NULL = reset naar pure auto-fit.
   */
  onBoundsOverrideChange?: (groupingId: string, deltas: EdgeDeltas | null) => void;
}

const HANDLE_SIZE = 8; // px in canvas-coords (scaled by transform)

export function FiscalUnityOverlay({
  frameLayouts,
  selectedId,
  onBoundsOverrideChange,
}: Props) {
  const transform = useStore((s: ReactFlowState) => s.transform);

  // Lokale optimistische deltas terwijl je sleept: visueel directe respons,
  // pas op mouseup gaat hij naar de DB via onBoundsOverrideChange.
  const [draftDeltas, setDraftDeltas] = useState<Record<string, EdgeDeltas>>({});

  const dragRef = useRef<{
    groupingId: string;
    side: 'left' | 'top' | 'right' | 'bottom';
    startMouseX: number;
    startMouseY: number;
    startDeltas: EdgeDeltas;
  } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      // clientX/Y bevatten de globale html-zoom (--app-scale); deel er dus
      // behalve door de viewport-zoom ook door de app-schaal, anders loopt
      // het kader 15% voor op de muis.
      const z = transform[2] * getAppScale();
      const dx = (e.clientX - d.startMouseX) / z;
      const dy = (e.clientY - d.startMouseY) / z;
      const next: EdgeDeltas = { ...d.startDeltas };
      if (d.side === 'left') next.dLeft = d.startDeltas.dLeft + dx;
      else if (d.side === 'right') next.dRight = d.startDeltas.dRight + dx;
      else if (d.side === 'top') next.dTop = d.startDeltas.dTop + dy;
      else if (d.side === 'bottom') next.dBottom = d.startDeltas.dBottom + dy;
      setDraftDeltas((prev) => ({ ...prev, [d.groupingId]: next }));
    }
    function onUp() {
      const d = dragRef.current;
      if (!d) return;
      const final = draftDeltas[d.groupingId];
      dragRef.current = null;
      if (final === undefined) return;
      onBoundsOverrideChange?.(d.groupingId, isEmptyDeltas(final) ? null : final);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draftDeltas, onBoundsOverrideChange, transform]);

  // Wis de lokale draft als een grouping uit de set verdwijnt (b.v. delete).
  useEffect(() => {
    const ids = new Set(frameLayouts.map((fl) => fl.groupingId));
    setDraftDeltas((prev) => {
      const next: Record<string, EdgeDeltas> = {};
      for (const [k, v] of Object.entries(prev)) if (ids.has(k)) next[k] = v;
      return next;
    });
  }, [frameLayouts]);

  // Alleen het geselecteerde kader krijgt handles — anders niets te tekenen.
  if (!selectedId) return null;
  const layout = frameLayouts.find((fl) => fl.groupingId === selectedId);
  if (!layout) return null;

  const [tx, ty, scale] = transform;
  const handleSize = HANDLE_SIZE / scale;
  const stroke = layout.kind === 'fiscal_unity' ? '#555' : '#999';

  // Frame-bounds in canvas-coords, met live draft (tijdens slepen) of
  // persisted state. We trekken EMPTY_DELTAS af van layout (= reeds met
  // persisted deltas berekend) om de basis te krijgen, en tellen draft erbij.
  const draft = draftDeltas[selectedId];
  const baseDeltas = layout.persistedDeltas;
  const effective = draft ?? baseDeltas;
  // Reken van de persisted layout terug naar de "kale" auto-fit + apply effective.
  const x = layout.x - baseDeltas.dLeft + effective.dLeft;
  const y = layout.y - baseDeltas.dTop + effective.dTop;
  const w = layout.width + baseDeltas.dLeft - baseDeltas.dRight - effective.dLeft + effective.dRight;
  const h = layout.height + baseDeltas.dTop - baseDeltas.dBottom - effective.dTop + effective.dBottom;

  const startDrag =
    (side: 'left' | 'top' | 'right' | 'bottom') => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        groupingId: selectedId,
        side,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startDeltas: { ...(draft ?? baseDeltas ?? EMPTY_DELTAS) },
      };
      setDraftDeltas((prev) => ({
        ...prev,
        [selectedId]: { ...(draft ?? baseDeltas ?? EMPTY_DELTAS) },
      }));
    };

  return (
    <svg
      data-snapshot-exclude="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${scale})`}>
        <rect
          x={x + w / 2 - handleSize / 2}
          y={y - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#fff"
          stroke={stroke}
          strokeWidth={1.2 / scale}
          style={{ pointerEvents: 'auto', cursor: 'ns-resize' }}
          onMouseDown={startDrag('top')}
        />
        <rect
          x={x + w / 2 - handleSize / 2}
          y={y + h - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#fff"
          stroke={stroke}
          strokeWidth={1.2 / scale}
          style={{ pointerEvents: 'auto', cursor: 'ns-resize' }}
          onMouseDown={startDrag('bottom')}
        />
        <rect
          x={x - handleSize / 2}
          y={y + h / 2 - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#fff"
          stroke={stroke}
          strokeWidth={1.2 / scale}
          style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
          onMouseDown={startDrag('left')}
        />
        <rect
          x={x + w - handleSize / 2}
          y={y + h / 2 - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#fff"
          stroke={stroke}
          strokeWidth={1.2 / scale}
          style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
          onMouseDown={startDrag('right')}
        />
      </g>
    </svg>
  );
}
