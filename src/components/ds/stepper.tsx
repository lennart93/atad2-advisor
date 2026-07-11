import * as React from "react";
import { Check, ChevronDown, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface StepperProps {
  /** Step labels in order, e.g. ["Intake", "Documents", ...]. */
  steps: string[];
  /** Index of the active step. */
  current: number;
  /** Steps beyond `current` that are also done (revisiting from a later view). */
  extraDone?: number[];
  /** Steps that accept a click (jump straight to that step). When omitted,
   *  falls back to `extraDone` for backward compatibility. */
  clickableIndexes?: number[];
  /** Steps in `clickableIndexes` become clickable when this is set. */
  onStepClick?: (index: number) => void;
  /** Tooltip shown on steps in `lockedIndexes` (finalized flow). */
  lockedTooltip?: string;
  lockedIndexes?: number[];
  className?: string;
}

type StepState = "active" | "done" | "upcoming";

/**
 * The ~20px circular step marker. Hierarchy is carried by fill and weight, not
 * by a coloured pill: active is a filled near-black badge with a white number,
 * done is a green check in a thin ring, upcoming is a thin grey outline circle
 * with a grey number.
 */
function StepBadge({ state, n }: { state: StepState; n: number }) {
  if (state === "done") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-ds-ink-tertiary">
        <Check className="size-3 text-ds-green" strokeWidth={2.5} aria-hidden="true" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="ds-tabular-nums flex size-5 shrink-0 items-center justify-center rounded-full bg-ds-accent text-[11px] font-normal text-ds-card">
        {n}
      </span>
    );
  }
  return (
    <span className="ds-tabular-nums flex size-5 shrink-0 items-center justify-center rounded-full border border-ds-hairline text-[11px] text-ds-ink-secondary">
      {n}
    </span>
  );
}

function stepLabelClass(state: StepState) {
  return cn(
    "truncate text-[13px]",
    state === "active" && "font-medium text-ds-ink",
    state === "done" && "text-ds-ink",
    state === "upcoming" && "text-ds-ink-secondary",
  );
}

/** Zero-padded step number. Active is terracotta (the one brand accent),
 *  done a touch darker than upcoming so completed steps read as settled. */
function stepNumClass(state: StepState) {
  return cn(
    state === "active" && "text-brand-terracotta",
    state === "done" && "text-ds-ink-secondary",
    state === "upcoming" && "text-ds-ink-tertiary",
  );
}

/**
 * Horizontal step indicator. The full track renders from 1200px up and
 * truncates its labels before it can overlap neighbours (the Open-questions
 * badge sits next to it in the shell); below 1200px it collapses to a
 * "Step 3 of 7 · Questions" button whose popover keeps every step (and the
 * clickable ones) reachable.
 */
function Stepper({
  steps,
  current,
  extraDone,
  clickableIndexes,
  onStepClick,
  lockedTooltip,
  lockedIndexes,
  className,
}: StepperProps) {
  const extraDoneSet = React.useMemo(() => new Set(extraDone ?? []), [extraDone]);
  const clickableSet = React.useMemo(
    () => new Set(clickableIndexes ?? extraDone ?? []),
    [clickableIndexes, extraDone],
  );
  const lockedSet = React.useMemo(() => new Set(lockedIndexes ?? []), [lockedIndexes]);
  const [compactOpen, setCompactOpen] = React.useState(false);

  return (
    <nav aria-label="Progress" className={cn(className)}>
      {/* Compact form below 1200px: a popover so done steps stay clickable */}
      <div className="flex justify-center min-[1200px]:hidden">
        <Popover open={compactOpen} onOpenChange={setCompactOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-ds-control px-2 py-1 text-[13px] font-normal text-ds-ink transition-colors duration-150 hover:bg-ds-fill-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
            >
              <span className="ds-tabular-nums">
                Step {current + 1} of {steps.length}
              </span>
              <span aria-hidden="true"> · </span>
              <span className="text-ds-ink-secondary">{steps[current]}</span>
              <ChevronDown className="size-3.5 text-ds-ink-secondary" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-1.5">
            <ol className="space-y-0.5">
              {steps.map((label, i) => {
                const isActive = i === current;
                const isDone = i < current || extraDoneSet.has(i);
                const isLocked = isDone && lockedSet.has(i);
                const isClickable = !isLocked && !!onStepClick && clickableSet.has(i);
                const state: StepState = isActive ? "active" : isDone ? "done" : "upcoming";
                const rowClasses =
                  "flex w-full items-center gap-2 rounded-ds-control px-2 py-1.5 text-left text-[13px]";

                return (
                  <li key={i}>
                    {isClickable ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCompactOpen(false);
                          onStepClick(i);
                        }}
                        className={cn(
                          rowClasses,
                          "transition-colors duration-150 hover:bg-ds-fill-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent",
                        )}
                      >
                        <StepBadge state="done" n={i + 1} />
                        <span className="sr-only">Completed: </span>
                        <span className={stepLabelClass("done")}>{label}</span>
                      </button>
                    ) : (
                      <div
                        title={isLocked ? lockedTooltip : undefined}
                        aria-current={isActive ? "step" : undefined}
                        className={cn(rowClasses, isActive && "bg-ds-fill-muted")}
                      >
                        <StepBadge state={state} n={i + 1} />
                        {isDone && <span className="sr-only">Completed: </span>}
                        <span className={stepLabelClass(state)}>{label}</span>
                        {isLocked && (
                          <Lock className="ml-auto size-3 shrink-0 text-ds-ink-tertiary" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </PopoverContent>
        </Popover>
      </div>

      {/* Full track from 1200px up: a centered band of numbered steps (01-07)
          joined by hairline connectors, with a 2px terracotta underline + a
          terracotta number on the active step (editorial brand look, no circle
          bubbles). Fixed connectors + justify-center, never flex-1 — that keeps
          the band centered instead of clustered left. Ref: design-reference
          10-stepper-bar. */}
      <ol className="hidden items-center justify-center min-[1200px]:flex">
        {steps.map((label, i) => {
          const isActive = i === current;
          const isDone = i < current || extraDoneSet.has(i);
          const isLocked = isDone && lockedSet.has(i);
          const isClickable = !isLocked && !!onStepClick && clickableSet.has(i);
          const state: StepState = isActive ? "active" : isDone ? "done" : "upcoming";
          const num = String(i + 1).padStart(2, "0");
          const isLast = i === steps.length - 1;

          const content = (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-1.5",
                isActive ? "border-brand-terracotta" : "border-transparent",
              )}
            >
              <span className={cn("ds-tabular-nums text-[11px]", stepNumClass(state))}>{num}</span>
              {isDone && <span className="sr-only">Completed: </span>}
              <span className={stepLabelClass(state)}>{label}</span>
              {isLocked && (
                <Lock className="size-3 shrink-0 text-ds-ink-tertiary" aria-hidden="true" />
              )}
            </span>
          );

          return (
            <li key={i} className="flex items-center">
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(i)}
                  className="inline-flex items-center rounded-ds-chip transition-colors duration-150 hover:text-ds-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
                >
                  {content}
                </button>
              ) : isLocked && lockedTooltip ? (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        // Focusable so keyboard users can reach the locked-step tooltip (WCAG 1.4.13).
                        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                        tabIndex={0}
                        className="inline-flex cursor-default items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
                      >
                        {content}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[240px]">
                      {lockedTooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span
                  aria-current={isActive ? "step" : undefined}
                  className="inline-flex items-center"
                >
                  {content}
                </span>
              )}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-2 h-px w-4 shrink-0",
                    isDone ? "bg-ds-ink-tertiary" : "bg-ds-hairline",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Stepper };
