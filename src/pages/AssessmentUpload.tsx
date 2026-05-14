import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentUploader } from "@/components/prefill/DocumentUploader";
import { AnalyzeProgress } from "@/components/prefill/AnalyzeProgress";
import { usePrefillStore } from "@/stores/prefillStore";
import {
  useSessionDocuments, usePrefillJob, useStartAnalyze,
} from "@/hooks/usePrefill";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { useAssessmentSessionMeta } from "@/components/assessment/AssessmentShellContext";
import { useAssessmentSessionId } from "@/lib/assessment/useAssessmentSessionId";
import { ArrowRight } from "lucide-react";

export default function AssessmentUpload() {
  const sessionId = useAssessmentSessionId();
  const navigate = useNavigate();
  const store = usePrefillStore();
  const { taxpayerName: rawTaxpayerName } = useAssessmentSessionMeta();
  const taxpayerName = rawTaxpayerName ?? "the taxpayer";

  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);
  const startAnalyze = useStartAnalyze(sessionId);

  const [waiting, setWaiting] = useState(false);

  const locked = !!job?.locked_at;
  const allPendingUploaded = store.pendingFiles.every((p) => p.status === "uploaded" || p.status === "failed");
  const hasAtLeastOneUploaded = (docs?.length ?? 0) > 0;

  const handleContinue = () => {
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
      <div className="space-y-6 text-center">
        <div className="w-full max-w-xl mx-auto space-y-8">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              Preparing your assessment for
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              {taxpayerName}
            </h1>
            <div className="mx-auto h-px w-16 bg-primary/40" />
          </div>
          <p className="text-base text-muted-foreground leading-relaxed">
            Reading your documents to pre-fill answers where possible. The questions
            will open as soon as suggestions start arriving.
          </p>
          <AnalyzeProgress
            sessionId={sessionId}
            onContinue={() => navigate(`/assessment?session=${sessionId}`)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Upload supporting documents (optional)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documents are processed only for pre-fill extraction. They are not used for AI training.
          You can delete them anytime, and they are automatically removed after you generate the report.
        </p>
      </header>

      {!locked && (
        <Card className="p-4 bg-muted/40 text-sm">
          Supported formats: PDF, images (PNG/JPG/WEBP), Word (.docx), PowerPoint (.pptx), Excel (.xlsx), text/CSV/Markdown.
          Max 32 MB per file, 200 MB per session.
        </Card>
      )}

      <DocumentUploader sessionId={sessionId} locked={locked} />

      <AssessmentFooterSlot
        left={
          <Button
            variant="outline"
            onClick={() => navigate(`/assessment?session=${sessionId}`)}
            className="transition-all duration-fast"
          >
            {hasAtLeastOneUploaded ? 'Skip suggestions' : 'Skip'}
          </Button>
        }
        right={
          <Button
            onClick={handleContinue}
            disabled={!hasAtLeastOneUploaded || !allPendingUploaded}
            className="transition-all duration-fast"
          >
            Continue to questions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}
