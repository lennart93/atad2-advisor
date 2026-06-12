import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  selectAddCandidates,
  selectComposeSelectionFresh,
  type ComposedLetter,
  type ComposeSelection,
} from "@/lib/openQuestions/composeLetter";
import type { QuestionBranchRow } from "@/lib/openQuestions/projectedPath";
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
 *
 * Every compose DECISION (auto-run, retry, regenerate, the empty verdict)
 * selects its rows from data fetched fresh out of the database, never from
 * the react-query cache: at the completion transition the cached
 * suggested-answer map can lag behind the just-finished analysis, the
 * projected-path walker then treats those questions as wildcards, and the
 * letter would include every off-path question. Rendering keeps using the
 * cache as before.
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
  /** Off-path question ids explicitly added to the shown letter. */
  addedQuestionIds: string[];
  /**
   * Off-path open/taken_to_client rows not yet in the letter: the candidates
   * for "Add questions outside the expected path". Display only, from the
   * live view; compose decisions re-select everything fresh.
   */
  candidateRows: OpenQuestionRow[];
  /** Display text: client wording, else official text, else fixed sentence. */
  resolveText: (row: OpenQuestionRow) => string;
  sessionMeta: SessionMeta | null | undefined;
  /** True while a compose call runs; the block disables its buttons on it. */
  composeBusy: boolean;
  regenerate: (
    includedQuestionIds: string[],
    addedQuestionIds: string[],
  ) => Promise<void>;
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
  addedQuestionIds: string[],
  composedAt: string,
): void {
  try {
    localStorage.setItem(
      letterStorageKey(sessionId),
      encodeStoredLetter(
        letter,
        letter.questions.map((q) => q.question_id),
        addedQuestionIds,
        composedAt,
      ),
    );
  } catch {
    // Storage unavailable (private mode, quota): the letter still shows.
  }
}

/**
 * The compose-decision worklist, selected from FRESH database reads: the
 * register rows, the recorded answers, the AI suggested answers and the
 * questionnaire branch rows, all in one parallel round trip. The projected
 * path is computed from exactly these reads (selectComposeSelectionFresh), so
 * the selection can never be widened by a query cache that has not refetched
 * yet.
 * Throws on any read error; callers turn that into the error phase instead
 * of ever deciding "empty" on data they do not actually have.
 *
 * extraQuestionIds carries the advisor's explicit off-path additions; the
 * returned selection holds their rows too, plus the CLEANED list of added
 * ids (extras meanwhile answered, dismissed or on-path drop out of it).
 */
async function fetchFreshComposeRows(
  sessionId: string,
  extraQuestionIds: string[],
): Promise<ComposeSelection> {
  const [rowsRes, answersRes, suggestionsRes, branchesRes] = await Promise.all([
    supabase
      .from("atad2_open_questions")
      .select("*")
      .eq("session_id", sessionId),
    supabase
      .from("atad2_answers")
      .select("question_id, answer")
      .eq("session_id", sessionId),
    supabase
      .from("atad2_question_prefills")
      .select("question_id, suggested_answer")
      .eq("session_id", sessionId),
    supabase
      .from("atad2_questions")
      .select("question_id, answer_option, next_question_id"),
  ]);
  if (rowsRes.error) throw new Error(rowsRes.error.message);
  if (answersRes.error) throw new Error(answersRes.error.message);
  if (suggestionsRes.error) throw new Error(suggestionsRes.error.message);
  if (branchesRes.error) throw new Error(branchesRes.error.message);

  const answers = new Map<string, string>();
  for (const row of answersRes.data ?? []) {
    answers.set(row.question_id, row.answer);
  }
  const suggestions = new Map<string, string | null>();
  for (const row of suggestionsRes.data ?? []) {
    suggestions.set(row.question_id, row.suggested_answer);
  }
  return selectComposeSelectionFresh(
    (rowsRes.data ?? []) as OpenQuestionRow[],
    answers,
    suggestions,
    (branchesRes.data ?? []) as QuestionBranchRow[],
    extraQuestionIds,
  );
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
  const [addedQuestionIds, setAddedQuestionIds] = useState<string[]>([]);

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
    async (rows: OpenQuestionRow[], addedIds: string[]) => {
      setPhase("composing");
      setSentRows(rows);
      try {
        const composed = await composeLetter({
          items: buildComposeItems(rows, view.resolveText),
          taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
          fiscalYear: sessionMeta?.fiscal_year || "",
        });
        const now = new Date().toISOString();
        writeStoredLetter(sessionId, composed, addedIds, now);
        setLetter(composed);
        setComposedAt(now);
        setAddedQuestionIds(addedIds);
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
    async (start: PipelineStart, freshSelection: ComposeSelection) => {
      if (start.kind === "empty") {
        // Zero open path questions ON FRESH DATA: the documents covered
        // everything. The empty verdict is never taken from the query cache.
        setPhase("empty");
        return;
      }
      if (start.kind === "letter") {
        // Visit with a stored letter: show it, no compose call. Flips on
        // copy resolve against the freshly selected worklist (which includes
        // the stored added off-path rows), so rows answered since the letter
        // was composed are never flipped back. The added ids come from the
        // CLEANED fresh selection, not the raw stored list.
        setLetter(start.stored.letter);
        setComposedAt(start.stored.composedAt);
        setSentRows(freshSelection.rows);
        setAddedQuestionIds(freshSelection.addedQuestionIds);
        setError(null);
        setPhase("letter");
        return;
      }

      let rows = freshSelection.rows;
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

      await composeAndShow(rows, freshSelection.addedQuestionIds);
    },
    [composeAndShow, logEvent, qc, sessionId],
  );

  /**
   * Every compose decision starts here: fetch the worklist fresh from the
   * database, decide the first pipeline step from THAT data, then run the
   * pipeline with the same fresh rows. A failed fetch lands on the error
   * phase with Try again; it is never mistaken for an empty worklist.
   */
  const startPipelineFresh = useCallback(
    async (
      completionTransition: boolean,
      storedLetter: StoredLetter | null,
      extraQuestionIds: string[],
    ) => {
      try {
        const freshSelection = await fetchFreshComposeRows(
          sessionId,
          extraQuestionIds,
        );
        await runPipeline(
          decidePipelineStart({
            completionTransition,
            storedLetter,
            composeRows: freshSelection.rows,
            promptVersion: promptVersion.version,
          }),
          freshSelection,
        );
      } catch (e) {
        setError({ message: (e as Error).message, notDeployed: false });
        setPhase("error");
      }
    },
    [promptVersion.version, runPipeline, sessionId],
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
    const storedLetter = readStoredLetter(sessionId);
    // The persisted added off-path questions ride along on every auto
    // decision, so they survive revisits and the completion recompose.
    void startPipelineFresh(
      completionTransition,
      storedLetter,
      storedLetter?.addedQuestionIds ?? [],
    );
  }, [
    jobQuery.isSuccess,
    jobQuery.isError,
    view.isLoading,
    promptVersion.isLoading,
    ready,
    failed,
    sessionId,
    startPipelineFresh,
  ]);

  /**
   * Regenerate with the ticked questions plus the requested off-path
   * additions: re-runs JUST the compose step, but against a FRESH worklist
   * selection. Ticked rows answered, dismissed or steered off the projected
   * path since the letter was composed drop out here; added ids that are
   * meanwhile answered, dismissed or now on-path drop or dedupe naturally
   * because the fresh selection is the only source of rows. This is the only
   * place staged additions enter the letter. Failures toast and keep the
   * previous letter usable; the phase never flips to error here.
   */
  const regenerate = useCallback(
    async (includedQuestionIds: string[], addedIds: string[]) => {
      const included = new Set([...includedQuestionIds, ...addedIds]);
      try {
        const freshSelection = await fetchFreshComposeRows(sessionId, addedIds);
        const rows = freshSelection.rows.filter((row) =>
          included.has(row.question_id),
        );
        if (rows.length === 0) return;
        const composed = await composeLetter({
          items: buildComposeItems(rows, view.resolveText),
          taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
          fiscalYear: sessionMeta?.fiscal_year || "",
        });
        const now = new Date().toISOString();
        writeStoredLetter(
          sessionId,
          composed,
          freshSelection.addedQuestionIds,
          now,
        );
        setSentRows(rows);
        setLetter(composed);
        setComposedAt(now);
        setAddedQuestionIds(freshSelection.addedQuestionIds);
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
    [composeLetter, sessionId, sessionMeta, view.resolveText],
  );

  /**
   * Try again after a hard error: always recomposes fresh, including a new
   * wording attempt when rows still miss client wording (completion-
   * transition semantics, the stored letter is deliberately ignored). The
   * phase flips to composing right away so the working lines show while the
   * fresh data loads; the pipeline corrects it to wording when needed.
   */
  const retry = useCallback(() => {
    setError(null);
    setPhase("composing");
    // The stored letter is ignored as a letter, but the advisor's explicit
    // off-path additions persist through the retry.
    void startPipelineFresh(
      true,
      null,
      readStoredLetter(sessionId)?.addedQuestionIds ?? [],
    );
  }, [sessionId, startPipelineFresh]);

  // Candidates for "Add questions outside the expected path": live off-path
  // open rows minus the questions already woven into the shown letter.
  const candidateRows = useMemo(() => {
    const letterIds = new Set(
      (letter?.questions ?? []).map((q) => q.question_id),
    );
    return selectAddCandidates(view.groups.later, letterIds);
  }, [view.groups.later, letter]);

  return {
    phase,
    error,
    letter,
    composedAt,
    sentRows,
    addedQuestionIds,
    candidateRows,
    resolveText: view.resolveText,
    sessionMeta,
    composeBusy,
    regenerate,
    retry,
  };
}
