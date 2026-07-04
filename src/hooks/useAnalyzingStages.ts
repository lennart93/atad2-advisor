import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProcessStep, ProcessStepStatus } from "@/components/ds";
import { usePrefillJob, useAllPrefills, useQuestionCount } from "@/hooks/usePrefill";
import { useSuggestedAnswerMap } from "@/hooks/useOpenQuestions";
import { isAnalysisReady, isSwarmDone } from "@/lib/prefill/analysisReady";
import { useUiBusySignal } from "@/stores/uiBusyStore";

// The escape hatch and the "couldn't finish" marker key off a STALL, not a
// fixed deadline. A run that keeps landing answers is healthy however long it
// takes (a raw-PDF set with many questions legitimately runs past three
// minutes), so the old wall-clock timer flagged those runs as failed and then
// "recovered" seconds later when the last answers landed. Instead we watch
// forward progress: once no new answer has landed for this long while the swarm
// is not yet done, the run is treated as stuck and the way out is offered. The
// clock resets the instant a new answer lands (see lastProgressAtRef). A single
// edge call maxes out near the ~60s runtime budget, so 120s of silence means
// the run is genuinely wedged, not merely slow.
const STALL_TIMEOUT_MS = 120_000;

// How long the reading bar (stages 1-3) takes to ease up to READING_END. Real
// answering progress fills the bar within this clock but is never allowed to
// run ahead of it (see readingFrac): a fast document set otherwise snaps the
// bar to 72% the instant the swarm finishes answering, so "Answering what the
// documents cover" blew past to 72% and then sat there. Widened by 60s on
// advisor feedback so that stage climbs at a human pace. The escape hatch is
// driven by the progress stall above, not by this visual clock.
const READING_EASE_MS = 127_500;

// The eased clock serves as both a no-hang floor (this fraction of it) and a
// no-leap ceiling (itself). Real answering progress shows in the band between
// the two, so the bar tracks reality without ever jumping to the top ahead of
// the clock.
const READING_FLOOR_RATIO = 0.9;

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
  "Preparing the questions that still need the client's input",
] as const;

export interface AnalyzingStages {
  /** True while the unified "Analyzing your documents" screen should show. */
  analyzing: boolean;
  steps: ProcessStep[];
  /** One progress percentage across all four sub-stages. */
  pct: number;
  /** Failed/stalled reading: offer the escape hatch to the questionnaire. */
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
 * are read AND the points are still settling. A failed or stalled prefill
 * flips the in-flight stage to an error and surfaces the escape hatch.
 */
export function useAnalyzingStages(
  sessionId: string,
  worklistSettling: boolean,
): AnalyzingStages {
  const qc = useQueryClient();
  const { data: job } = usePrefillJob(sessionId);
  const { data: prefills } = useAllPrefills(sessionId);
  const { data: suggestionMap } = useSuggestedAnswerMap(sessionId);
  const { data: totalQuestions } = useQuestionCount();

  const [stalled, setStalled] = useState(false);
  // Anchor the eased clock to when THIS analysis run actually started (the job
  // row's started_at, re-stamped on every re-analyze) rather than this mount.
  // Navigating away and back remounts the screen; without this anchor the clock
  // — and the whole reading bar — would restart at 0 instead of resuming where
  // the analysis really is.
  const startedAtRef = useRef<number>(Date.now());
  // When did the answer count last go up? The stall watchdog measures silence
  // from here, so a still-progressing run is never flagged. Before the first
  // answer lands it is anchored to the run start (the warmup grace); after that
  // it tracks the most recent answer.
  const lastProgressAtRef = useRef<number>(Date.now());
  const prevPrefillCountRef = useRef<number>(0);
  const startedAt = job?.started_at ? new Date(job.started_at).getTime() : null;
  useEffect(() => {
    if (startedAt) {
      startedAtRef.current = startedAt;
      // Measure the warmup grace from the real run start, not this mount, so a
      // remount mid-run never restarts the silence clock from zero.
      if (prevPrefillCountRef.current === 0) lastProgressAtRef.current = startedAt;
    }
  }, [startedAt]);

  const prefillCount = prefills?.length ?? 0;
  // The readiness gate compares DISTINCT prefilled question ids against the
  // suggestion map's distinct ids; a raw row count would let a duplicate prefill
  // row wedge the gate (rows > distinct forever). realFrac and the stall
  // watchdog below keep using the plain row count: they only need a
  // monotonically rising number, and the visual bar never needs de-duping.
  const prefillQuestionIdCount = useMemo(
    () => new Set((prefills ?? []).map((p) => p.question_id)).size,
    [prefills],
  );
  const suggestionCount = suggestionMap?.size ?? 0;
  const total = totalQuestions ?? null;
  const failed = job?.status === "failed";
  // Stay in the reading stages until the path-driving suggestion map has caught
  // up to the prefilled questions, the same gate the points screen uses to
  // compose (useDocumentsWorklist.analysisDone). Without this the bar leapt to
  // "preparing the points" the instant the prefill rows landed, while the core
  // questions were still settling into the path.
  const readyInput = {
    jobStatus: job?.status,
    prefillQuestionIdCount,
    suggestionQuestionIdCount: suggestionCount,
    totalQuestions: total,
  };
  const swarmDone = isSwarmDone(readyInput);
  const prefillReady = isAnalysisReady(readyInput);

  // Self-heal a lagging suggestion cache. When the swarm is done but the
  // suggestion map hasn't caught up (a dropped realtime event on its channel),
  // nothing else nudges it in a reader-only tab, so the screen would sit at 72%
  // forever until a manual reload. Poll a reconciling refetch until the gate
  // satisfies; it converges the instant both caches read the same DB snapshot,
  // then this effect turns itself off. Scoped to the stuck window only, so a
  // healthy run never polls.
  useEffect(() => {
    if (!swarmDone || prefillReady) return;
    const id = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ["suggested-answer-map", sessionId] });
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
    }, 2500);
    return () => window.clearInterval(id);
  }, [swarmDone, prefillReady, sessionId, qc]);

  // Track forward progress for the stall watchdog: every time a new answer
  // lands, stamp "now" and clear any stall alarm. A run that keeps producing
  // answers therefore never trips the watchdog, however long it runs, and a
  // stuck run that recovers un-flags itself the moment the next answer arrives.
  useEffect(() => {
    if (prefillCount > prevPrefillCountRef.current) {
      prevPrefillCountRef.current = prefillCount;
      lastProgressAtRef.current = Date.now();
      setStalled(false);
    }
  }, [prefillCount]);

  // Real progress over the reading+answering portion (0..READING_END of the bar).
  const realFrac =
    total != null ? Math.min(READING_END, (prefillCount / total) * READING_END) : 0;

  // Eased time curve that paces the reading bar (0..READING_END). It is the
  // ceiling real progress may never exceed, so the bar climbs to 72% at a human
  // pace instead of snapping there the moment the swarm finishes answering.
  const [easedFrac, setEasedFrac] = useState(0);
  useEffect(() => {
    if (prefillReady) {
      setEasedFrac(READING_END);
      return;
    }
    const tick = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, now - startedAtRef.current);
      const fraction = Math.min(1, elapsed / READING_EASE_MS);
      const eased = 1 - Math.pow(1 - fraction, 1.6);
      setEasedFrac(eased * READING_END);
      // Stall watchdog: flag the run only when answers have stopped arriving
      // while the swarm is not yet done. swarmDone short-circuits this — once
      // every question has a row we are only waiting on the suggestion map to
      // sync (a few seconds), which is never a failure. setStalled(true) is a
      // no-op once already set, and a fresh answer clears it (see the progress
      // effect above), so the bar keeps easing without restarting the interval.
      if (!swarmDone && now - lastProgressAtRef.current >= STALL_TIMEOUT_MS) {
        setStalled(true);
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [prefillReady, swarmDone]);

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

  // Reading curve (stages 1-3): real answering progress, but clamped between
  // the eased clock's no-hang floor and its no-leap ceiling so the bar tracks
  // reality without ever snapping to 72% the moment the swarm finishes. A
  // settling worklist never forces it forward. Once the documents are read,
  // stage 4 (preparing the points) eases on toward the end while points settle.
  const readingFrac = Math.min(
    Math.max(realFrac, easedFrac * READING_FLOOR_RATIO),
    easedFrac,
  );
  const frac = !prefillReady
    ? readingFrac
    : worklistSettling
      ? composeFrac
      : 1;

  const analyzing = worklistSettling || !prefillReady;
  const showEscape = (failed || stalled) && !prefillReady;

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
    : stalled && !prefillReady
      ? "Still working in the background. You can continue to the questionnaire; any answers found appear there as drafts."
      : null;

  useUiBusySignal(analyzing && !showEscape);

  return { analyzing, steps, pct: Math.round(frac * 100), showEscape, statusDetail };
}
