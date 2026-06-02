import { useState, useEffect, useRef } from 'react';
import { useStore, type ReactFlowState } from '@xyflow/react';
import type { StructureGroup } from '@/lib/structure/types';

export type EdgeDeltas = { dLeft: number; dTop: number; dRight: number; dBottom: number };

interface Props {
  groupings: StructureGroup[];
  onLabelClick?: (groupId: string, screenX: number, screenY: number) => void;
  /** Click op het frame zelf (de gestippelde rand) — voor selectie. */
  onFrameClick?: (groupId: string) => void;
  /** Welk FE-kader is momenteel geselecteerd (krijgt dikkere rand + handles). */
  selectedId?: string | null;
  /**
   * Aanroepen bij mouseup van een handle-sleep — laat het parent-component de
   * nieuwe deltas naar de DB persistente. NULL = reset naar pure auto-fit.
   */
  onBoundsOverrideChange?: (groupingId: string, deltas: EdgeDeltas | null) => void;
}

const PADDING = 16;
const LABEL_HEIGHT = 18;
const HANDLE_SIZE = 8; // px in canvas-coords (scaled by transform)

const EMPTY_DELTAS: EdgeDeltas = { dLeft: 0, dTop: 0, dRight: 0, dBottom: 0 };

function parseDeltas(raw: unknown): EdgeDeltas {
  if (!raw || typeof raw !== 'object') return EMPTY_DELTAS;
  const r = raw as Record<string, unknown>;
  return {
    dLeft: Number(r.dLeft) || 0,
    dTop: Number(r.dTop) || 0,
    dRight: Number(r.dRight) || 0,
    dBottom: Number(r.dBottom) || 0,
  };
}

function isEmptyDeltas(d: EdgeDeltas): boolean {
  return d.dLeft === 0 && d.dTop === 0 && d.dRight === 0 && d.dBottom === 0;
}

export function FiscalUnityOverlay({
  groupings,
  onLabelClick,
  onFrameClick,
  selectedId,
  onBoundsOverrideChange,
}: Props) {
  const nodeLookup = useStore((s: ReactFlowState) => s.nodeLookup);
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
      const dx = (e.clientX - d.startMouseX) / transform[2];
      const dy = (e.clientY - d.startMouseY) / transform[2];
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
      // Push naar parent → DB. Lege deltas → null (reset naar auto-fit).
      onBoundsOverrideChange?.(d.groupingId, isEmptyDeltas(final) ? null : final);
      // Local draft mag blijven tot het parent het rondom-vers maakt; het
      // bevat dezelfde waarden als wat in de DB komt te staan.
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draftDeltas, onBoundsOverrideChange, transform]);

  // Wis de lokale draft als de grouping uit de set verdwijnt (b.v. delete).
  useEffect(() => {
    const ids = new Set(groupings.map((g) => g.id));
    setDraftDeltas((prev) => {
      const next: Record<string, EdgeDeltas> = {};
      for (const [k, v] of Object.entries(prev)) if (ids.has(k)) next[k] = v;
      return next;
    });
  }, [groupings]);

  if (groupings.length === 0) return null;
  const [tx, ty, scale] = transform;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // zIndex 0 zet de FE-rand achter de edge-labels (die in React Flow's
        // EdgeLabelRenderer zitten en zonder expliciet z-index dus visueel
        // bovenop komen). Dat is wenselijk: percentages blijven leesbaar; de
        // gestippelde rand stipt tegen het label-vakje en stopt er optisch
        // achter. pointerEvents=none op de SVG zelf laat klikken doorgaan
        // naar onderliggende nodes; de rect-randen overrulen dat hieronder.
        pointerEvents: 'none',
        zIndex: 0,
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

          // Source-of-truth: tijdens slepen lokale draft, anders DB-waarde.
          const persisted = parseDeltas(g.bounds_override);
          const d = draftDeltas[g.id] ?? persisted;
          const x = minX - PADDING + d.dLeft;
          const y = minY - PADDING + d.dTop;
          const w = (maxX - minX + PADDING * 2) - d.dLeft + d.dRight;
          const h = (maxY - minY + PADDING * 2) - d.dTop + d.dBottom;

          const stroke = g.kind === 'fiscal_unity' ? '#555' : '#999';
          const dasharray = g.kind === 'fiscal_unity' ? '4 4' : '8 4';
          const hasLabel = g.label.trim().length > 0;
          const labelText = hasLabel ? g.label : '';
          const labelWidth = hasLabel ? Math.max(140, labelText.length * 7) : 20;

          const isSelected = selectedId === g.id;
          const handleSize = HANDLE_SIZE / scale;

          const startDrag = (side: 'left' | 'top' | 'right' | 'bottom') => (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            dragRef.current = {
              groupingId: g.id,
              side,
              startMouseX: e.clientX,
              startMouseY: e.clientY,
              startDeltas: { ...d },
            };
            // Initialiseer de draft zodat onMove direct vanaf de huidige waarde verder werkt.
            setDraftDeltas((prev) => ({ ...prev, [g.id]: { ...d } }));
          };

          return (
            <g key={g.id}>
              <rect
                x={x} y={y} width={w} height={h}
                fill="none" stroke={stroke}
                strokeWidth={isSelected ? 2.5 : 1.5}
                strokeDasharray={dasharray} rx={4}
                style={{
                  pointerEvents: onFrameClick ? 'stroke' : 'none',
                  cursor: onFrameClick ? 'pointer' : 'default',
                }}
                onClick={(e) => {
                  if (!onFrameClick) return;
                  e.stopPropagation();
                  onFrameClick(g.id);
                }}
              />
              {isSelected && (
                <>
                  <rect
                    x={x + w / 2 - handleSize / 2} y={y - handleSize / 2}
                    width={handleSize} height={handleSize}
                    fill="#fff" stroke={stroke} strokeWidth={1.2 / scale}
                    style={{ pointerEvents: 'auto', cursor: 'ns-resize' }}
                    onMouseDown={startDrag('top')}
                  />
                  <rect
                    x={x + w / 2 - handleSize / 2} y={y + h - handleSize / 2}
                    width={handleSize} height={handleSize}
                    fill="#fff" stroke={stroke} strokeWidth={1.2 / scale}
                    style={{ pointerEvents: 'auto', cursor: 'ns-resize' }}
                    onMouseDown={startDrag('bottom')}
                  />
                  <rect
                    x={x - handleSize / 2} y={y + h / 2 - handleSize / 2}
                    width={handleSize} height={handleSize}
                    fill="#fff" stroke={stroke} strokeWidth={1.2 / scale}
                    style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
                    onMouseDown={startDrag('left')}
                  />
                  <rect
                    x={x + w - handleSize / 2} y={y + h / 2 - handleSize / 2}
                    width={handleSize} height={handleSize}
                    fill="#fff" stroke={stroke} strokeWidth={1.2 / scale}
                    style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
                    onMouseDown={startDrag('right')}
                  />
                </>
              )}
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
