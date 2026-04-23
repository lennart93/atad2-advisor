import { cn } from "@/lib/utils";
import { getRiskLevel, RISK_CHIP_CLASSES } from "./entityColors";

export interface RiskChipProps {
  points: number;
  className?: string;
}

export function RiskChip({ points, className }: RiskChipProps) {
  const level = getRiskLevel(points);
  const { bg, text } = RISK_CHIP_CLASSES[level];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        bg, text, className
      )}
    >
      {points.toFixed(1)}
    </span>
  );
}

export type StatusTone = "neutral" | "success" | "warning" | "danger";

export interface StatusChipProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger:  "bg-red-100 text-red-800",
};

export function StatusChip({ label, tone = "neutral", className }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
