import { useState } from "react";
import { Wand2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/AdminCard";
import type { TuningAnalysis } from "@/lib/admin/promptTuner";

interface Props {
  analysis: TuningAnalysis;
  targetKey: string;
  onCreateDraft: () => void;
}

export function AnalysisPanel({ analysis, targetKey, onCreateDraft }: Props) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(analysis.proposed_revised_system_prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <AdminCard>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
          What changed and why
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap">{analysis.summary_of_changes}</p>
      </AdminCard>

      {analysis.changes.length > 0 && (
        <AdminCard>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3">
            Edits, intent, and the prompt gap
          </div>
          <div className="space-y-3">
            {analysis.changes.map((c, i) => (
              <div key={i} className="border border-border rounded-md p-3 bg-muted/20">
                <div className="text-sm font-medium text-foreground">{c.what}</div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  <span className="font-semibold text-foreground/80">Intent:</span> {c.inferred_intent}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold text-foreground/80">Prompt gap:</span> {c.prompt_gap}
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      {analysis.prompt_weaknesses.length > 0 && (
        <AdminCard>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
            Prompt weaknesses
          </div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
            {analysis.prompt_weaknesses.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </AdminCard>
      )}

      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Proposed prompt for <span className="font-mono normal-case tracking-normal">{targetKey}</span>
          </div>
          <Button size="sm" variant="outline" onClick={copyPrompt}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
        <pre className="bg-muted/40 border border-border p-3 rounded-md text-xs font-mono whitespace-pre-wrap max-h-96 overflow-auto text-foreground">
          {analysis.proposed_revised_system_prompt}
        </pre>
        {analysis.suggested_notes && (
          <p className="text-xs text-muted-foreground mt-2">
            <span className="font-semibold text-foreground/80">Suggested notes:</span> {analysis.suggested_notes}
          </p>
        )}
        <div className="flex justify-end mt-3">
          <Button onClick={onCreateDraft}>
            <Wand2 className="size-4" />
            <span className="ml-1.5">Create draft version</span>
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 text-right">
          Opens the prompt editor pre-filled. Saved as an inactive draft, it goes live only when you activate it from Version history.
        </p>
      </AdminCard>
    </div>
  );
}
