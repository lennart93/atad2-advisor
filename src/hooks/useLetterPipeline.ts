import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import {
  ComposeNotDeployedError,
  useComposeClientLetter,
} from "@/hooks/useComposeClientLetter";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import { useOpenQuestionsView } from "@/hooks/useOpenQuestions";
import {
  runWordingRound,
  useActivePromptVersionQuery,
} from "@/hooks/usePrepareClientQuestions";
import {
  useAllPrefills,
  usePrefillJob,
  useQuestionCount,
} from "@/hooks/usePrefill";
import {
  buildComposeItems,
  selectComposeRows,
  type ComposedLetter,
} from "@/lib/openQuestions/composeLetter";
import {
  decidePipelineStart,
  type LetterPipelinePhase,
  type PipelineError,
  type PipelineStart,
  mergeFreshWording,
} from "@/lib/openQuestions/letterPipeline";
import {
  decodeStoredLetter,
  encodeStoredLetter,
  letterStorageKey,
  type StoredLetter,
} from "@/lib/openQuestions/letterStore";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

/**
 * Letter-first analysis page orchestration: once the document analysis
 * completes, automatically run the wording round (when the v12 prompt is
 * live and rows still miss client wording), then compose the client letter
 * and persist it per session. The pure decisions live in
 * lib/openQuestions/letterPipeline.ts; this hook only sequences them.
 *
 * Auto-run fires exactly once per mount, and ONLY on:
 *  - the in-mount completion transition (analysis finished while watching), or
 *  - a settled-ready visit without a decodable stored letter.
 * A settled-ready visit WITH a stored letter shows it without any calls.
 * A failed analysis never starts the pipeline.
 */

export interface SessionMeta {
  taxpayer_name: string | null;
  fiscal_year: string | null;
}

export interface LetterPipeline {
  phase: LetterPipelinePhase;
  error: PipelineError | null;
  letter: ComposedLetter | null;
  /** ISO timestamp of the shown letter, drives the "as of" line. */
  composedAt: string | null;
  /** Snapshot of the rows the letter was composed from; flips resolve here. */
  sentRows: OpenQuestionRow[];
  sessionMeta: SessionMeta | null | undefined;
  /** True while a compose call runs; the block disables its buttons on it. */
  composeBusy: boolean;
  regenerate: (includedQuestionIds: string[]) => Promise<void>;
  retry: () => void;
}

/** Stored letter for the session; storage-less browsers read as "none". */
function readStoredLetter(sessionId: string): StoredLetter | null {
  try {
    return decodeStoredLetter(localStorage.getItem(letterStorageKey(sessionId)));
  } catch {
    return null;
  }
}

/** Persists the letter; storage failures never block showing it. */
function writeStoredLetter(
  sessionId: string,
  letter: ComposedLetter,
  composedAt: string,
): void {
  try {
    localStorage.setItem(
      letterStorageKey(sessionId),
      encodeStoredLetter(
        letter,
        letter.questions.map((q) => q.question_id),
        composedAt,
      ),
    );
  } catch {
    // Storage unavailable (private mode, quota): the letter still shows.
  }
}

export function useLetterPipeline(sessionId: string): LetterPipeline {
  const qc = useQueryClient();
  const jobQuery = usePrefillJob(sessionId);
  const prefillsQuery = useAllPrefills(sessionId);
  const questionCountQuery = useQuestionCount();
  const view = useOpenQuestionsView(sessionId);
  const promptVersion = useActivePromptVersionQuery();
  const compose = useComposeClientLetter(sessionId);
  const { logEvent } = useOpenQuestionActions(sessionId);

  // Same queryKey as the export actions and the old dialog: shared cache.
  const { data: sessionMeta } = useQuery({
    queryKey: ["open-questions-session-meta", sessionId],
    queryFn: async (): Promise<SessionMeta | null> => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("taxpayer_name, fiscal_year")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [phase, setPhase] = useState<LetterPipelinePhase>("analyzing");
  const [error, setError] = useState<PipelineError | null>(null);
  const [letter, setLetter] = useState<ComposedLetter | null>(null);
  const [composedAt, setComposedAt] = useState<string | null>(null);
  const [sentRows, setSentRows] = useState<OpenQuestionRow[]>([]);

  /** The auto-run happened (or a stored letter was shown); never re-fires. */
  const autoRanRef = useRef(false);
  /** The queries settled at least once; the first settle sets the baseline. */
  const settledRef = useRef(false);
  /** ready as of the previous effect run, for the false->true flip. */
  const prevReadyRef = useRef(false);

  // Mirrors the AnalyzeProgress ready check: the job says completed, or every
  // question already has a prefill row (full coverage).
  const questionCount = questionCountQuery.data ?? null;
  const ready =
    jobQuery.data?.status === "completed" ||
    (questionCount != null &&
      (prefillsQuery.data?.length ?? 0) >= questionCount);
  const failed = jobQuery.data?.status === "failed";

  const { mutateAsync: composeLetter, isPending: composeBusy } = compose;

  /** The compose step shared by all paths; persists and lands on "letter". */
  const composeAndShow = useCallback(
    async (rows: OpenQuestionRow[]) => {
      setPhase("composing");
      setSentRows(rows);
      try {
        const composed = await composeLetter({
          items: buildComposeItems(rows, view.resolveText),
          taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
          fiscalYear: sessionMeta?.fiscal_year || "",
        });
        const now = new Date().toISOString();
        writeStoredLetter(sessionId, composed, now);
        setLetter(composed);
        setComposedAt(now);
        setError(null);
        setPhase("letter");
      } catch (e) {
        const err = e as Error;
        if (err instanceof ComposeNotDeployedError) {
          // Retrying cannot help until the action is deployed: one toast,
          // and the error state renders without a Try again button.
          toast.error("Letter composition is not deployed yet.");
          setError({ message: err.message, notDeployed: true });
        } else {
          setError({ message: err.message, notDeployed: false });
        }
        setPhase("error");
      }
    },
    [composeLetter, sessionId, sessionMeta, view.resolveText],
  );

  const runPipeline = useCallback(
    async (start: PipelineStart) => {
      if (start.kind === "empty") {
        // Zero open path questions: the documents covered everything.
        setPhase("empty");
        return;
      }
      if (start.kind === "letter") {
        // Visit with a stored letter: show it, no calls. Flips on copy
        // resolve against the CURRENT worklist snapshot, so rows answered
        // since the letter was composed are never flipped back.
        setLetter(start.stored.letter);
        setComposedAt(start.stored.composedAt);
        setSentRows(selectComposeRows(view.groups));
        setError(null);
        setPhase("letter");
        return;
      }

      let rows = selectComposeRows(view.groups);
      if (start.kind === "wording") {
        setPhase("wording");
        try {
          // Per-row failures stay inside the result and never stop the
          // pipeline: those rows compose via the official-text fallback.
          await runWordingRound(sessionId, logEvent);
        } catch (e) {
          // Setup errors only (row select, documents bundle, question select).
          setError({ message: (e as Error).message, notDeployed: false });
          setPhase("error");
          return;
        }
        qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
        qc.invalidateQueries({ queryKey: ["open-questions", sessionId] });
        qc.invalidateQueries({ queryKey: ["suggested-answer-map", sessionId] });
        // Fresh wording straight from the DB: the react-query cache is not
        // trustworthy mid-run (invalidation refetches race the compose call).
        const { data: fresh, error: freshErr } = await supabase
          .from("atad2_open_questions")
          .select("question_id, client_question")
          .eq("session_id", sessionId)
          .in("question_id", start.targetIds);
        if (freshErr) {
          // Not fatal: compose falls back to the official question text.
          console.warn("Could not fetch fresh client wording:", freshErr);
        } else {
          const freshById = new Map<string, string | null>();
          for (const row of fresh ?? []) {
            freshById.set(row.question_id, row.client_question);
          }
          rows = mergeFreshWording(rows, freshById);
        }
      }

      await composeAndShow(rows);
    },
    [composeAndShow, logEvent, qc, sessionId, view.groups],
  );

  // Settle gate + completion-transition detection + the one-shot auto-run.
  useEffect(() => {
    const settled =
      (jobQuery.isSuccess || jobQuery.isError) &&
      !view.isLoading &&
      !promptVersion.isLoading;
    if (!settled) return;

    let completionTransition = false;
    if (!settledRef.current) {
      // First settle sets the baseline; a session that arrives already ready
      // is a visit, not a transition.
      settledRef.current = true;
      prevReadyRef.current = ready;
    } else {
      completionTransition = !prevReadyRef.current && ready;
      prevReadyRef.current = ready;
    }

    if (failed || !ready || autoRanRef.current) return;

    autoRanRef.current = true;
    void runPipeline(
      decidePipelineStart({
        completionTransition,
        storedLetter: readStoredLetter(sessionId),
        composeRows: selectComposeRows(view.groups),
        promptVersion: promptVersion.version,
      }),
    );
  }, [
    jobQuery.isSuccess,
    jobQuery.isError,
    view.isLoading,
    view.groups,
    promptVersion.isLoading,
    promptVersion.version,
    ready,
    failed,
    sessionId,
    runPipeline,
  ]);

  /**
   * Regenerate with the ticked questions only: re-runs JUST the compose step
   * against the sent snapshot. Failures toast and keep the previous letter
   * usable; the phase never flips to error here.
   */
  const regenerate = useCallback(
    async (includedQuestionIds: string[]) => {
      const included = new Set(includedQuestionIds);
      const rows = sentRows.filter((row) => included.has(row.question_id));
      if (rows.length === 0) return;
      try {
        const composed = await composeLetter({
          items: buildComposeItems(rows, view.resolveText),
          taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
          fiscalYear: sessionMeta?.fiscal_year || "",
        });
        const now = new Date().toISOString();
        writeStoredLetter(sessionId, composed, now);
        setLetter(composed);
        setComposedAt(now);
      } catch (e) {
        const err = e as Error;
        if (err instanceof ComposeNotDeployedError) {
          toast.error("Letter composition is not deployed yet.");
        } else {
          toast.error("Could not compose the letter", {
            description: err.message,
          });
        }
      }
    },
    [composeLetter, sentRows, sessionId, sessionMeta, view.resolveText],
  );

  /**
   * Try again after a hard error: always recomposes fresh, including a new
   * wording attempt when rows still miss client wording (completion-
   * transition semantics, the stored letter is deliberately ignored).
   */
  const retry = useCallback(() => {
    setError(null);
    void runPipeline(
      decidePipelineStart({
        completionTransition: true,
        storedLetter: null,
        composeRows: selectComposeRows(view.groups),
        promptVersion: promptVersion.version,
      }),
    );
  }, [promptVersion.version, runPipeline, view.groups]);

  return {
    phase,
    error,
    letter,
    composedAt,
    sentRows,
    sessionMeta,
    composeBusy,
    regenerate,
    retry,
  };
}
