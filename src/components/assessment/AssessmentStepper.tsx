// src/components/assessment/AssessmentStepper.tsx
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ASSESSMENT_STEPS } from '@/lib/assessment/steps';

export function AssessmentStepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Assessment progress">
      {ASSESSMENT_STEPS.map((step, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-fast',
                isActive && 'bg-primary text-primary-foreground',
                isDone && 'text-foreground',
                !isActive && !isDone && 'text-muted-foreground',
              )}
              aria-current={isActive ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-mono',
                  isActive && 'border-primary-foreground/40',
                  isDone && 'border-foreground bg-foreground text-background',
                  !isActive && !isDone && 'border-[hsl(var(--border-default))]',
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < ASSESSMENT_STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'h-px w-4 sm:w-6',
                  i < current ? 'bg-foreground' : 'bg-[hsl(var(--border-default))]',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
