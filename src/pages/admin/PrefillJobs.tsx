import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminCard } from "@/components/admin/AdminCard";

// Rough Opus 4.7 pricing (USD per million tokens). Update if Anthropic revises.
const OPUS_INPUT_PER_M = 15;
const OPUS_OUTPUT_PER_M = 75;

function estimateCostEUR(usage: { input_tokens?: number; output_tokens?: number } | null | undefined): string {
  if (!usage) return "-";
  const inp = ((usage.input_tokens ?? 0) / 1_000_000) * OPUS_INPUT_PER_M;
  const out = ((usage.output_tokens ?? 0) / 1_000_000) * OPUS_OUTPUT_PER_M;
  const usd = inp + out;
  const eur = usd * 0.93;
  return `€${eur.toFixed(2)}`;
}

export default function PrefillJobs() {
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
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
    <main>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Admin</div>
          <h1 className="text-2xl font-medium tracking-tight">Pre-Fill Jobs</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-destructive/40 bg-destructive/10 text-destructive text-xs font-mono p-3 rounded-md whitespace-pre-wrap">
          {error instanceof Error ? `${error.name}: ${error.message}` : String(error)}
        </div>
      )}

      <AdminCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Session</th>
              <th className="text-left px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Started</th>
              <th className="text-left px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Duration</th>
              <th className="text-left px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Status</th>
              <th className="text-left px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Cost</th>
              <th className="text-right px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No pre-fill jobs yet.
                </td>
              </tr>
            )}
            {data?.map((j) => {
              const durMs = j.stage2_finished_at && j.started_at
                ? new Date(j.stage2_finished_at).getTime() - new Date(j.started_at).getTime()
                : j.failed_at && j.started_at
                  ? new Date(j.failed_at).getTime() - new Date(j.started_at).getTime()
                  : null;
              return (
                <tr
                  key={j.id}
                  className="border-t border-border hover:bg-muted/30 transition-colors duration-fast"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/admin/sessions/${j.session_id}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {j.session_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {j.started_at ? new Date(j.started_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {durMs != null ? `${Math.round(durMs / 1000)}s` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{j.status}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {estimateCostEUR(j.total_token_usage as { input_tokens?: number; output_tokens?: number } | null)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="outline" onClick={() => setDetailJobId(j.id)}>Details</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AdminCard>

      {detailJobId && <JobDetailDrawer jobId={detailJobId} onClose={() => setDetailJobId(null)} />}
    </main>
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
        <DialogHeader>
          <DialogTitle className="font-mono text-base">Job {jobId.slice(0, 8)}</DialogTitle>
        </DialogHeader>
        <pre className="text-xs font-mono bg-muted/40 border border-border p-3 rounded-md">{JSON.stringify(job, null, 2)}</pre>
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium mt-4 mb-2">Document summaries</h3>
        {summaries?.map((s) => (
          <details key={s.document_id} className="text-xs">
            <summary className="cursor-pointer hover:text-foreground transition-colors duration-fast">{s.doc_label}</summary>
            <pre className="bg-muted/40 border border-border p-2 mt-1 font-mono rounded-md">{JSON.stringify(s.summary_json, null, 2)}</pre>
          </details>
        ))}
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium mt-4 mb-2">Question prefills</h3>
        <div className="space-y-1.5">
          {prefills?.map((p) => (
            <div key={p.id} className="border border-border rounded-md p-2 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-medium">Q{p.question_id}</span>
                <span className="text-muted-foreground">·</span>
                <span>{p.user_action}</span>
              </div>
              <div className="text-muted-foreground">{p.suggested_toelichting}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
