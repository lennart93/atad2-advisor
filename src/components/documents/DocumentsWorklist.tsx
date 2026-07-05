import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, Card } from "@/components/ds";
import { cn } from "@/lib/utils";
import { WizardCard } from "@/components/assessment/WizardCard";
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

  // The "you can come back later" balloon greets the advisor when the points
  // first appear, then tucks itself away after 8 seconds so it doesn't linger.
  // After that it only reappears while the pointer is over the Continue button
  // (the wrapper below), and fades out again on leave.
  const [balloonIntroDone, setBalloonIntroDone] = useState(false);
  const [balloonHovered, setBalloonHovered] = useState(false);
  // Only start the timer once the points screen is actually on-screen, so the
  // 8 seconds don't quietly elapse behind the analysis screen.
  const balloonOnScreen = hasRevealed && worklist.openPoints > 0;
  useEffect(() => {
    if (!balloonOnScreen) return;
    const timer = setTimeout(() => setBalloonIntroDone(true), 8000);
    return () => clearTimeout(timer);
  }, [balloonOnScreen]);

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
      <WizardCard>
        <div className="space-y-6">
          <Heading title="Points to confirm" sub={null} />
          <Card className="space-y-3 p-5">
            <p className="text-[13px] font-normal text-ds-ink">
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
                <ArrowRight className="text-brand-terracotta" />
              </Button>
            }
          />
        </div>
      </WizardCard>
    );
  }

  if (worklist.phase === "empty") {
    return (
      <WizardCard>
        <div className="space-y-6">
          <Heading
            title="Nothing left to confirm"
            sub="Your documents covered everything needed. You're ready for the questionnaire."
          />
          <AssessmentFooterSlot
            right={
              <Button variant="primary" onClick={onReviewQuestionnaire}>
                Continue to questionnaire
                <ArrowRight className="text-brand-terracotta" />
              </Button>
            }
          />
        </div>
      </WizardCard>
    );
  }

  // ---- the points list ----------------------------------------------------

  const allResolved = worklist.openPoints === 0;

  return (
    <WizardCard>
      <div className="space-y-6">
        <Heading
          title="Points to confirm"
          sub="Based on your documents, part of the questionnaire is already answered. The questions below are tailor-made from your documents to answer what is still open. They need input from you or the client. A separate set of questions is held back as probably not relevant (contingent)."
        />

        <WorklistPointsList worklist={worklist} />

        <AssessmentFooterSlot
          right={
            // The button keeps a fixed footprint: the reassurance line is lifted
            // out of the flow into an absolutely-positioned tooltip "cloud" above
            // the button, so showing or hiding it never changes the button (or the
            // footer bar) height.
            <div
              className="relative flex flex-col items-end"
              onMouseEnter={() => setBalloonHovered(true)}
              onMouseLeave={() => setBalloonHovered(false)}
            >
              {!allResolved && (
                <div
                  aria-hidden={balloonIntroDone && !balloonHovered}
                  className={cn(
                    "absolute bottom-[calc(100%+10px)] right-0 z-10 whitespace-nowrap rounded-ds-control border border-ds-hairline bg-ds-card px-3 py-1.5 text-[11px] text-ds-ink-secondary shadow-[0_6px_16px_-4px_rgba(22,21,15,0.18)] transition-opacity duration-300",
                    balloonIntroDone && !balloonHovered
                      ? "pointer-events-none opacity-0"
                      : "opacity-100",
                  )}
                >
                  You can come back to open points later.
                  {/* downward tail */}
                  <span
                    aria-hidden
                    className="absolute right-8 top-full size-2.5 -translate-y-1/2 rotate-45 border-b border-r border-ds-hairline bg-ds-card"
                  />
                </div>
              )}
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
                <ArrowRight className="text-brand-terracotta" />
              </Button>
            </div>
          }
        />
      </div>
    </WizardCard>
  );
}

function Heading({ title, sub }: { title: string; sub: string | null }) {
  return (
    <div>
      <h2 className="text-2xl font-normal leading-snug tracking-tight text-ds-ink">
        {title}
      </h2>
      {sub && <p className="mt-2 max-w-prose text-[15px] text-ds-ink-secondary">{sub}</p>}
    </div>
  );
}
