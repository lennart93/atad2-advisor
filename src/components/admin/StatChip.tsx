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
  neutral: "bg-ds-fill-muted text-ds-ink-secondary",
  success: "bg-ds-green-bg text-ds-green-text",
  warning: "bg-ds-amber-bg text-ds-amber-text",
  // 'danger' here labels statuses like deleted/bug, not a destructive action,
  // so it reads neutral rather than red.
  danger:  "bg-ds-fill-muted text-ds-ink-secondary",
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
