import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Rough Opus 4.7 pricing (USD per million tokens). Update if Anthropic revises.
const OPUS_INPUT_PER_M = 15;
const OPUS_OUTPUT_PER_M = 75;

function estimateCostEUR(usage: { input_tokens?: number; output_tokens?: number } | null | undefined): string {
  if (!usage) return "—";
  const inp = ((usage.input_tokens ?? 0) / 1_000_000) * OPUS_INPUT_PER_M;
  const out = ((usage.output_tokens ?? 0) / 1_000_000) * OPUS_OUTPUT_PER_M;
  const usd = inp + out;
  const eur = usd * 0.93;
  return `€${eur.toFixed(2)}`;
}

export default function PrefillJobs() {
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-prefill-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_prefill_jobs")
        .select("id, session_id, status, started_at, stage2_finished_at, failed_at, total_token_usage, stage1_prompt_version, stage2_prompt_version")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Pre-Fill Jobs</h1>
      <div className="space-y-2">
        {data?.map((j) => {
          const durMs = j.stage2_finished_at && j.started_at
            ? new Date(j.stage2_finished_at).getTime() - new Date(j.started_at).getTime()
            : j.failed_at && j.started_at
              ? new Date(j.failed_at).getTime() - new Date(j.started_at).getTime()
              : null;
          return (
            <Card key={j.id}>
              <CardContent className="pt-4 text-sm flex justify-between items-center">
                <div>
                  <Link to={`/admin/sessions/${j.session_id}`} className="font-mono underline">
                    {j.session_id}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {j.started_at ? new Date(j.started_at).toLocaleString() : "—"}
                    {durMs != null && ` · ${Math.round(durMs / 1000)}s`}
                    {` · ${j.status}`}
                    {` · ${estimateCostEUR(j.total_token_usage as { input_tokens?: number; output_tokens?: number } | null)}`}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDetailJobId(j.id)}>Details</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {detailJobId && <JobDetailDrawer jobId={detailJobId} onClose={() => setDetailJobId(null)} />}
    </div>
  );
}

function JobDetailDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { data: job } = useQuery({
    queryKey: ["admin-prefill-job", jobId],
    queryFn: async () => {
      const { data } = await supabase.from("atad2_prefill_jobs").select("*").eq("id", jobId).single();
      return data;
    },
  });

  const { data: prefills } = useQuery({
    enabled: !!job?.session_id,
    queryKey: ["admin-prefill-rows", job?.session_id],
    queryFn: async () => {
      const { data } = await supabase.from("atad2_question_prefills").select("*").eq("session_id", job!.session_id);
      return data ?? [];
    },
  });

  const { data: summaries } = useQuery({
    enabled: !!job?.session_id,
    queryKey: ["admin-prefill-summaries", job?.session_id],
    queryFn: async () => {
      const { data: docs } = await supabase
        .from("atad2_session_documents")
        .select("id, doc_label").eq("session_id", job!.session_id);
      const ids = (docs ?? []).map((d) => d.id);
      if (ids.length === 0) return [];
      const { data: sums } = await supabase
        .from("atad2_document_summaries").select("document_id, summary_json, token_usage")
        .in("document_id", ids);
      return (sums ?? []).map((s) => ({ ...s, doc_label: docs?.find((d) => d.id === s.document_id)?.doc_label ?? "" }));
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>Job {jobId.slice(0, 8)}</DialogTitle></DialogHeader>
        <pre className="text-xs bg-muted p-3 rounded">{JSON.stringify(job, null, 2)}</pre>
        <h3 className="font-semibold mt-4">Document summaries</h3>
        {summaries?.map((s) => (
          <details key={s.document_id} className="text-xs">
            <summary className="cursor-pointer">{s.doc_label}</summary>
            <pre className="bg-muted p-2 mt-1">{JSON.stringify(s.summary_json, null, 2)}</pre>
          </details>
        ))}
        <h3 className="font-semibold mt-4">Question prefills</h3>
        {prefills?.map((p) => (
          <div key={p.id} className="border rounded p-2 text-xs">
            <div><strong>Q{p.question_id}</strong> · {p.user_action}</div>
            <div>{p.suggested_toelichting}</div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
