import { useEffect, useState } from "react";
import {
  useAllPrefills,
  usePrefillJob,
  useQuestionCount,
  useSessionDocuments,
} from "@/hooks/usePrefill";
import { useQuestionTexts } from "@/hooks/useOpenQuestions";
import {
  pickNarrativeLine,
  type TickerPhase,
} from "@/lib/prefill/analysisNarrative";

export interface AnalysisNarrativeProps {
  sessionId: string;
  phase?: TickerPhase;
  /** Session taxpayer name; a few rotating lines mention it when known. */
  taxpayerName?: string | null;
}

/**
 * The single rotating narrative line under AnalyzeProgress. The grounded
 * lines come from data already streaming in over existing realtime channels
 * (prefill rows, session documents): document categories being read, real
 * check counters, and id-free client-question teasers. Between them rotates
 * a fixed pool of ATAD2 work lines (see DOMAIN_ACTIVITY_LINES) so the ticker
 * stays lively even while little data has landed yet. The pipeline phase
 * decides what rotates; the page controls mounting, so the rotation timer
 * simply runs while mounted. Exactly ONE line renders at a time and the
 * block never grows.
 */
export function AnalysisNarrative({
  sessionId,
  phase = "analyzing",
  taxpayerName = null,
}: AnalysisNarrativeProps) {
  const { data: prefills } = useAllPrefills(sessionId);
  const { data: documents } = useSessionDocuments(sessionId);
  // Keeps the realtime channel alive that invalidates the documents query.
  usePrefillJob(sessionId);
  const { data: questionTexts } = useQuestionTexts();
  const { data: totalQuestions } = useQuestionCount();

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 4000);
    return () => window.clearInterval(id);
  }, []);

  const officialById = questionTexts ?? new Map<string, string>();
  const routeB = (prefills ?? [])
    .filter((p) => p.contextual_hint !== null)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  const teasers = routeB
    .map((p) => p.client_question ?? officialById.get(p.question_id) ?? "")
    .filter((t) => t.trim().length > 0);

  const line = pickNarrativeLine(
    phase,
    {
      categories: (documents ?? []).map((d) => d.category),
      prefillCount: prefills?.length ?? 0,
      totalQuestions: totalQuestions ?? null,
      clientQuestionCount: routeB.length,
      teasers,
      taxpayerName,
    },
    tick,
  );

  if (line === null) return null;

  return (
    <p
      aria-live="polite"
      className="truncate text-xs italic text-muted-foreground px-1"
    >
      {line}
    </p>
  );
}
