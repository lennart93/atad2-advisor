// src/components/structure/StructureChart.tsx
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  type Connection,
  type NodeChange,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EntityNode, type EntityNodeData, type EntityNodeType } from './nodes/EntityNode';
import { ClusterNode, type ClusterNodeData, type ClusterNodeType } from './nodes/ClusterNode';
import {
  FiscalUnityFrameNode,
  type FiscalUnityFrameData,
  type FiscalUnityFrameNodeType,
} from './nodes/FiscalUnityFrameNode';
import {
  OwnershipEdge,
  type OwnershipEdgeData,
  type OwnershipEdgeType,
} from './edges/OwnershipEdge';
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/structure/labelMeasure';
import { routeOwnershipEdges } from '@/lib/structure/edgeRouting';
import { taxpayerCenteredViewport, type ChartBounds } from '@/lib/structure/viewportFraming';
import { computeConvergingLabelCounts, computeSiblingChildCounts } from '@/lib/structure/labelLayout';
import { FiscalUnityOverlay } from './overlays/FiscalUnityOverlay';
import type { FrameLayout } from '@/lib/structure/fiscalUnityLayout';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const nodeTypes = {
  entity: EntityNode,
  cluster: ClusterNode,
  fiscalUnityFrame: FiscalUnityFrameNode,
};
const edgeTypes = { ownership: OwnershipEdge };

type ChartNodeType = EntityNodeType | ClusterNodeType | FiscalUnityFrameNodeType;
type ChartEdgeType = OwnershipEdgeType;

export interface StructureChartProps {
  entities: StructureEntity[];
  edges: StructureEdge[];
  /** Cluster nodes synthesized by the parent. */
  clusterNodes: Array<{ id: string; position: { x: number; y: number }; data: ClusterNodeData }>;
  onSelectionChange: (
    s:
      | { kind: 'node'; id: string }
      | { kind: 'edge'; id: string }
      | { kind: 'nodes'; ids: string[] }
      | null,
  ) => void;
  onGroupingLabelClick?: (groupId: string, screenX: number, screenY: number) => void;
  onGroupingFrameClick?: (groupId: string) => void;
  onGroupingBoundsOverride?: (
    groupId: string,
    deltas: { dLeft: number; dTop: number; dRight: number; dBottom: number } | null,
  ) => void;
  selectedGroupingId?: string | null;
  onNodePositionEnd: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onPctChange?: (edgeId: string, newPct: number) => void;
  /** Persist a hand-dragged 2D label offset (chart px from anchor). */
  onLabelMove?: (edgeId: string, dx: number, dy: number) => void;
  /** Hide the % label on this edge (value is kept for the memo). */
  onLabelHide?: (edgeId: string) => void;
  ranks: Map<string, number>;
  frameLayouts: FrameLayout[];
  labelLineBreaks: Map<string, string[]>;
  gridVisible: boolean;
  /**
   * Called once on init with a stable accessor API the parent can use at
   * capture time to grab the live ReactFlow viewport element and node array.
   */
  onCaptureReady?: (api: {
    getViewportEl: () => HTMLElement | null;
    getNodes: () => Node[];
    clearSelection: () => void;
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
  // React Flow multi-select: vuurt bij elke shift-klik / box-select. We laten
  // de single-select afhandelen door onNodeClick (zonder shift) en de
  // multi-select door deze callback wanneer 2+ nodes geselecteerd zijn.
  useOnSelectionChange({
    onChange: ({ nodes: selNodes }) => {
      if (selNodes.length >= 2) {
        props.onSelectionChange({ kind: 'nodes', ids: selNodes.map((n) => n.id) });
      }
    },
  });

  const initialNodes = useMemo<ChartNodeType[]>(() => {
    const entityNodes: EntityNodeType[] = props.entities.map((e) => {
      const nameLines = props.labelLineBreaks.get(e.id) ?? [e.name];
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
          color: e.color ?? null,
          focused: false,
        } satisfies EntityNodeData,
      };
    });
    const clusters: ClusterNodeType[] = props.clusterNodes.map((c) => ({
      id: c.id,
      type: 'cluster',
      position: c.position,
      data: c.data,
    }));
    // FE-kaders staan eerst in de array (= achter de entiteiten in de DOM)
    // en zijn niet sleep-/selecteerbaar via React Flow zelf — die rollen
    // blijven bij onze eigen onFrameClick / sleep-handles in de overlay.
    const frames: FiscalUnityFrameNodeType[] = props.frameLayouts.map((fl) => ({
      id: `fe_${fl.groupingId}`,
      type: 'fiscalUnityFrame',
      position: { x: fl.x, y: fl.y },
      draggable: false,
      selectable: false,
      data: {
        groupId: fl.groupingId,
        kind: fl.kind,
        label: fl.label,
        width: fl.width,
        height: fl.height,
        isSelected: props.selectedGroupingId === fl.groupingId,
        onFrameClick: props.onGroupingFrameClick,
        onLabelClick: props.onGroupingLabelClick,
      } satisfies FiscalUnityFrameData,
    }));
    return [...frames, ...entityNodes, ...clusters];
  }, [
    props.entities,
    props.clusterNodes,
    props.labelLineBreaks,
    props.frameLayouts,
    props.selectedGroupingId,
    props.onGroupingFrameClick,
    props.onGroupingLabelClick,
  ]);

  const initialEdges = useMemo<ChartEdgeType[]>(() => {
    // Index entity positions for O(1) lookup when computing per-edge
    // intermediate-row obstacles.
    const entityBoundsById = new Map<
      string,
      { centerX: number; top: number; bottom: number }
    >();
    for (const en of props.entities) {
      entityBoundsById.set(en.id, {
        centerX: en.position_x + NODE_WIDTH / 2,
        top: en.position_y,
        bottom: en.position_y + NODE_HEIGHT,
      });
    }

    // Count how many visible % labels converge on each child. 2+ → those edges
    // place their label under their own parent instead of above the shared
    // child (smart anti-overlap; the edge component does the positioning).
    const ownershipEdges = props.edges.filter((e) => e.kind === 'ownership');
    const convergeCounts = computeConvergingLabelCounts(
      ownershipEdges.map((e) => ({
        id: e.id,
        target: e.to_entity_id,
        hasLabel: e.ownership_pct != null && !e.label_hidden,
      })),
    );

    // Count how many ownership edges share each parent. 2+ → the parent fans
    // out and the siblings' horizontal bus crosses the mid-line, so a straight
    // child drops its % below the bus instead of onto the crossing.
    const siblingCounts = computeSiblingChildCounts(
      ownershipEdges.map((e) => ({ id: e.id, source: e.from_entity_id })),
    );

    // Baan-routing over de hele kaart: elke moeder-waaier krijgt een eigen
    // horizontale rail en overlappende rails komen in aparte banen, zodat
    // lijnen van verschillende moeders nooit op dezelfde hoogte samenvallen.
    // Cluster-placeholders tellen mee als gewone nodes (hun edges ook).
    const routing = routeOwnershipEdges({
      nodes: [
        ...props.entities.map((en) => ({ id: en.id, x: en.position_x, y: en.position_y })),
        ...props.clusterNodes.map((c) => ({ id: c.id, x: c.position.x, y: c.position.y })),
      ],
      edges: ownershipEdges.map((e) => ({
        id: e.id,
        from: e.from_entity_id,
        to: e.to_entity_id,
      })),
    });

    return ownershipEdges
      .map((e) => {
        // For long-skip routing: list center-X of every entity strictly between
        // source-row and target-row in Y. These are the obstacles the long
        // vertical drop must avoid.
        const src = entityBoundsById.get(e.from_entity_id);
        const tgt = entityBoundsById.get(e.to_entity_id);
        let intermediateXs: number[] = [];
        if (src && tgt && tgt.top > src.bottom) {
          for (const other of props.entities) {
            if (other.id === e.from_entity_id || other.id === e.to_entity_id) continue;
            const ob = entityBoundsById.get(other.id);
            if (!ob) continue;
            // Strictly between source-bottom and target-top.
            if (ob.top > src.bottom - 0.5 && ob.bottom < tgt.top + 0.5) {
              intermediateXs.push(ob.centerX);
            }
          }
        }
        return {
          id: e.id,
          source: e.from_entity_id,
          target: e.to_entity_id,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'ownership',
          data: {
            ownership_pct: e.ownership_pct,
            onPctChange: props.onPctChange,
            intermediateXs,
            routing: routing.get(e.id) ?? null,
            label_dx: e.label_dx,
            label_dy: e.label_dy,
            label_t: e.label_t,
            label_hidden: e.label_hidden,
            convergingLabels: convergeCounts.get(e.id) ?? 0,
            siblingCount: siblingCounts.get(e.id) ?? 0,
            onLabelMove: props.onLabelMove,
            onLabelHide: props.onLabelHide,
          } satisfies OwnershipEdgeData,
        } as OwnershipEdgeType;
      });
  }, [props.edges, props.entities, props.clusterNodes, props.onPctChange, props.onLabelMove, props.onLabelHide]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ChartNodeType>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ChartEdgeType>(initialEdges);

  // Sync xyflow state when parent props change (extraction polling refreshes
  // entities/edges; without this the canvas stays at the initial value).
  //
  // Carry over React Flow's own `selected` flag while syncing. `initialNodes`
  // recomputes on many parent re-renders (e.g. clicking a node updates parent
  // state, which mints fresh inline callbacks feeding the memo). A plain
  // setNodes(initialNodes) would clear the selection a frame after it appears —
  // that is the "selection ring only flashes" bug. Preserving the flag keeps
  // the ring on the clicked node until the user clicks elsewhere.
  useEffect(() => {
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return selected.size === 0
        ? initialNodes
        : initialNodes.map((n) => (selected.has(n.id) ? { ...n, selected: true } : n));
    });
  }, [initialNodes, setNodes]);
  useEffect(() => {
    setEdges((prev) => {
      const selected = new Set(prev.filter((e) => e.selected).map((e) => e.id));
      return selected.size === 0
        ? initialEdges
        : initialEdges.map((e) => (selected.has(e.id) ? { ...e, selected: true } : e));
    });
  }, [initialEdges, setEdges]);

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
      clearSelection: () => {
        // Wis React Flow's interne selected-flag op alle nodes + edges, anders
        // verschijnt de blauwe selectie-ring in de capture.
        reactFlow.setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
        reactFlow.setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
      },
    });
  }, [onCaptureReady, reactFlow]);

  const positionSig = useMemo(
    () => initialNodes.map((n) => `${n.id}:${n.position.x},${n.position.y}`).join('|'),
    [initialNodes],
  );
  const lastFitSig = useRef<string>('');
  const hasFramedRef = useRef(false);
  // Frame the chart so the TAXPAYER is horizontally centred (it is rarely the
  // UPE, so a plain bounding-box fit drifts it off to one side). The zoom still
  // keeps every entity visible. Falls back to a plain fitView if there is no
  // taxpayer or the pane hasn't been measured yet.
  useEffect(() => {
    if (initialNodes.length === 0) return;
    if (positionSig === lastFitSig.current) return;
    lastFitSig.current = positionSig;
    // First framing snaps (duration 0); later re-frames animate.
    const duration = hasFramedRef.current ? 250 : 0;
    // Defer to next frame so xyflow has applied the new node positions first.
    const id = requestAnimationFrame(() => {
      const pane = wrapperRef.current?.getBoundingClientRect();
      const taxpayer = props.entities.find((e) => e.is_taxpayer);
      // Bounding box of every rendered node: entities, cluster placeholders and
      // fiscal-unity frames. Computed from props (top-left coords) so it does
      // not depend on React Flow having measured the DOM nodes yet.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const grow = (x: number, y: number, w: number, h: number) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      };
      for (const e of props.entities) grow(e.position_x, e.position_y, NODE_WIDTH, NODE_HEIGHT);
      for (const c of props.clusterNodes) grow(c.position.x, c.position.y, NODE_WIDTH, NODE_HEIGHT);
      for (const f of props.frameLayouts) grow(f.x, f.y, f.width, f.height);

      if (!pane || !taxpayer || !Number.isFinite(minX)) {
        reactFlow.fitView({ padding: 0.1, minZoom: 0.3, maxZoom: 1.0, duration });
        hasFramedRef.current = true;
        return;
      }
      const bounds: ChartBounds = { minX, minY, maxX, maxY };
      const vp = taxpayerCenteredViewport({
        bounds,
        taxpayerCenterX: taxpayer.position_x + NODE_WIDTH / 2,
        viewportWidth: pane.width,
        viewportHeight: pane.height,
      });
      reactFlow.setViewport(vp, { duration });
      hasFramedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [positionSig, initialNodes.length, reactFlow, props.entities, props.clusterNodes, props.frameLayouts]);

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

  return (
    <div ref={wrapperRef} className="flex-1 w-full h-full" style={{ background: '#faf8f4', width: '100%', height: '100%' }}>
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
        isValidConnection={(c) => c.source !== c.target}
        onNodeClick={(event, n) => {
          // Shift-klik valt onder React Flow's multi-select; useOnSelectionChange
          // levert dan een 'nodes'-selectie. Gewone klik = single-select.
          if (!event.shiftKey) {
            props.onSelectionChange({ kind: 'node', id: n.id });
          }
        }}
        onEdgeClick={(_, e) => props.onSelectionChange({ kind: 'edge', id: e.id })}
        onPaneClick={() => props.onSelectionChange(null)}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
        multiSelectionKeyCode="Shift"
        fitView
      >
        <FiscalUnityOverlay
          frameLayouts={props.frameLayouts}
          onBoundsOverrideChange={props.onGroupingBoundsOverride}
          selectedId={props.selectedGroupingId ?? null}
        />
        <Background
          gap={22}
          size={1}
          color={props.gridVisible ? 'rgba(22,21,15,0.05)' : 'rgba(22,21,15,0.03)'}
          variant={BackgroundVariant.Dots}
        />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
