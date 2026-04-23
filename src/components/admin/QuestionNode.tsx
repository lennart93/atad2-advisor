import { Handle, Position, NodeProps } from "@xyflow/react";
import { RiskChip } from "./StatChip";

export interface QuestionNodeData {
  question_id: string;
  question_title: string | null;
  risk_points: number;
  orphan?: boolean;
  active?: boolean;
}

export function QuestionNode({ data }: NodeProps) {
  const d = data as unknown as QuestionNodeData;
  return (
    <div
      className={`rounded-lg border bg-white shadow-sm px-3 py-2 min-w-[180px] max-w-[220px] cursor-pointer ${
        d.active ? "border-[#4f46e5] ring-2 ring-[#c7d2fe]" : "border-[#ececec]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-[#4f46e5]">{d.question_id}</span>
        <RiskChip points={d.risk_points ?? 0} />
      </div>
      <div className="text-[11px] font-medium text-foreground line-clamp-2">
        {d.question_title || "(untitled)"}
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
