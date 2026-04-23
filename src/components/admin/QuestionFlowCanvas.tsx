import { useMemo } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Node, Edge, useNodesState, useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { QuestionNode, QuestionNodeData } from "./QuestionNode";
import type { GroupedQuestion } from "./useAdminQuestions";

const NODE_W = 220;
const NODE_H = 110;

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

const nodeTypes = { question: QuestionNode };

const ANSWER_EDGE_STYLE: Record<string, { stroke: string; label: string }> = {
  Yes:     { stroke: "#16a34a", label: "Yes" },
  No:      { stroke: "#dc2626", label: "No" },
  Unknown: { stroke: "#9ca3af", label: "Unknown" },
};

export interface QuestionFlowCanvasProps {
  questions: GroupedQuestion[];
  activeId?: string;
  onNodeClick: (questionId: string) => void;
}

export function QuestionFlowCanvas({ questions, activeId, onNodeClick }: QuestionFlowCanvasProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const incoming = new Set<string>();
    questions.forEach((q) =>
      q.branches.forEach((b) => {
        if (b.next_question_id) incoming.add(b.next_question_id);
      })
    );

    const firstQid = questions[0]?.question_id;

    const rawNodes: Node[] = questions.map((q) => ({
      id: q.question_id,
      type: "question",
      position: { x: 0, y: 0 },
      data: {
        question_id: q.question_id,
        question_title: q.question_title,
        branches: q.branches.map((b) => ({
          answer_option: b.answer_option,
          risk_points: b.risk_points,
          next_question_id: b.next_question_id,
        })),
        orphan: !incoming.has(q.question_id) && q.question_id !== firstQid,
        active: q.question_id === activeId,
      } as unknown as QuestionNodeData,
    }));

    const rawEdges: Edge[] = [];
    questions.forEach((q) => {
      q.branches.forEach((b) => {
        if (!b.next_question_id) return;
        const style = ANSWER_EDGE_STYLE[b.answer_option] ?? { stroke: "#9ca3af", label: b.answer_option };
        rawEdges.push({
          id: `${q.question_id}-${b.answer_option}->${b.next_question_id}`,
          source: q.question_id,
          target: b.next_question_id,
          label: style.label,
          labelStyle: { fontSize: 10, fill: style.stroke, fontWeight: 600 },
          labelBgStyle: { fill: "#fff", opacity: 0.9 },
          style: { stroke: style.stroke, strokeWidth: 1.5 },
        });
      });
    });

    return { initialNodes: layout(rawNodes, rawEdges), initialEdges: rawEdges };
  }, [questions, activeId]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="h-[600px] rounded-[14px] border border-[#ececec] bg-white overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap zoomable pannable />
      </ReactFlow>
    </div>
  );
}
