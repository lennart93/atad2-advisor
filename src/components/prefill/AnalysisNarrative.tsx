import { useEffect, useState } from "react";
import {
  useAllPrefills,
  usePrefillJob,
  useSessionDocuments,
} from "@/hooks/usePrefill";
import { useQuestionTexts } from "@/hooks/useOpenQuestions";
import {
  buildNarrativeLines,
  nowReadingLine,
} from "@/lib/prefill/analysisNarrative";

export interface AnalysisNarrativeProps {
  sessionId: string;
}

/**
 * Grounded live narrative for the analysis wait, mounted between
 * AnalyzeProgress and OpenQuestionsStream. Every line is derived from data
 * that is already streaming in over existing realtime channels (prefill rows
 * and the job row); no new subscriptions, no fabricated text, no fake delays.
 * The only timer rotates which REAL document category the "Now reading" line
 * names while the job runs. Hard-capped at 6 single-height truncated lines
 * (1 reading line + up to 5 narrative lines) so the block stabilizes after
 * five prefills and never reflows the page.
 */
export function AnalysisNarrative({ sessionId }: AnalysisNarrativeProps) {
  const { data: prefills } = useAllPrefills(sessionId);
  const { data: documents } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);
  const { data: questionTexts } = useQuestionTexts();

  const running =
    job != null &&
    ["queued", "stage1_running", "stage2_running"].includes(job.status);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(id);
  }, [running]);

  const lines = buildNarrativeLines(
    prefills ?? [],
    questionTexts ?? new Map<string, string>(),
    5,
  );
  const reading = running
    ? nowReadingLine((documents ?? []).map((d) => d.category), tick)
    : null;

  if (!reading && lines.length === 0) return null;

  return (
    <div aria-live="polite" className="space-y-1 px-1">
      {reading && (
        <p className="truncate text-xs italic text-muted-foreground">
          {reading}
        </p>
      )}
      {lines.map((line, i) => (
        <p key={i} className="truncate text-xs text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}
