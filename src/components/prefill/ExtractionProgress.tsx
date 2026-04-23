import { useSessionDocuments, usePrefillJob } from "@/hooks/usePrefill";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface Props { sessionId: string; }

export function ExtractionProgress({ sessionId }: Props) {
  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);

  const totalDocs = docs?.length ?? 0;
  const summarized = docs?.filter((d) => d.status === "summarized").length ?? 0;
  const failedDocs = docs?.filter((d) => d.status === "failed").length ?? 0;
  const stage1Pct = totalDocs === 0 ? 0 : Math.round(((summarized + failedDocs) / totalDocs) * 100);

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Analyzing documents</span>
          <span>{summarized + failedDocs}/{totalDocs}</span>
        </div>
        <Progress value={stage1Pct} />
        <div className="space-y-1">
          {docs?.map((d) => (
            <Card key={d.id} className="p-2 flex items-center gap-2 text-sm">
              {d.status === "summarizing" && <Loader2 className="h-4 w-4 animate-spin" />}
              {d.status === "summarized" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              {d.status === "failed" && <AlertCircle className="h-4 w-4 text-destructive" />}
              <span className="flex-1 truncate">{d.doc_label}</span>
              <span className="text-xs text-muted-foreground">{d.status}</span>
            </Card>
          ))}
        </div>
      </section>

      {job?.status === "stage2_running" && (
        <section>
          <div className="text-sm mb-2">Matching documents to assessment questions…</div>
          <Progress />
        </section>
      )}

      {job?.status === "failed" && (
        <div className="text-sm text-destructive">{job.error_message ?? "Extraction failed."}</div>
      )}
    </div>
  );
}
