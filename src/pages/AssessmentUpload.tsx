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
      <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background"
        />
        <div className="relative w-full max-w-xl text-center space-y-8">
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
          {hasAtLeastOneUploaded ? "Skip suggestions" : "Skip (no documents)"}
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
