import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessStep } from '@/components/ds';

/**
 * The appendix "Preparing" state, as an on-brand wizard card instead of bare
 * centred text: terracotta letterhead, an indeterminate sweep bar, and one
 * status row per real pipeline step (Done / Working / Waiting). The steps are
 * passed in so the card never invents work that is not happening.
 */
export function AppendixLoadingCard({
  partLabel,
  steps,
  title = 'Preparing the appendix',
  description = 'The entity register is being assembled and the appendix sections drafted from the documents and answers. You can stay on this page.',
}: {
  /** "Part A" / "Part B", to match the section the advisor is heading for. */
  partLabel: string;
  steps: ProcessStep[];
  /** Override for the sync-with-answers wait state ("Processing your answers"). */
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex justify-center py-16">
      {/* role=status: step changes (Waiting -> Working -> Done) are announced politely. */}
      <div role="status" className="w-full max-w-[480px] rounded-[3px] border border-ds-hairline border-t-[3px] border-t-ds-accent bg-ds-card px-10 pb-[34px] pt-[38px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Appendix · {partLabel}
        </p>
        <h1 className="mt-2 text-[23px] font-normal tracking-tight text-ds-ink">
          {title}
        </h1>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-ds-ink-secondary">
          {description}
        </p>

        {/* Indeterminate progress: a terracotta glint travelling the track. */}
        <div className="relative mt-6 h-[3px] overflow-hidden rounded-[2px] bg-[#efeae1]">
          <span className="absolute top-0 h-full w-2/5 rounded-[2px] bg-gradient-to-r from-transparent via-ds-accent to-transparent animate-sweep motion-reduce:hidden" />
        </div>

        {/* One row per real step, separated by hairlines. */}
        <div className="mt-6">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-3 border-t border-ds-hairline py-3 first:border-t-0"
            >
              <StepIcon status={step.status} />
              <span
                className={cn(
                  'flex-1 text-[14px]',
                  step.status === 'pending' ? 'text-ds-ink-tertiary' : 'text-ds-ink',
                )}
              >
                {step.label}
              </span>
              <StepTag status={step.status} />
            </div>
          ))}
        </div>

        <p className="mt-5 flex items-center gap-1.5 text-[13px] text-ds-ink-secondary">
          <Clock className="h-3.5 w-3.5" strokeWidth={1.7} />
          This can take a few minutes.
        </p>
      </div>
    </div>
  );
}

function StepIcon({ status }: { status: ProcessStep['status'] }) {
  if (status === 'done') {
    return (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ds-green-bg">
        <Check className="h-[13px] w-[13px] text-ds-green" strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'current') {
    return (
      <span
        aria-hidden
        className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-[#ecd8cf] border-t-ds-accent motion-safe:animate-spin"
      />
    );
  }
  // pending (and the never-reached error state) read as a hollow faint circle.
  return <span aria-hidden className="h-[22px] w-[22px] shrink-0 rounded-full border border-ds-ink-tertiary" />;
}

function StepTag({ status }: { status: ProcessStep['status'] }) {
  if (status === 'done') {
    return <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ds-green">Done</span>;
  }
  if (status === 'current') {
    return (
      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ds-accent motion-safe:animate-pulse">
        Working
      </span>
    );
  }
  return <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-ds-ink-tertiary">Waiting</span>;
}
