// src/components/assessment/AssessmentStepper.tsx
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ASSESSMENT_STEPS } from '@/lib/assessment/steps';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AssessmentStepper({
  current,
  extraDone,
  onStepClick,
  lockedTooltip,
  lockedIndexes,
}: {
  current: number;
  /** Step indexes that should be rendered as completed regardless of `current`.
   *  Used when editing a finalized step from a later view (e.g. editing the
   *  structure chart from the Overview — Overview itself stays marked done). */
  extraDone?: number[];
  /** If provided, completed steps become buttons that call this with their index.
   *  Parent decides which indexes are actually navigable. */
  onStepClick?: (index: number) => void;
  /** Hover text shown on the done, non-clickable steps listed in `lockedIndexes`.
   *  Used from the finalized Overview to signal earlier steps can't be revisited. */
  lockedTooltip?: string;
  lockedIndexes?: number[];
}) {
  const extraDoneSet = extraDone ? new Set(extraDone) : null;
  const lockedSet = lockedIndexes ? new Set(lockedIndexes) : null;
  return (
    <ol className="flex w-full items-center" aria-label="Assessment progress">
      {ASSESSMENT_STEPS.map((step, i) => {
        const isDone = i < current || (extraDoneSet?.has(i) ?? false);
        const isActive = i === current;
        const isLast = i === ASSESSMENT_STEPS.length - 1;
        const num = i + 1;

        return (
          <li
            key={step.key}
            className={cn('flex items-center', !isLast && 'flex-1')}
          >
            <div className="shrink-0">
              {isActive ? (
                <div
                  aria-current="step"
                  className={cn(
                    'inline-flex items-center gap-2.5 rounded-full bg-foreground py-2 pl-2 pr-4',
                    'text-[13px] font-semibold leading-none tracking-[-0.01em] text-background whitespace-nowrap',
                    'ring-4 ring-foreground/[0.06]',
                    'shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_1px_2px_rgb(0_0_0/0.15)]',
                    'transition-all duration-normal ease-emphasized',
                  )}
                >
                  <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-background font-mono text-[11px] font-semibold leading-none tabular-nums text-foreground">
                    {num}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              ) : isDone ? (
                onStepClick && extraDoneSet?.has(i) ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(i)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-2.5 py-1.5',
                      'text-[13px] font-medium leading-none tracking-[-0.01em] text-foreground whitespace-nowrap',
                      'transition-colors duration-fast ease-emphasized',
                      'hover:bg-muted cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
                    )}
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center text-foreground">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                ) : lockedTooltip && lockedSet?.has(i) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        tabIndex={0}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full px-2.5 py-1.5',
                          'text-[13px] font-medium leading-none tracking-[-0.01em] text-foreground whitespace-nowrap',
                          'transition-colors duration-fast ease-emphasized',
                          'cursor-default hover:bg-muted',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
                        )}
                      >
                        <span className="inline-flex h-4 w-4 items-center justify-center text-foreground">
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </span>
                        <span className="hidden sm:inline">{step.label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[240px] text-center">
                      {lockedTooltip}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-2.5 py-1.5',
                      'text-[13px] font-medium leading-none tracking-[-0.01em] text-foreground whitespace-nowrap',
                      'transition-colors duration-fast ease-emphasized',
                      'hover:bg-muted',
                    )}
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center text-foreground">
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </div>
                )
              ) : (
                <div
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-2.5 py-1.5',
                    'text-[13px] font-medium leading-none tracking-[-0.01em] whitespace-nowrap',
                    'text-muted-foreground opacity-70',
                  )}
                >
                  <span className="inline-flex w-4 justify-center font-mono text-[11px] font-medium leading-none tabular-nums text-muted-foreground">
                    {num}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              )}
            </div>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  'mx-1.5 h-px min-w-[16px] flex-1 sm:min-w-[24px]',
                  isDone ? 'bg-foreground' : 'bg-foreground/[0.08]',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
