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
  OwnershipEdge,
  type OwnershipEdgeData,
  type OwnershipEdgeType,
} from './edges/OwnershipEdge';
import { FiscalUnityOverlay } from './overlays/FiscalUnityOverlay';
import type { StructureEntity, StructureEdge, StructureGroup } from '@/lib/structure/types';

const nodeTypes = { entity: EntityNode, cluster: ClusterNode };
const edgeTypes = { ownership: OwnershipEdge };

type ChartNodeType = EntityNodeType | ClusterNodeType;
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
  onNodePositionEnd: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  onPctChange?: (edgeId: string, newPct: number) => void;
  ranks: Map<string, number>;
  groupings: StructureGroup[];
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
    return [...entityNodes, ...clusters];
  }, [props.entities, props.clusterNodes, props.labelLineBreaks]);

  const initialEdges = useMemo<ChartEdgeType[]>(() => {
    return props.edges
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
  }, [props.edges, props.onPctChange]);

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
        <FiscalUnityOverlay groupings={props.groupings} onLabelClick={props.onGroupingLabelClick} />
        <Background
          gap={props.gridVisible ? 8 : 40}
          color={props.gridVisible ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.04)'}
          variant={props.gridVisible ? BackgroundVariant.Lines : BackgroundVariant.Dots}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}
