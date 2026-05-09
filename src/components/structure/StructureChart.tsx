// src/components/structure/StructureChart.tsx
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EntityNode, type EntityNodeType } from './nodes/EntityNode';
import { ClusterNode, type ClusterNodeData, type ClusterNodeType } from './nodes/ClusterNode';
import {
  OwnershipEdge,
  type OwnershipEdgeData,
  type OwnershipEdgeType,
} from './edges/OwnershipEdge';
import {
  TransactionEdge,
  type TransactionEdgeData,
  type TransactionEdgeType,
} from './edges/TransactionEdge';
import { PALETTE } from '@/lib/structure/palette';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const nodeTypes = { entity: EntityNode, cluster: ClusterNode };
const edgeTypes = { ownership: OwnershipEdge, transaction: TransactionEdge };

type ChartNodeType = EntityNodeType | ClusterNodeType;
type ChartEdgeType = OwnershipEdgeType | TransactionEdgeType;

export interface StructureChartProps {
  entities: StructureEntity[];
  edges: StructureEdge[];
  /** Cluster nodes synthesized by the parent. */
  clusterNodes: Array<{ id: string; position: { x: number; y: number }; data: ClusterNodeData }>;
  onSelectionChange: (s: { kind: 'node' | 'edge'; id: string } | null) => void;
  onNodePositionEnd: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
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
    const entityNodes: EntityNodeType[] = props.entities.map((e) => ({
      id: e.id,
      type: 'entity',
      position: { x: e.position_x, y: e.position_y },
      data: {
        name: e.name,
        legal_form: e.legal_form,
        jurisdiction_iso: e.jurisdiction_iso,
        entity_type: e.entity_type,
        is_taxpayer: e.is_taxpayer,
        source: e.source as EntityNodeType['data']['source'],
      },
    }));
    const clusters: ClusterNodeType[] = props.clusterNodes.map((c) => ({
      id: c.id,
      type: 'cluster',
      position: c.position,
      data: c.data,
    }));
    return [...entityNodes, ...clusters];
  }, [props.entities, props.clusterNodes]);

  const initialEdges = useMemo<ChartEdgeType[]>(
    () =>
      props.edges.map<ChartEdgeType>((e) =>
        e.kind === 'ownership'
          ? ({
              id: e.id,
              source: e.from_entity_id,
              target: e.to_entity_id,
              type: 'ownership',
              data: {
                ownership_pct: e.ownership_pct,
                ownership_voting_only: e.ownership_voting_only,
              } satisfies OwnershipEdgeData,
            } as OwnershipEdgeType)
          : ({
              id: e.id,
              source: e.from_entity_id,
              target: e.to_entity_id,
              type: 'transaction',
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: e.is_mismatch
                  ? PALETTE.mismatchStroke
                  : PALETTE.normalTransactionStroke,
              },
              data: {
                transaction_type: (e.transaction_type ?? 'other') as TransactionEdgeData['transaction_type'],
                amount_eur: e.amount_eur,
                is_mismatch: e.is_mismatch,
                mismatch_classification: (e.mismatch_classification ?? null) as TransactionEdgeData['mismatch_classification'],
                mismatch_atad2_article: e.mismatch_atad2_article,
                label: e.label,
              } satisfies TransactionEdgeData,
            } as TransactionEdgeType),
      ),
    [props.edges],
  );

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
        if (c.type === 'position' && c.dragging === false && c.id) {
          const n = nodes.find((x) => x.id === c.id);
          if (n) props.onNodePositionEnd(n.id, n.position.x, n.position.y);
        }
      }
    },
    [onNodesChange, nodes, props],
  );

  return (
    <div className="flex-1 w-full h-full" style={{ background: '#ffffff', width: '100%', height: '100%' }}>
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
        onNodeClick={(_, n) => props.onSelectionChange({ kind: 'node', id: n.id })}
        onEdgeClick={(_, e) => props.onSelectionChange({ kind: 'edge', id: e.id })}
        onPaneClick={() => props.onSelectionChange(null)}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
      >
        <Background gap={40} color="rgba(0,0,0,0.04)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
