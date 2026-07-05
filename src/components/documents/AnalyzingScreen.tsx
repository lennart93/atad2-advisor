import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, ProcessChecklist } from "@/components/ds";
import { WizardCard } from "@/components/assessment/WizardCard";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { AnalysisNarrative } from "@/components/prefill/AnalysisNarrative";
import type { AnalyzingStages } from "@/hooks/useAnalyzingStages";

export interface AnalyzingScreenProps {
  sessionId: string;
  stages: AnalyzingStages;
  taxpayerName: string | null;
  /** Escape hatch to the questionnaire on the failed/timeout paths. */
  onContinue: () => void;
}

/**
 * The single "Analyzing your documents" screen. One heading, one progress
 * bar, a vertical four-stage checklist (each row a spinner that flips to a
 * check), and one rotating status line. It never changes route: the same
 * screen carries the user from reading the documents through preparing the
 * points, and is then replaced in place by the points list.
 */
export function AnalyzingScreen({
  sessionId,
  stages,
  taxpayerName,
  onContinue,
}: AnalyzingScreenProps) {
  const { steps, pct, showEscape, statusDetail } = stages;

  // Hold the "grab a coffee" reassurance back for the first 10 seconds. A run
  // that finishes inside that window never earns the coffee tone, so flashing
  // it the instant analysis starts would read wrong. This gates only the
  // coffee aside below the card, not the live ticker: the ticker is the
  // running detail of the current step and belongs with the steps from the
  // start.
  const [showCoffee, setShowCoffee] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowCoffee(true), 10_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* The working cluster gets its own card so the coffee aside below can
          sit OUTSIDE it as a separate sibling. DocumentsWorklist no longer
          wraps this screen in a card, so there is a single terracotta frame. */}
      <WizardCard>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-normal leading-snug tracking-tight text-ds-ink">
              Analyzing your documents
            </h2>
            <p className="mt-1 text-[13px] text-ds-ink-secondary">
              What you uploaded is being read, and as much of the ATAD2 questionnaire
              as possible is being answered.
            </p>
          </div>

          {/* The progress sits directly on the wizard card, set off from the
              header by a single hairline (design-reference 13). */}
          <div className="space-y-4 border-t border-ds-hairline pt-6">
            <div className="space-y-1.5">
              <div
                role="progressbar"
                aria-label="Analysis progress"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full overflow-hidden rounded-full bg-ds-fill-muted"
              >
                <div
                  className="h-full rounded-full bg-ds-ink transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-right text-xs text-ds-ink-secondary ds-tabular-nums">
                {pct}%
              </p>
            </div>

            {/* Steps + live ticker are ONE cluster: the ticker is the running
                detail of the current step, so it sits indented directly under
                the steps list with no divider. Hidden once we hand over the
                escape, where a lively ticker would read wrong. */}
            <div>
              <ProcessChecklist steps={steps} />
              {!showEscape && (
                <AnalysisNarrative
                  sessionId={sessionId}
                  taxpayerName={taxpayerName}
                  phase="analyzing"
                  className="ml-[30px] mt-[14px] truncate text-[13px] italic text-ds-ink-secondary"
                />
              )}
            </div>

            {statusDetail && (
              <p className="text-[13px] text-ds-ink-secondary">{statusDetail}</p>
            )}
          </div>
        </div>
      </WizardCard>

      {/* The coffee wink is a SIBLING of the card, not a child: a quiet,
          centred, muted line that floats on the page below the card, set apart
          from the working cluster. Held back 10s and hidden on the escape. */}
      {!showEscape && showCoffee && (
        <div className="mt-[22px] flex animate-fade-in items-center justify-center gap-[11px]">
          <svg
            viewBox="0 0 32 32"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="flex-none text-ds-accent"
          >
            <path d="M5 14h17v5.5a6 6 0 0 1-6 6h-5a6 6 0 0 1-6-6z" />
            <path d="M22 15h2.6a3 3 0 0 1 0 6H22" />
            <path
              d="M10.5 9.5c0-1.4 1.1-1.9 1.1-3.1S10.5 4.6 10.5 3.3"
              className="origin-bottom animate-steam [transform-box:fill-box] motion-reduce:animate-none"
            />
            <path
              d="M16 9.5c0-1.4 1.1-1.9 1.1-3.1S16 4.6 16 3.3"
              className="origin-bottom animate-steam [animation-delay:1.2s] [transform-box:fill-box] motion-reduce:animate-none"
            />
          </svg>
          <p className="text-[13.5px] text-ds-ink-secondary">
            This usually runs a few minutes.{" "}
            <span className="font-medium text-ds-ink">Good moment for a coffee.</span>
          </p>
        </div>
      )}

      {showEscape && (
        <AssessmentFooterSlot
          right={
            <Button variant="primary" onClick={onContinue}>
              Continue to questionnaire anyway
              <ArrowRight />
            </Button>
          }
        />
      )}
    </>
  );
}
