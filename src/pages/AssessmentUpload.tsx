import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentUploader } from "@/components/prefill/DocumentUploader";
import { ExtractionProgress } from "@/components/prefill/ExtractionProgress";
import { usePrefillStore } from "@/stores/prefillStore";
import {
  useSessionDocuments, usePrefillJob, useStartExtraction,
} from "@/hooks/usePrefill";

export default function AssessmentUpload() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const navigate = useNavigate();
  const store = usePrefillStore();

  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);
  const startExtraction = useStartExtraction(sessionId);

  const locked = !!job?.locked_at;
  const allPendingCategorized = store.pendingFiles.every((p) => !!p.category);
  const allPendingUploaded = store.pendingFiles.every((p) => p.status === "uploaded" || p.status === "failed");
  const hasAtLeastOneUploaded = (docs?.length ?? 0) > 0;
  const anyRemoteSummarizing = (docs ?? []).some((d) => d.status === "summarizing" || d.status === "uploaded");
  const allRemoteDocsTerminal = (docs ?? []).every(
    (d) => d.status === "summarized" || d.status === "failed"
  );

  // Smart Start: if Stage 1 is still processing, defer the click and
  // auto-fire extract once all docs reach a terminal state. Avoids the
  // "click → 500 'still processing' → retry" loop.
  const [pendingStartExtraction, setPendingStartExtraction] = useState(false);

  const canStart = !locked &&
    hasAtLeastOneUploaded &&
    allPendingCategorized &&
    allPendingUploaded &&
    !startExtraction.isPending &&
    !pendingStartExtraction;

  const handleStartClick = () => {
    if (allRemoteDocsTerminal && hasAtLeastOneUploaded) {
      startExtraction.mutate();
    } else {
      setPendingStartExtraction(true);
    }
  };

  // When the user clicked Start before Stage 1 finished, fire extract as
  // soon as every server-side doc has settled.
  useEffect(() => {
    if (pendingStartExtraction && allRemoteDocsTerminal && hasAtLeastOneUploaded) {
      setPendingStartExtraction(false);
      startExtraction.mutate();
    }
  }, [pendingStartExtraction, allRemoteDocsTerminal, hasAtLeastOneUploaded, startExtraction]);

  // Clear any leftover pending files from a previous session as soon as we
  // mount for a new session. Remote docs are already session-scoped via
  // React Query key, but pendingFiles is plain client state and leaks otherwise.
  useEffect(() => {
    store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (job?.status === "completed" && sessionStorage.getItem("atad2_upload_wait") === "1") {
      sessionStorage.removeItem("atad2_upload_wait");
      navigate(`/assessment?session=${sessionId}`);
    }
  }, [job?.status, navigate, sessionId]);

  if (!sessionId) return <div className="p-8">Missing session.</div>;

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

      {locked && <ExtractionProgress sessionId={sessionId} />}

      {!locked && hasAtLeastOneUploaded && (
        <p className="text-xs text-muted-foreground">
          Processing typically takes 10–30 seconds per document. Larger or image-heavy PDFs can take up to a minute.
          {anyRemoteSummarizing && " Please wait for the spinner to finish before starting extraction."}
        </p>
      )}

      <div className="flex gap-3">
        {!locked ? (
          <>
            <Button variant="outline" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
              Skip — no documents
            </Button>
            <Button disabled={!canStart && !pendingStartExtraction} onClick={handleStartClick}>
              {pendingStartExtraction
                ? "Waiting for analysis to finish…"
                : anyRemoteSummarizing
                  ? "Start extraction (analysis still running…)"
                  : "Start extraction"}
            </Button>
          </>
        ) : job?.status === "stage2_running" || job?.status === "stage1_running" ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                sessionStorage.removeItem("atad2_upload_wait");
                navigate(`/assessment?session=${sessionId}`);
              }}
            >
              Start assessment now
            </Button>
            <Button
              disabled={job?.status !== "stage2_running"}
              onClick={() => sessionStorage.setItem("atad2_upload_wait", "1")}
            >
              Wait for full pre-fill
            </Button>
          </>
        ) : job?.status === "completed" ? (
          <Button onClick={() => navigate(`/assessment?session=${sessionId}`)}>
            Start assessment
          </Button>
        ) : job?.status === "failed" ? (
          <>
            <Button variant="outline" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
              Skip suggestions
            </Button>
            <Button onClick={() => startExtraction.mutate()}>Retry extraction</Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
