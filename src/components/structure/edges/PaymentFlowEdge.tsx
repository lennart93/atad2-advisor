import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import type { TransactionBundle } from '@/lib/structure/bundleTransactions';
import type { RoutedFlowPoint } from '@/lib/structure/flowRouting';
import type { StructureEntity } from '@/lib/structure/types';
import { PALETTE } from '@/lib/structure/palette';
import { TransactionBundlePopover } from '../TransactionBundlePopover';
import { dragSegment, snapToGrid, snapToParallel, addWaypoint, removeWaypoint } from '../flowEditing/pathOps';

/** Coordinates of every parallel flow segment, used for snap-to-align. */
export interface ParallelGuides {
  horizontal: number[]; // y-values of horizontal segments
  vertical: number[];   // x-values of vertical segments
}

export interface PaymentFlowEdgeData extends Record<string, unknown> {
  bundle: TransactionBundle;
  entities: StructureEntity[];
  /** Routed path points — auto-routed or persisted manual. */
  points: RoutedFlowPoint[];
  labelSegmentIndex: number;
  /** Manual label position; null = auto (midpoint of label segment). */
  labelPosition: RoutedFlowPoint | null;
  isManual: boolean;
  onSelectTransaction: (txnId: string) => void;
  /** Live-preview callback — fired every pointer-move frame (transient, no history/DB). */
  onPathChange?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  /** Commit callback — fired once on pointer-up (triggers history push + DB persist). */
  onPathCommit?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onLabelMove?: (bundleId: string, position: RoutedFlowPoint) => void;
  /** Commit a new path with an added waypoint (edge computes the geometry). */
  onAddWaypoint?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  /** Commit a new path with a waypoint removed (edge computes the geometry). */
  onRemoveWaypoint?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  snapEnabled?: boolean;
  /** Parallel segment coordinates across all flows, for snap-to-align. */
  parallelGuides?: ParallelGuides;
}

export type PaymentFlowEdgeType = Edge<PaymentFlowEdgeData, 'paymentFlow'>;

const CORNER_RADIUS = 10;

/**
 * Build an SVG path for a routed orthogonal flow. Every interior corner is
 * rounded with a quadratic curve; the radius is clamped to half the shorter
 * adjacent segment so short segments never overshoot. The rounded corner where
 * the horizontal exit-stub meets the first vertical drop (and the symmetric
 * one at the entry) produces the soft "curved stub" look.
 */
export function buildFlowPath(points: RoutedFlowPoint[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const segLen = (a: RoutedFlowPoint, b: RoutedFlowPoint): number =>
    Math.hypot(b.x - a.x, b.y - a.y);

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Clamp the corner radius so it never exceeds half of either adjacent
    // segment — prevents the "before" point of this corner from crossing the
    // "after" point of the previous corner on short segments.
    const r = Math.min(CORNER_RADIUS, segLen(prev, curr) / 2, segLen(curr, next) / 2);

    const inDir = {
      x: Math.sign(curr.x - prev.x),
      y: Math.sign(curr.y - prev.y),
    };
    const outDir = {
      x: Math.sign(next.x - curr.x),
      y: Math.sign(next.y - curr.y),
    };

    const beforeX = curr.x - inDir.x * r;
    const beforeY = curr.y - inDir.y * r;
    const afterX = curr.x + outDir.x * r;
    const afterY = curr.y + outDir.y * r;

    parts.push(`L ${beforeX} ${beforeY}`);
    parts.push(`Q ${curr.x} ${curr.y} ${afterX} ${afterY}`);
  }

  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);

  return parts.join(' ');
}

function formatAmount(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return n.toString();
}

function labelAnchor(data: PaymentFlowEdgeData): RoutedFlowPoint {
  if (data.labelPosition) return data.labelPosition;
  const pts = data.points;
  if (pts.length === 0) return { x: 0, y: 0 };
  const i = Math.min(Math.max(data.labelSegmentIndex, 0), pts.length - 1);
  const a = pts[i];
  const b = pts[i + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 10 };
}

interface HandlesProps {
  bundleId: string;
  points: RoutedFlowPoint[];
  snapEnabled: boolean;
  parallelGuides?: ParallelGuides;
  onPathChange?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onPathCommit?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onAddWaypoint?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onRemoveWaypoint?: (bundleId: string, points: RoutedFlowPoint[]) => void;
}

function FlowEditHandles({
  bundleId, points, snapEnabled, parallelGuides, onPathChange, onPathCommit, onAddWaypoint, onRemoveWaypoint,
}: HandlesProps) {
  const dragRef = useRef<{
    kind: 'segment' | 'waypoint';
    index: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startPoints: RoutedFlowPoint[];
  } | null>(null);
  // Tooltip shown when a waypoint can't be removed without bending the line.
  const [removeBlocked, setRemoveBlocked] = useState<RoutedFlowPoint | null>(null);

  if (points.length < 2) return null;

  const beginDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    kind: 'segment' | 'waypoint',
    index: number,
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      index,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startPoints: points.map((p) => ({ ...p })),
    };
  };

  const computePath = (d: NonNullable<typeof dragRef.current>, clientX: number, clientY: number): RoutedFlowPoint[] => {
    const dx = clientX - d.startX;
    const dy = clientY - d.startY;
    if (d.kind === 'segment') {
      let next = dragSegment(d.startPoints, d.index, { dx, dy });
      if (snapEnabled) {
        next = next.map((p) => snapToGrid(p, 8));
        if (parallelGuides) {
          // Align the dragged segment with other parallel flow segments.
          const a = next[d.index];
          const b = next[d.index + 1];
          if (Math.abs(a.y - b.y) < 0.01) {
            const y = snapToParallel(a.y, parallelGuides.horizontal, 6);
            next[d.index] = { ...a, y };
            next[d.index + 1] = { ...b, y };
          } else {
            const x = snapToParallel(a.x, parallelGuides.vertical, 6);
            next[d.index] = { ...a, x };
            next[d.index + 1] = { ...b, x };
          }
        }
      }
      return next;
    } else {
      // Waypoint drag: move the point, then keep the two adjacent segments
      // axis-aligned by snapping the smaller delta of each neighbor.
      const next = d.startPoints.map((p) => ({ ...p }));
      next[d.index] = { x: next[d.index].x + dx, y: next[d.index].y + dy };
      if (snapEnabled) next[d.index] = snapToGrid(next[d.index], 8);
      if (d.index > 0) {
        const prev = next[d.index - 1];
        if (Math.abs(prev.x - next[d.index].x) < Math.abs(prev.y - next[d.index].y)) {
          next[d.index].x = prev.x;
        } else {
          next[d.index].y = prev.y;
        }
      }
      if (d.index < next.length - 1) {
        const nxt = next[d.index + 1];
        if (Math.abs(nxt.x - next[d.index].x) < Math.abs(nxt.y - next[d.index].y)) {
          nxt.x = next[d.index].x;
        } else {
          nxt.y = next[d.index].y;
        }
      }
      return next;
    }
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    // Update last pointer position for endDrag to recompute final path.
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (!onPathChange) return;
    const next = computePath(d, e.clientX, e.clientY);
    // Live preview — cheap, transient, no history/DB.
    onPathChange(bundleId, next);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    // Commit — fired once on pointer-up, triggers history + DB persist.
    if (onPathCommit) {
      const finalPoints = computePath(d, d.lastX, d.lastY);
      onPathCommit(bundleId, finalPoints);
    }
  };

  const handleEls: ReactNode[] = [];

  // Endpoints — visual indicators only. Reconnection is handled by react-flow's
  // native reconnect anchors, so these must not capture pointer events.
  for (const idx of [0, points.length - 1]) {
    const p = points[idx];
    handleEls.push(
      <div key={`endpoint-${idx}`} data-handle-kind="endpoint"
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
          width: 9, height: 9, background: '#1f5489', border: '1.5px solid #fff',
          borderRadius: '50%', pointerEvents: 'none', zIndex: 20,
        }} />,
    );
  }

  // Waypoints — draggable + double-click to remove.
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    handleEls.push(
      <div key={`waypoint-${i}`}
        data-handle-kind="waypoint"
        onPointerDown={(e) => beginDrag(e, 'waypoint', i)}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onDoubleClick={(e) => {
          e.stopPropagation();
          const next = removeWaypoint(points, i);
          if (next) {
            onRemoveWaypoint?.(bundleId, next);
          } else {
            // Removing this corner would leave a diagonal segment — reject it
            // and explain why with a brief tooltip.
            setRemoveBlocked(p);
            window.setTimeout(() => setRemoveBlocked(null), 2500);
          }
        }}
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
          width: 8, height: 8, background: '#2d7d6e', border: '1.5px solid #1f5489',
          borderRadius: '50%', pointerEvents: 'all', cursor: 'grab', zIndex: 20,
        }} />,
    );
  }

  // Mid-segment handles — draggable + double-click to add a waypoint.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    handleEls.push(
      <div key={`segment-${i}`}
        data-handle-kind="segment"
        onPointerDown={(e) => beginDrag(e, 'segment', i)}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onAddWaypoint?.(bundleId, addWaypoint(points, i, mid));
        }}
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
          width: 7, height: 7, background: '#fff', border: '1.5px solid #1f5489',
          borderRadius: 2, pointerEvents: 'all', cursor: 'move', zIndex: 20,
        }} />,
    );
  }

  // Rejection tooltip for an un-removable waypoint (§4.3).
  if (removeBlocked) {
    handleEls.push(
      <div key="remove-blocked-tip"
        style={{
          position: 'absolute',
          transform: `translate(-50%, -135%) translate(${removeBlocked.x}px, ${removeBlocked.y}px)`,
          background: '#1d252b', color: '#fff',
          fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10.5, fontWeight: 600,
          padding: '3px 7px', borderRadius: 3, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 30,
        }}>
        Can&apos;t remove — the line would bend
      </div>,
    );
  }

  return <>{handleEls}</>;
}

export function PaymentFlowEdge({
  id,
  data,
  markerEnd,
  selected,
}: EdgeProps<PaymentFlowEdgeType>) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [labelDragOffset, setLabelDragOffset] = useState({ dx: 0, dy: 0 });
  const labelDragRef = useRef<{ startX: number; startY: number } | null>(null);
  const [wasDragging, setWasDragging] = useState(false);

  useEffect(() => {
    setLabelDragOffset({ dx: 0, dy: 0 });
  }, [data?.labelPosition]);

  if (!data) return null;
  const { bundle, entities, points, onSelectTransaction } = data;
  const path = buildFlowPath(points);
  const stroke = bundle.hasMismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke;
  const anchor = labelAnchor(data);
  const N = bundle.transactions.length;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth: 1.5, opacity: selected ? 1 : 0.9 }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${anchor.x + labelDragOffset.dx}px, ${anchor.y + labelDragOffset.dy}px)`,
            background: '#fff',
            border: `0.75px solid ${selected ? stroke : 'rgba(0,0,0,0.16)'}`,
            borderRadius: 2,
            padding: '4px 8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11.5,
            fontWeight: 700,
            color: stroke,
            textAlign: 'center',
            lineHeight: 1.25,
            cursor: 'grab',
            pointerEvents: 'all',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            labelDragRef.current = { startX: e.clientX, startY: e.clientY };
            setWasDragging(false);
          }}
          onPointerMove={(e) => {
            if (!labelDragRef.current) return;
            const dx = e.clientX - labelDragRef.current.startX;
            const dy = e.clientY - labelDragRef.current.startY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setWasDragging(true);
            setLabelDragOffset({ dx, dy });
          }}
          onPointerUp={(e) => {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            if (labelDragRef.current && wasDragging && data.onLabelMove) {
              data.onLabelMove(bundle.bundleId, {
                x: anchor.x + labelDragOffset.dx,
                y: anchor.y + labelDragOffset.dy,
              });
            }
            labelDragRef.current = null;
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!wasDragging) setPopoverOpen((v) => !v);
            setWasDragging(false);
          }}
        >
          {N === 1 ? (
            <SingleLabel txn={bundle.transactions[0]} />
          ) : (
            <BundleSummaryLabel bundle={bundle} />
          )}
        </div>
        {popoverOpen && (
          <TransactionBundlePopover
            bundle={bundle}
            entities={entities}
            x={anchor.x}
            y={anchor.y}
            onClose={() => setPopoverOpen(false)}
            onSelectTransaction={(txnId) => {
              onSelectTransaction(txnId);
              setPopoverOpen(false);
            }}
          />
        )}
      </EdgeLabelRenderer>
      {selected && (
        <EdgeLabelRenderer>
          <FlowEditHandles
            bundleId={bundle.bundleId}
            points={points}
            snapEnabled={data.snapEnabled ?? true}
            parallelGuides={data.parallelGuides}
            onPathChange={data.onPathChange}
            onPathCommit={data.onPathCommit}
            onAddWaypoint={data.onAddWaypoint}
            onRemoveWaypoint={data.onRemoveWaypoint}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function SingleLabel({ txn }: { txn: TransactionBundle['transactions'][0] }) {
  return (
    <>
      <div>{(txn.transaction_type ?? 'other').toString().replace(/^\w/, (c) => c.toUpperCase())}</div>
      {txn.amount_eur != null && (
        <div style={{ fontWeight: 600, fontSize: 11 }}>€{formatAmount(txn.amount_eur)}</div>
      )}
      {txn.is_mismatch && (
        <div style={{ fontWeight: 600, fontSize: 10 }}>
          {txn.mismatch_classification ?? 'mismatch'}
          {txn.mismatch_atad2_article ? ` · art ${txn.mismatch_atad2_article}` : ''}
        </div>
      )}
    </>
  );
}

function BundleSummaryLabel({ bundle }: { bundle: TransactionBundle }) {
  const N = bundle.transactions.length;
  const mismatchCount = bundle.transactions.filter((t) => t.is_mismatch).length;
  return (
    <>
      <div>{N} transactions</div>
      {bundle.totalAmount != null && (
        <div style={{ fontWeight: 600, fontSize: 11 }}>€{formatAmount(bundle.totalAmount)}</div>
      )}
      {bundle.hasMismatch && (
        <div style={{ fontWeight: 600, fontSize: 10 }}>{mismatchCount} of {N} mismatch</div>
      )}
    </>
  );
}
