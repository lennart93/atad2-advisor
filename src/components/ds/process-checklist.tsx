import * as React from "react";
import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ProcessStepStatus = "done" | "current" | "pending" | "error";

export interface ProcessStep {
  id: string;
  label: string;
  status: ProcessStepStatus;
  /** Per-step count from backend events, e.g. "27 entities" or "6 loans". */
  detail?: string;
}

export interface ProcessChecklistProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: ProcessStep[];
  /**
   * Single status line shown instead of the rows once every step is done,
   * e.g. "Suggestions complete · 27/27".
   */
  completedLabel?: string;
  /** Muted right-aligned text on the collapsed line, e.g. a timestamp. */
  meta?: string;
}

/**
 * One row per pipeline step: done (green check), current (neutral spinner),
 * pending (muted), error (amber). When everything is done and a
 * `completedLabel` is given, the list collapses to the single status line
 * pattern from the client-letter screen.
 */
function ProcessChecklist({
  steps,
  completedLabel,
  meta,
  className,
  ...props
}: ProcessChecklistProps) {
  const allDone = steps.length > 0 && steps.every((s) => s.status === "done");

  if (allDone && completedLabel) {
    return (
      <div
        role="status"
        className={cn("flex items-center gap-2", className)}
        {...props}
      >
        <CheckCircle2 className="size-4 shrink-0 text-ds-green" aria-hidden="true" />
        <p className="text-[13px] font-medium text-ds-ink">{completedLabel}</p>
        {meta != null && (
          <span className="ds-tabular-nums ml-auto text-xs text-ds-ink-secondary">
            {meta}
          </span>
        )}
      </div>
    );
  }

  return (
    <div role="status" className={className} {...props}>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2.5">
            {step.status === "done" ? (
              <Check className="size-4 shrink-0 text-ds-green" strokeWidth={2.5} aria-hidden="true" />
            ) : step.status === "current" ? (
              <Loader2
                className="size-4 shrink-0 text-ds-ink-secondary motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : step.status === "error" ? (
              <AlertCircle className="size-4 shrink-0 text-ds-amber" aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className="m-0.5 size-3 shrink-0 rounded-full border border-ds-hairline"
              />
            )}
            <span className="sr-only">
              {step.status === "done"
                ? "Completed: "
                : step.status === "current"
                  ? "In progress: "
                  : step.status === "error"
                    ? "Failed: "
                    : "Pending: "}
            </span>
            <span
              className={cn(
                "text-[13px]",
                step.status === "current" && "font-medium text-ds-ink",
                step.status === "done" && "text-ds-ink",
                step.status === "error" && "text-ds-ink",
                step.status === "pending" && "text-ds-ink-secondary",
              )}
            >
              {step.label}
            </span>
            {step.detail != null && (
              <span className="ds-tabular-nums ml-auto text-xs text-ds-ink-secondary">
                {step.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { ProcessChecklist };
