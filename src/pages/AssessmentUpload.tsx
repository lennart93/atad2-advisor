import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentUploader } from "@/components/prefill/DocumentUploader";
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

      {hasAtLeastOneUploaded && (
        <p className="text-xs text-muted-foreground">
          We continue analysing your documents in the background while you answer questions.
          Suggestions will appear automatically as they become available.
        </p>
      )}

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
            // Navigate immediately. Stage 2 fires automatically server-side
            // once Stage 1 has finished for every uploaded doc.
            navigate(`/assessment?session=${sessionId}`);
          }}
        >
          Continue to questions
        </Button>
      </div>
    </div>
  );
}
