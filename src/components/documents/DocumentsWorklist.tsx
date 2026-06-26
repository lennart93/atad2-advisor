import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, Card } from "@/components/ds";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { useDocumentsWorklist } from "@/hooks/useDocumentsWorklist";
import { useAnalyzingStages } from "@/hooks/useAnalyzingStages";
import { AnalyzingScreen } from "./AnalyzingScreen";
import { WorklistPointsList } from "./WorklistPointsList";

export interface DocumentsWorklistProps {
  sessionId: string;
  /** Navigates to the questionnaire (the user clicks, never auto-advance). */
  onReviewQuestionnaire: () => void;
}

/**
 * The "Points to confirm" screen. After the unified analysis, the user gets a
 * short list of points the documents could not answer. For each, they type
 * what they know (facts, not conclusions); the AI turns that into the right
 * questionnaire answers as soon as it is saved. Points the advisor would
 * rather ask the client are selected with the per-card checkbox and copied as
 * a ready-to-send list. There is no separate submit: a Continue button leads
 * to the questionnaire whenever the advisor is ready, open points and all.
 * The analysis and this screen are one continuous step, so the loading view
 * renders here in place rather than on a separate route.
 */
export function DocumentsWorklist({
  sessionId,
  onReviewQuestionnaire,
}: DocumentsWorklistProps) {
  const worklist = useDocumentsWorklist(sessionId);
  // "Points not ready yet" (loading or composing) keeps the single analysis
  // screen up, so the user never sees a second loading screen. The hook only
  // advances to stage 4 once the documents are actually read, so a pre-settle
  // worklist can't jump the bar forward before reading has started.
  const stages = useAnalyzingStages(
    sessionId,
    worklist.phase === "composing" || worklist.phase === "loading",
  );

  // Once the points have been shown, never swap back to the loading screen. A
  // save triggers refetches that can briefly flip the worklist through a
  // settling phase; without this latch that would bounce the whole screen back
  // to "Analyzing your documents" mid-answer. The per-card "Working it out..."
  // state covers the in-progress save instead.
  const [hasRevealed, setHasRevealed] = useState(false);
  useEffect(() => {
    if (!stages.analyzing) setHasRevealed(true);
  }, [stages.analyzing]);

  // ---- the single analysis screen (reading -> preparing points) ----------

  if (stages.analyzing && !hasRevealed) {
    return (
      <AnalyzingScreen
        sessionId={sessionId}
        stages={stages}
        taxpayerName={worklist.taxpayerName}
        onContinue={onReviewQuestionnaire}
      />
    );
  }

  if (worklist.phase === "error") {
    return (
      <div className="space-y-6">
        <Heading title="Points to confirm" sub={null} />
        <Card className="space-y-3 p-5">
          <p className="text-[13px] font-medium text-ds-ink">
            Your points couldn't be prepared.
          </p>
          {worklist.composeError?.message && (
            <p className="text-[13px] text-ds-ink-secondary">
              {worklist.composeError.message}
            </p>
          )}
          <p className="text-[13px] text-ds-ink-secondary">
            You can try again, or continue to the questionnaire and pick up the
            open points there.
          </p>
          <Button variant="secondary" onClick={worklist.recompose}>
            Try again
          </Button>
        </Card>
        <AssessmentFooterSlot
          right={
            <Button variant="primary" onClick={onReviewQuestionnaire}>
              Continue to questionnaire
              <ArrowRight />
            </Button>
          }
        />
      </div>
    );
  }

  if (worklist.phase === "empty") {
    return (
      <div className="space-y-6">
        <Heading
          title="Nothing left to confirm"
          sub="Your documents covered everything needed. You're ready for the questionnaire."
        />
        <AssessmentFooterSlot
          right={
            <Button variant="primary" onClick={onReviewQuestionnaire}>
              Continue to questionnaire
              <ArrowRight />
            </Button>
          }
        />
      </div>
    );
  }

  // ---- the points list ----------------------------------------------------

  const allResolved = worklist.openPoints === 0;

  return (
    <div className="space-y-6">
      <Heading title="Points to confirm" sub={null} />

      <WorklistPointsList worklist={worklist} />

      <AssessmentFooterSlot
        right={
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="primary"
              className="h-auto min-h-[2.25rem] py-1.5"
              onClick={onReviewQuestionnaire}
            >
              <span className="flex flex-col items-start leading-tight">
                <span>Continue to questionnaire</span>
                {!allResolved && (
                  <span className="text-[11px] font-normal opacity-80 ds-tabular-nums">
                    {worklist.openPoints === 1
                      ? "1 point still open"
                      : `${worklist.openPoints} points still open`}
                  </span>
                )}
              </span>
              <ArrowRight />
            </Button>
            {!allResolved && (
              <span className="text-[11px] text-ds-ink-secondary">
                You can come back to open points later.
              </span>
            )}
          </div>
        }
      />
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: string | null }) {
  return (
    <div>
      <h2 className="text-[18px] font-medium leading-snug tracking-tight text-ds-ink">
        {title}
      </h2>
      {sub && <p className="mt-1 text-[13px] text-ds-ink-secondary">{sub}</p>}
    </div>
  );
}
