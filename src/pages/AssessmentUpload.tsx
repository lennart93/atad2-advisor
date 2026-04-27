import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentUploader } from "@/components/prefill/DocumentUploader";
import { ExtractionProgress } from "@/components/prefill/ExtractionProgress";
import { usePrefillStore } from "@/stores/prefillStore";
import {
  useSessionDocuments, usePrefillJob,
} from "@/hooks/usePrefill";

export default function AssessmentUpload() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const navigate = useNavigate();
  const store = usePrefillStore();

  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);

  const [waiting, setWaiting] = useState(false);

  const locked = !!job?.locked_at;
  const allPendingCategorized = store.pendingFiles.every((p) => !!p.category);
  const allPendingUploaded = store.pendingFiles.every((p) => p.status === "uploaded" || p.status === "failed");
  const hasAtLeastOneUploaded = (docs?.length ?? 0) > 0;

  // Clear any leftover pending files from a previous session as soon as we
  // mount for a new session. Remote docs are already session-scoped via
  // React Query key, but pendingFiles is plain client state and leaks otherwise.
  useEffect(() => {
    store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Auto-navigate when extraction job completes while we're in the wait state.
  useEffect(() => {
    if (waiting && job?.status === "completed") {
      navigate(`/assessment?session=${sessionId}`);
    }
  }, [waiting, job?.status, navigate, sessionId]);

  if (!sessionId) return <div className="p-8">Missing session.</div>;

  if (waiting) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Analysing your documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We are reading your documents and preparing context suggestions for the assessment questions.
            This typically takes 30 to 90 seconds. The questions will open automatically when ready —
            you can also continue early below.
          </p>
        </header>

        <ExtractionProgress sessionId={sessionId} />

        <Button variant="outline" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
          Continue to questions now
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Upload supporting documents (optional)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documents are processed only for pre-fill extraction. They are not used for AI training.
          You can delete them anytime, and they are automatically removed when you generate the report.
        </p>
      </header>

      {!locked && (
        <Card className="p-4 bg-muted/40 text-sm">
          Supported formats: PDF, images (PNG/JPG/WEBP), Word (.docx), PowerPoint (.pptx), Excel (.xlsx), text/CSV/Markdown.
          Max 32 MB per file, 200 MB per session.
        </Card>
      )}

      <DocumentUploader sessionId={sessionId} locked={locked} />

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
          {hasAtLeastOneUploaded ? "Skip suggestions" : "Skip — no documents"}
        </Button>
        <Button
          disabled={
            !hasAtLeastOneUploaded ||
            !allPendingCategorized ||
            !allPendingUploaded
          }
          onClick={() => {
            // Switch to the wait screen so the user sees explicit progress
            // while Stage 1 + Stage 2 finish in the background. The wait
            // screen auto-navigates to /assessment when job.status === 'completed'.
            setWaiting(true);
          }}
        >
          Continue to questions
        </Button>
      </div>
    </div>
  );
}
