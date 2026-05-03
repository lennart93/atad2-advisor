import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentUploader } from "@/components/prefill/DocumentUploader";
import { AnalyzeProgress } from "@/components/prefill/AnalyzeProgress";
import { usePrefillStore } from "@/stores/prefillStore";
import { supabase } from "@/integrations/supabase/client";
import {
  useSessionDocuments, usePrefillJob, useStartAnalyze,
} from "@/hooks/usePrefill";

export default function AssessmentUpload() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const navigate = useNavigate();
  const store = usePrefillStore();

  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);
  const startAnalyze = useStartAnalyze(sessionId);

  const { data: sessionRow } = useQuery({
    enabled: !!sessionId,
    queryKey: ["session-info", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("atad2_sessions")
        .select("taxpayer_name")
        .eq("session_id", sessionId!)
        .maybeSingle();
      return data;
    },
  });
  const taxpayerName = sessionRow?.taxpayer_name?.trim() || "the taxpayer";

  const [waiting, setWaiting] = useState(false);

  const locked = !!job?.locked_at;
  const allPendingUploaded = store.pendingFiles.every((p) => p.status === "uploaded" || p.status === "failed");
  const hasAtLeastOneUploaded = (docs?.length ?? 0) > 0;
  const uncategorizedCount = (docs ?? []).filter((d) => !d.category).length;

  const handleContinue = () => {
    if (uncategorizedCount > 0) {
      const ok = window.confirm(
        `${uncategorizedCount} document${uncategorizedCount === 1 ? "" : "s"} ${uncategorizedCount === 1 ? "is" : "are"} missing a category. Suggestions will be slightly less targeted. Continue anyway?`
      );
      if (!ok) return;
    }
    // Fire the swarm. The wait state shows progress and either auto-
    // navigates on completion, or the user can click the skip link.
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
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">One moment — preparing your assessment</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Next you will work through a series of questions to determine whether ATAD2
            applies to <span className="font-medium text-foreground">{taxpayerName}</span>.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            We are now reading the documents you uploaded to see whether we can pre-fill
            answers for some of those questions. You can wait for this to complete or
            jump straight into the questionnaire — suggestions will appear inline as
            they become available.
          </p>
        </header>
        <AnalyzeProgress
          sessionId={sessionId}
          onComplete={() => navigate(`/assessment?session=${sessionId}`)}
          onSkip={() => navigate(`/assessment?session=${sessionId}`)}
        />
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
          disabled={!hasAtLeastOneUploaded || !allPendingUploaded}
          onClick={handleContinue}
        >
          Continue to questions
        </Button>
      </div>
    </div>
  );
}
