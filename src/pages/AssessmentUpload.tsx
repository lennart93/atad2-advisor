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
import { DocumentUploadStep } from "@/components/assessment/DocumentUploadStep";
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

  const handleContinueClick = () => {
    if (quality.tier === "good" && !wasDismissed()) {
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

  if (waiting) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reading your documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pre-filling answers where possible. The questions open as soon as suggestions start arriving.
          </p>
        </div>
        <AnalyzeProgress
          sessionId={sessionId}
          onContinue={() => navigate(`/assessment?session=${sessionId}`)}
        />
      </div>
    );
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
