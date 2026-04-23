import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
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

  const canStart = !locked &&
    hasAtLeastOneUploaded &&
    allPendingCategorized &&
    allPendingUploaded &&
    !startExtraction.isPending;

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

      <div className="flex gap-3">
        {!locked ? (
          <>
            <Button variant="outline" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
              Skip — no documents
            </Button>
            <Button disabled={!canStart} onClick={() => startExtraction.mutate()}>
              Start extraction
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
