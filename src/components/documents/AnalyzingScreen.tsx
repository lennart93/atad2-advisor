import { ArrowRight } from "lucide-react";
import { Button, Card, ProcessChecklist } from "@/components/ds";
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-medium leading-snug tracking-tight text-ds-ink">
          Analyzing your documents
        </h2>
        <p className="mt-1 text-[13px] text-ds-ink-secondary">
          What you uploaded is being read, and as much of the ATAD2 questionnaire
          as possible is being answered. Whatever can't be determined becomes a short
          list of points to confirm.
        </p>
      </div>

      <Card className="space-y-4 p-5">
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

        <ProcessChecklist steps={steps} />

        {/* One rotating status line; hidden once we hand the user the escape. */}
        {!showEscape && (
          <AnalysisNarrative
            sessionId={sessionId}
            taxpayerName={taxpayerName}
            phase="analyzing"
          />
        )}

        {statusDetail && (
          <p className="text-[13px] text-ds-ink-secondary">{statusDetail}</p>
        )}
      </Card>

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
    </div>
  );
}
