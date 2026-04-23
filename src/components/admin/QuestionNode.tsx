import { Handle, Position, NodeProps } from "@xyflow/react";
import { RiskChip } from "./StatChip";

export interface QuestionBranchSummary {
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
}

export interface QuestionNodeData {
  question_id: string;
  question_title: string | null;
  branches: QuestionBranchSummary[];
  orphan?: boolean;
  active?: boolean;
}

export function QuestionNode({ data }: NodeProps) {
  const d = data as unknown as QuestionNodeData;
  const maxRisk = Math.max(0, ...d.branches.map((b) => b.risk_points));
  return (
    <div
      className={`rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[200px] max-w-[240px] cursor-pointer ${
        d.active ? "border-[#4f46e5] ring-2 ring-[#c7d2fe]" : "border-[#ececec]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-[#4f46e5]">{d.question_id}</span>
        <RiskChip points={maxRisk} />
      </div>
      <div className="text-[11px] font-medium text-foreground line-clamp-2">
        {d.question_title || "(untitled)"}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {d.branches.map((b) => (
          <span
            key={b.answer_option}
            className="text-[9px] rounded bg-muted/60 px-1 py-0.5 text-muted-foreground"
          >
            {b.answer_option} →{" "}
            <span className="font-mono text-foreground">{b.next_question_id || "END"}</span>
          </span>
        ))}
      </div>
      {d.orphan && (
        <div className="mt-1.5 inline-flex items-center rounded bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5">
          No incoming edge
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}
