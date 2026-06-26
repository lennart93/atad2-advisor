import { useEffect, useRef, useState } from "react";
import type { ProcessStep, ProcessStepStatus } from "@/components/ds";
import { usePrefillJob, useAllPrefills, useQuestionCount } from "@/hooks/usePrefill";
import { useSuggestedAnswerMap } from "@/hooks/useOpenQuestions";
import { useUiBusySignal } from "@/stores/uiBusyStore";

// After this many ms we let the user move on even if reading hasn't finished,
// with a clear "anyway" label. Set well above the worst-case analysis time
// (~90s with a raw PDF) so the honest path almost always wins.
const WAIT_TIMEOUT_MS = 180_000;

// How long the reading bar takes to ease up to its pre-completion ceiling
// (~0.7). Kept well under WAIT_TIMEOUT_MS so the four stages progress at a
// natural pace and the bar is already near the ceiling by the time the
// parallel swarm's results land in a burst, turning the old jump-to-72% into a
// small final step rather than a leap. Slowed 1.5x from 45s so the climb to
// 70% feels gradual instead of filling fast and then sitting there.
const READING_EASE_MS = 67_500;

// Expected window for stage 4 (preparing the points). The bar eases from where
// reading ended toward COMPOSE_END across this time so it never jumps; if the
// compose runs longer the bar just sits near COMPOSE_END until the points land.
const COMPOSE_EASE_MS = 30_000;
const READING_END = 0.72;
const COMPOSE_END = 0.97;

const STAGE_LABELS = [
  "Reading documents",
  "Matching them to the ATAD2 questionnaire",
  "Answering what the documents cover",
  "Preparing the points that still need your input",
] as const;

export interface AnalyzingStages {
  /** True while the unified "Analyzing your documents" screen should show. */
  analyzing: boolean;
  steps: ProcessStep[];
  /** One progress percentage across all four sub-stages. */
  pct: number;
  /** Failed/timed-out reading: offer the escape hatch to the questionnaire. */
  showEscape: boolean;
  /** One-line guidance for the non-happy paths; null while working calmly. */
  statusDetail: string | null;
}

function buildSteps(currentStage: number, failed: boolean): ProcessStep[] {
  return STAGE_LABELS.map((label, index) => {
    const n = index + 1;
    let status: ProcessStepStatus;
    if (n < currentStage) status = "done";
    else if (n === currentStage) status = failed ? "error" : "current";
    else status = "pending";
    return { id: `analyze-${n}`, label, status };
  });
}

/**
 * Drives the single, never-route-changing "Analyzing your documents" screen.
 * It folds the two real phases the app has, reading + answering the documents
 * (the prefill job) and preparing the merged points (the compose step), into
 * one continuous four-stage progression so the user never sees a second
 * loading page.
 *
 * `worklistSettling` means "the points aren't ready yet" (the worklist is
 * loading or composing), passed in by the caller (the points screen owns that
 * hook). Stages 1-3 track the prefill job and depend ONLY on reading progress,
 * so a pre-settle worklist can never jump the bar to stage 4 before reading
 * has started; stage 4 (preparing the points) shows only once the documents
 * are read AND the points are still settling. A failed or timed-out prefill
 * flips the in-flight stage to an error and surfaces the escape hatch.
 */
export function useAnalyzingStages(
  sessionId: string,
  worklistSettling: boolean,
): AnalyzingStages {
  const { data: job } = usePrefillJob(sessionId);
  const { data: prefills } = useAllPrefills(sessionId);
  const { data: suggestionMap } = useSuggestedAnswerMap(sessionId);
  const { data: totalQuestions } = useQuestionCount();

  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  const prefillCount = prefills?.length ?? 0;
  const suggestionCount = suggestionMap?.size ?? 0;
  const total = totalQuestions ?? null;
  const completed = job?.status === "completed";
  const failed = job?.status === "failed";
  const fullCoverage = total != null && prefillCount >= total;
  // Stay in the reading stages until the path-driving suggestion map has caught
  // up to the prefill rows, the same gate the points screen uses to compose
  // (useDocumentsWorklist.analysisDone). Without this the bar leapt to "preparing
  // the points" the instant the prefill rows landed, while the core questions
  // were still settling into the path.
  const swarmDone = completed || fullCoverage;
  const prefillReady =
    swarmDone && prefillCount > 0 && suggestionCount >= prefillCount;

  // Real progress over the reading+answering portion (0..READING_END of the bar).
  const realFrac =
    total != null ? Math.min(READING_END, (prefillCount / total) * READING_END) : 0;

  // Time-based floor so the bar never visually hangs between writes.
  const [easedFrac, setEasedFrac] = useState(0);
  useEffect(() => {
    if (prefillReady) {
      setEasedFrac(READING_END);
      return;
    }
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      // The visible curve eases over READING_EASE_MS; the escape hatch still
      // waits the full WAIT_TIMEOUT_MS before offering the way out.
      const fraction = Math.min(1, elapsed / READING_EASE_MS);
      const eased = 1 - Math.pow(1 - fraction, 1.6);
      setEasedFrac(Math.min(0.7, eased * READING_END));
      if (elapsed >= WAIT_TIMEOUT_MS) {
        window.clearInterval(tick);
        setTimedOut(true);
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [prefillReady]);

  // Stage 4 (preparing the points): ease on from where reading ended toward
  // COMPOSE_END instead of jumping. Starts when the documents are read and the
  // worklist is still settling; resets so a later compose eases from the start.
  const [composeFrac, setComposeFrac] = useState(READING_END);
  const composeStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!prefillReady || !worklistSettling) {
      composeStartRef.current = null;
      setComposeFrac(READING_END);
      return;
    }
    const start = Date.now();
    composeStartRef.current = start;
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const fraction = Math.min(1, elapsed / COMPOSE_EASE_MS);
      const eased = 1 - Math.pow(1 - fraction, 1.6);
      setComposeFrac(READING_END + eased * (COMPOSE_END - READING_END));
      if (elapsed >= COMPOSE_EASE_MS) window.clearInterval(tick);
    }, 500);
    return () => window.clearInterval(tick);
  }, [prefillReady, worklistSettling]);

  // Fraction across the whole four-stage bar. Until the documents are read,
  // it is purely the reading curve (stages 1-3); a settling worklist never
  // forces it forward. Once read, stage 4 (preparing the points) eases on
  // toward the end while the points settle.
  const frac = !prefillReady
    ? Math.max(realFrac, easedFrac)
    : worklistSettling
      ? composeFrac
      : 1;

  const analyzing = worklistSettling || !prefillReady;
  const showEscape = (failed || timedOut) && !prefillReady;

  // Current stage 1..4. Before the documents are read, the reading fraction
  // picks stage 1/2/3; once read, stage 4 (preparing the points).
  const currentStage = prefillReady
    ? 4
    : frac < 0.24
      ? 1
      : frac < 0.48
        ? 2
        : 3;

  const steps = buildSteps(currentStage, showEscape);

  const statusDetail = failed
    ? "Couldn't read the documents. You can continue to the questionnaire and answer everything there."
    : timedOut && !prefillReady
      ? "Still working in the background. You can continue to the questionnaire; any answers found appear there as drafts."
      : null;

  useUiBusySignal(analyzing && !showEscape);

  return { analyzing, steps, pct: Math.round(frac * 100), showEscape, statusDetail };
}
