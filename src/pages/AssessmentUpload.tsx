import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ds";
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
import { DocumentUploadStep } from "@/components/assessment/DocumentUploadStep";
import { WizardCard } from "@/components/assessment/WizardCard";
import { DocumentsWorklist } from "@/components/documents/DocumentsWorklist";
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
import { useAppendixPrewarm } from "@/hooks/useAppendixPrewarm";

export default function AssessmentUpload() {
  const sessionId = useAssessmentSessionId();
  const navigate = useNavigate();
  const store = usePrefillStore();

  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);
  const startAnalyze = useStartAnalyze(sessionId);

  // Start appendix/facts generation as early as possible (right after upload),
  // so the facts pass is usually done by the time the user reaches the
  // appendix step. The hook early-returns when sessionId is undefined.
  useAppendixPrewarm(sessionId);

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

  // Once the analysis has started (this visit or an earlier one), the page
  // becomes the worklist view: returning with a finished analysis lands on
  // the open points directly, never on the locked upload screen.
  const analysisStarted = waiting || locked;
  if (analysisStarted) {
    // No WizardCard here: each DocumentsWorklist phase owns its own card so
    // the analysis screen's coffee aside can sit outside (below) the card.
    return (
      <DocumentsWorklist
        sessionId={sessionId}
        onReviewQuestionnaire={() => navigate(`/assessment?session=${sessionId}`)}
      />
    );
  }

  return (
    <>
      <WizardCard>
        <DocumentUploadStep sessionId={sessionId} locked={locked} />
      </WizardCard>

      <AssessmentFooterSlot
        center={<DocumentQualityMeter docs={docs ?? []} />}
        right={
          <>
            {/* First step: no Previous, so the skip joins the dark primary on the
                right (the primary stays right-most), consistent with later steps. */}
            {hasAtLeastOneUploaded ? (
              <Button
                variant="secondary"
                onClick={() => {
                  void maybePrewarmPhaseA(sessionId);
                  navigate(`/assessment?session=${sessionId}`);
                }}
              >
                Skip to questionnaire
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary">
                    Skip
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Skip without uploading documents?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Documents like financial statements, tax returns, or previous
                      ATAD2 memos let the questionnaire be answered from the source.
                      Without them, every question is answered by hand.
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
            )}
            <Button
              variant="primary"
              onClick={handleContinueClick}
              disabled={!hasAtLeastOneUploaded || !allPendingUploaded}
            >
              Analyze documents
              <ArrowRight className="text-[#e0a48f]" />
            </Button>
          </>
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
    </>
  );
}
