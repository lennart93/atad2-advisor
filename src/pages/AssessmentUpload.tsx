import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AnalyzeProgress } from "@/components/prefill/AnalyzeProgress";
import { AnalysisNarrative } from "@/components/prefill/AnalysisNarrative";
import { ClientLetterBlock } from "@/components/openQuestions/ClientLetterBlock";
import { DocumentUploadStep } from "@/components/assessment/DocumentUploadStep";
import { Card } from "@/components/ui/card";
import { useLetterPipeline } from "@/hooks/useLetterPipeline";
import { formatAsOfLine } from "@/lib/openQuestions/letterShape";
import { usePrefillStore } from "@/stores/prefillStore";
import {
  useSessionDocuments, usePrefillJob, useStartAnalyze,
} from "@/hooks/usePrefill";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { useAssessmentSessionId } from "@/lib/assessment/useAssessmentSessionId";
import { ArrowRight } from "lucide-react";
import { maybePrewarmPhaseA } from "@/lib/structure/phaseAPrewarm";
import { DocumentQualityMeter } from "@/components/prefill/DocumentQualityMeter";
import { LowQualityGateDialog } from "@/components/prefill/LowQualityGateDialog";
import { computeQuality } from "@/lib/prefill/qualityMeter";

export default function AssessmentUpload() {
  const sessionId = useAssessmentSessionId();
  const navigate = useNavigate();
  const store = usePrefillStore();

  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);
  const startAnalyze = useStartAnalyze(sessionId);

  const [waiting, setWaiting] = useState(false);

  const locked = !!job?.locked_at;
  const allPendingUploaded = store.pendingFiles.every((p) => p.status === "uploaded" || p.status === "failed");
  const hasAtLeastOneUploaded = (docs?.length ?? 0) > 0;

  const quality = computeQuality(docs ?? []);
  const [gateOpen, setGateOpen] = useState(false);

  // Per-session dismissal — once the user clicks "Run pre-fill anyway" we
  // don't nag again until they upload something new or change a category.
  const dismissKey = `quality-gate-dismissed:${sessionId}`;
  const wasDismissed = () => sessionStorage.getItem(dismissKey) === String(quality.distinctCategories.length);

  // If the user already uploaded 2+ real documents, they've made enough
  // effort that we shouldn't nag them — even if one is categorised "other".
  const nonThinDocCount = (docs ?? []).filter((d) => !d.is_thin).length;

  const handleContinueClick = () => {
    if (quality.tier === "good" && nonThinDocCount < 2 && !wasDismissed()) {
      setGateOpen(true);
      return;
    }
    handleContinue();
  };

  const confirmFromGate = () => {
    sessionStorage.setItem(dismissKey, String(quality.distinctCategories.length));
    setGateOpen(false);
    handleContinue();
  };

  const handleContinue = () => {
    void maybePrewarmPhaseA(sessionId);
    startAnalyze.mutate(undefined, {
      onError: (e) => console.warn("[continue] analyze dispatch failed", e),
    });
    setWaiting(true);
  };

  useEffect(() => {
    store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!sessionId) return <div className="p-8">Missing session.</div>;

  // Once the analysis has started (this visit or an earlier one), the page is
  // the letter-first view: returning with a finished analysis lands on the
  // letter directly, never on the locked upload screen.
  const analysisStarted = waiting || locked;
  if (analysisStarted) {
    return <LetterFirstAnalysis sessionId={sessionId} />;
  }

  return (
    <div className="space-y-6">
      <DocumentUploadStep sessionId={sessionId} locked={locked} />

      <AssessmentFooterSlot
        left={
          hasAtLeastOneUploaded ? (
            <Button
              variant="outline"
              onClick={() => {
                void maybePrewarmPhaseA(sessionId);
                navigate(`/assessment?session=${sessionId}`);
              }}
              className="transition-all duration-fast"
            >
              Skip suggestions
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="transition-all duration-fast">
                  Skip
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Skip without uploading documents?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Uploading documents like financial statements, tax returns, or
                    previous ATAD2 memos significantly helps you complete the
                    assessment. Are you sure you want to continue without uploading?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => navigate(`/assessment?session=${sessionId}`)}
                  >
                    Continue without documents
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }
        center={<DocumentQualityMeter docs={docs ?? []} />}
        right={
          <Button
            onClick={handleContinueClick}
            disabled={!hasAtLeastOneUploaded || !allPendingUploaded}
            className="transition-all duration-fast"
          >
            Continue to questions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      />
      <LowQualityGateDialog
        open={gateOpen}
        onOpenChange={setGateOpen}
        tier={quality.tier}
        currentCategories={quality.distinctCategories}
        missingTypes={quality.missingTypes}
        onConfirm={confirmFromGate}
      />
    </div>
  );
}

/**
 * The letter-first analysis view: a calm working screen (progress card plus
 * exactly one rotating narrative line) that ends in the composed client
 * letter rendered inline. The pipeline hook owns all sequencing; this
 * component only maps its phase to what is on screen. AnalyzeProgress stays
 * mounted in every phase: it owns the failed/timeout paths and the footer
 * "Start questions" navigation that every end state reuses.
 */
function LetterFirstAnalysis({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const { data: job } = usePrefillJob(sessionId);
  const {
    phase,
    error,
    letter,
    composedAt,
    sentRows,
    addedQuestionIds,
    candidateRows,
    resolveText,
    sessionMeta,
    composeBusy,
    regenerate,
    retry,
  } = useLetterPipeline(sessionId);

  const working =
    phase === "analyzing" || phase === "wording" || phase === "composing";

  const heading = working
    ? {
        title: "Reading your documents",
        sub: "Pre-filling answers where possible. We will draft the client letter when the analysis is done.",
      }
    : phase === "letter"
      ? {
          title: "Client letter",
          sub: "Questions the documents could not answer, ready to send to the client.",
        }
      : phase === "empty"
        ? { title: "All covered", sub: null }
        : { title: "Client letter", sub: null };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{heading.title}</h2>
        {heading.sub && (
          <p className="mt-1 text-sm text-muted-foreground">{heading.sub}</p>
        )}
      </div>

      <AnalyzeProgress
        sessionId={sessionId}
        onContinue={() => navigate(`/assessment?session=${sessionId}`)}
        asOfLine={composedAt ? formatAsOfLine(composedAt) : null}
      />

      {working && job?.status !== "failed" && (
        <AnalysisNarrative
          sessionId={sessionId}
          taxpayerName={sessionMeta?.taxpayer_name ?? null}
          phase={
            phase === "wording"
              ? "wording"
              : phase === "composing"
                ? "composing"
                : "analyzing"
          }
        />
      )}

      {phase === "letter" && letter && (
        <ClientLetterBlock
          sessionId={sessionId}
          letter={letter}
          sentRows={sentRows}
          addedQuestionIds={addedQuestionIds}
          candidateRows={candidateRows}
          resolveText={resolveText}
          busy={composeBusy}
          onRegenerate={regenerate}
          sessionMeta={sessionMeta}
        />
      )}

      {phase === "empty" && (
        <Card className="p-5">
          <p className="text-sm text-foreground">
            No client questions; the documents covered everything we needed.
          </p>
        </Card>
      )}

      {phase === "error" &&
        (error?.notDeployed ? (
          <p className="text-sm text-muted-foreground">
            Letter composition is not deployed yet.
          </p>
        ) : (
          <Card className="space-y-3 p-5">
            <p className="text-sm font-medium tracking-tight">
              We could not finish the client letter.
            </p>
            {error?.message && (
              <p className="text-xs text-muted-foreground">{error.message}</p>
            )}
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </Card>
        ))}
    </div>
  );
}
