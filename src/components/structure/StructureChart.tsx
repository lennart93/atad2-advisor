// src/components/structure/StructureChart.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type NodeChange,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EntityNode, type EntityNodeData, type EntityNodeType, type WarningBadge } from './nodes/EntityNode';
import { ClusterNode, type ClusterNodeData, type ClusterNodeType } from './nodes/ClusterNode';
import {
  OwnershipEdge,
  type OwnershipEdgeData,
  type OwnershipEdgeType,
} from './edges/OwnershipEdge';
import {
  PaymentFlowEdge,
  type PaymentFlowEdgeData,
  type PaymentFlowEdgeType,
} from './edges/PaymentFlowEdge';
import { FiscalUnityOverlay } from './overlays/FiscalUnityOverlay';
import { PALETTE } from '@/lib/structure/palette';
import type { StructureEntity, StructureEdge, StructureGroup, StructureFlowRouting } from '@/lib/structure/types';
import { bundleTransactions } from '@/lib/structure/bundleTransactions';
import { routeFlows, type RoutedFlowPoint } from '@/lib/structure/flowRouting';
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/structure/labelMeasure';

const nodeTypes = { entity: EntityNode, cluster: ClusterNode };
const edgeTypes = { ownership: OwnershipEdge, paymentFlow: PaymentFlowEdge };

type ChartNodeType = EntityNodeType | ClusterNodeType;
type ChartEdgeType = OwnershipEdgeType | PaymentFlowEdgeType;

export interface StructureChartProps {
  entities: StructureEntity[];
  edges: StructureEdge[];
  /** Cluster nodes synthesized by the parent. */
  clusterNodes: Array<{ id: string; position: { x: number; y: number }; data: ClusterNodeData }>;
  onSelectionChange: (s: { kind: 'node' | 'edge'; id: string } | null) => void;
  onNodePositionEnd: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onPctChange?: (edgeId: string, newPct: number) => void;
  ranks: Map<string, number>;
  groupings: StructureGroup[];
  labelLineBreaks: Map<string, string[]>;
  ownershipSumIssues: Map<string, number>; // child_id → sum_pct
  orphanIds: Set<string>;
  focusedEntityIds: Set<string>;
  onToggleFocus: (id: string) => void;
  onSelectTransaction: (txnId: string) => void;
  /** Manual flow routing, keyed by `${from}|${to}` (= bundleId). */
  flowRouting: Map<string, StructureFlowRouting>;
  /** Tier bands for the orthogonal routing pass. */
  tierBands: Array<{ topY: number; bottomY: number }>;
  snapEnabled: boolean;
  gridVisible: boolean;
  /** Live (transient) path overrides during an in-progress drag. */
  liveFlowPoints: Map<string, RoutedFlowPoint[]>;
  onFlowPathChange: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onFlowPathCommit: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onFlowLabelMove: (bundleId: string, position: RoutedFlowPoint) => void;
  onFlowAddWaypoint: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onFlowRemoveWaypoint: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onFlowReconnect: (bundleId: string, newFrom: string, newTo: string) => void;
  onFlowResetRouting: (bundleId: string) => void;
  /**
   * Called once on init with a stable accessor API the parent can use at
   * capture time to grab the live ReactFlow viewport element and node array.
   */
  onCaptureReady?: (api: {
    getViewportEl: () => HTMLElement | null;
    getNodes: () => Node[];
  }) => void;
}

export function StructureChart(props: StructureChartProps) {
  // useReactFlow requires a ReactFlowProvider in the ancestor tree.
  return (
    <ReactFlowProvider>
      <StructureChartInner {...props} />
    </ReactFlowProvider>
  );
}

function StructureChartInner(props: StructureChartProps) {
  const initialNodes = useMemo<ChartNodeType[]>(() => {
    const entityNodes: EntityNodeType[] = props.entities.map((e) => {
      const nameLines = props.labelLineBreaks.get(e.id) ?? [e.name];
      let warningBadge: WarningBadge | undefined;
      const sum = props.ownershipSumIssues.get(e.id);
      if (sum != null) warningBadge = { kind: 'ownership_sum', sum_pct: sum };
      else if (props.orphanIds.has(e.id)) warningBadge = { kind: 'orphan' };
      return {
        id: e.id,
        type: 'entity',
        position: { x: e.position_x, y: e.position_y },
        data: {
          name: e.name,
          nameLines,
          legal_form: e.legal_form,
          jurisdiction_iso: e.jurisdiction_iso,
          entity_type: e.entity_type,
          is_taxpayer: e.is_taxpayer,
          source: e.source as EntityNodeData['source'],
          warningBadge,
          focused: props.focusedEntityIds.has(e.id),
        } satisfies EntityNodeData,
      };
    });
    const clusters: ClusterNodeType[] = props.clusterNodes.map((c) => ({
      id: c.id,
      type: 'cluster',
      position: c.position,
      data: c.data,
    }));
    return [...entityNodes, ...clusters];
  }, [props.entities, props.clusterNodes, props.labelLineBreaks, props.ownershipSumIssues, props.orphanIds, props.focusedEntityIds]);

  const initialEdges = useMemo<ChartEdgeType[]>(() => {
    const ownershipEdges: OwnershipEdgeType[] = props.edges
      .filter((e) => e.kind === 'ownership')
      .map((e) => ({
        id: e.id,
        source: e.from_entity_id,
        target: e.to_entity_id,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'ownership',
        data: {
          ownership_pct: e.ownership_pct,
          ownership_voting_only: e.ownership_voting_only,
          onPctChange: props.onPctChange,
        } satisfies OwnershipEdgeData,
      } as OwnershipEdgeType));

    const bundles = bundleTransactions(props.edges, props.focusedEntityIds);

    const entityRects = new Map(
      props.entities.map((e) => [
        e.id,
        { x: e.position_x, y: e.position_y, width: NODE_WIDTH, height: NODE_HEIGHT },
      ]),
    );
    const routed = routeFlows({ bundles, entityRects, tierBands: props.tierBands });

    const flowEdges: PaymentFlowEdgeType[] = bundles.map((bundle) => {
      const auto = routed.get(bundle.bundleId);
      const manual = props.flowRouting.get(bundle.bundleId);
      const live = props.liveFlowPoints.get(bundle.bundleId);
      // Live preview wins during a drag; then persisted manual; then auto-routed.
      const points =
        live && live.length > 0
          ? live
          : manual && manual.waypoints.length > 0
          ? manual.waypoints
          : (auto?.points ?? []);
      const labelSegmentIndex = auto?.labelSegmentIndex ?? 0;
      return {
        id: `flow-${bundle.bundleId}`,
        source: bundle.from_entity_id,
        target: bundle.to_entity_id,
        type: 'paymentFlow',
        zIndex: 10,
        reconnectable: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: bundle.hasMismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke,
        },
        data: {
          bundle,
          entities: props.entities,
          points,
          labelSegmentIndex,
          labelPosition: manual?.label_position ?? null,
          isManual: Boolean(manual),
          snapEnabled: props.snapEnabled,
          onSelectTransaction: props.onSelectTransaction,
          onPathChange: props.onFlowPathChange,
          onPathCommit: props.onFlowPathCommit,
          onLabelMove: props.onFlowLabelMove,
          onAddWaypoint: props.onFlowAddWaypoint,
          onRemoveWaypoint: props.onFlowRemoveWaypoint,
        } satisfies PaymentFlowEdgeData,
      } as PaymentFlowEdgeType;
    });

    // Snap-to-align guides: collect every parallel flow segment coordinate so a
    // dragged segment can snap to line up with the others.
    const horizontal: number[] = [];
    const vertical: number[] = [];
    for (const fe of flowEdges) {
      const pts = fe.data.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (Math.abs(a.y - b.y) < 0.01) horizontal.push(a.y);
        else if (Math.abs(a.x - b.x) < 0.01) vertical.push(a.x);
      }
    }
    const parallelGuides = { horizontal, vertical };
    for (const fe of flowEdges) fe.data.parallelGuides = parallelGuides;

    return [...ownershipEdges, ...flowEdges];
  }, [
    props.edges,
    props.entities,
    props.onPctChange,
    props.focusedEntityIds,
    props.onSelectTransaction,
    props.flowRouting,
    props.liveFlowPoints,
    props.tierBands,
    props.snapEnabled,
    props.onFlowPathChange,
    props.onFlowPathCommit,
    props.onFlowLabelMove,
    props.onFlowAddWaypoint,
    props.onFlowRemoveWaypoint,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ChartNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ChartEdgeType>(initialEdges);

  // Sync xyflow state when parent props change (extraction polling refreshes
  // entities/edges; without this the canvas stays at the initial value).
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  // Refit the viewport whenever the set of nodes or their positions changes
  // (after auto-layout runs, after polling refresh, etc.). The static `fitView`
  // prop on <ReactFlow> only fits at mount.
  const reactFlow = useReactFlow();

  // Snapshot capture wiring: expose the live viewport element + node array to
  // the parent through the onCaptureReady callback, fired once on init.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { onCaptureReady } = props;
  useEffect(() => {
    if (!onCaptureReady) return;
    onCaptureReady({
      getViewportEl: () =>
        wrapperRef.current?.querySelector<HTMLElement>('.react-flow__viewport') ?? null,
      getNodes: () => reactFlow.getNodes(),
    });
  }, [onCaptureReady, reactFlow]);

  const positionSig = useMemo(
    () => initialNodes.map((n) => `${n.id}:${n.position.x},${n.position.y}`).join('|'),
    [initialNodes],
  );
  const lastFitSig = useRef<string>('');
  useEffect(() => {
    if (initialNodes.length === 0) return;
    if (positionSig === lastFitSig.current) return;
    lastFitSig.current = positionSig;
    // Defer to next frame so xyflow has applied the new node positions first.
    const id = requestAnimationFrame(() =>
      reactFlow.fitView({ padding: 0.05, minZoom: 0.3, maxZoom: 1.0, duration: 250 }),
    );
    return () => cancelAnimationFrame(id);
  }, [positionSig, initialNodes.length, reactFlow]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<ChartNodeType>[]) => {
      onNodesChange(changes);
      for (const c of changes) {
        // Read position directly from the change object — `nodes` here is the
        // closure-captured pre-change state, so nodes.find() would return the
        // stale position instead of the drag-end position.
        if (c.type === 'position' && c.dragging === false && c.id && c.position) {
          props.onNodePositionEnd(c.id, c.position.x, c.position.y);
        }
      }
    },
    [onNodesChange, props],
  );

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (oldEdge.type !== 'paymentFlow') return;
      if (!newConnection.source || !newConnection.target) return;
      // Edge id is `flow-${bundleId}` — strip the `flow-` prefix.
      const bundleId = oldEdge.id.replace(/^flow-/, '');
      props.onFlowReconnect(bundleId, newConnection.source, newConnection.target);
    },
    [props],
  );

  // Per-flow right-click "Reset routing" context menu (§4.7).
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bundleId: string } | null>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  return (
    <div ref={wrapperRef} className="flex-1 w-full h-full" style={{ background: '#ffffff', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c: Connection) =>
          c.source && c.target && props.onConnect(c.source, c.target)
        }
        onReconnect={handleReconnect}
        isValidConnection={(c) => c.source !== c.target}
        onNodeClick={(_, n) => {
          props.onSelectionChange({ kind: 'node', id: n.id });
          if (n.type === 'entity') props.onToggleFocus(n.id);
        }}
        onEdgeClick={(_, e) => props.onSelectionChange({ kind: 'edge', id: e.id })}
        onEdgeContextMenu={(e, edge) => {
          if (edge.type !== 'paymentFlow') return;
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, bundleId: edge.id.replace(/^flow-/, '') });
        }}
        onPaneClick={() => props.onSelectionChange(null)}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <FiscalUnityOverlay groupings={props.groupings} />
        <Background
          gap={props.gridVisible ? 8 : 40}
          color={props.gridVisible ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)'}
          variant={props.gridVisible ? BackgroundVariant.Lines : BackgroundVariant.Dots}
        />
        <Controls />
      </ReactFlow>
      {contextMenu && (
        <div
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}
          className="bg-card border border-[hsl(var(--border-subtle))] rounded-md shadow-lg py-1 text-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full text-left px-3 py-1.5 hover:bg-accent whitespace-nowrap"
            onClick={() => {
              props.onFlowResetRouting(contextMenu.bundleId);
              setContextMenu(null);
            }}
          >
            Reset routing
          </button>
        </div>
      )}
    </div>
  );
}
