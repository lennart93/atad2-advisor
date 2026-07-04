import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import {
  ComposeNotDeployedError,
  useComposeClientLetter,
} from "@/hooks/useComposeClientLetter";
import {
  useOpenQuestionsView,
  useQuestionBranches,
  useSuggestedAnswerMap,
} from "@/hooks/useOpenQuestions";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import {
  invokePrefillFn,
  useAllPrefills,
  usePrefillJob,
  useQuestionCount,
} from "@/hooks/usePrefill";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { isAnalysisReady, isSwarmDone } from "@/lib/prefill/analysisReady";
import { runAnalyzePool } from "@/lib/openQuestions/analyzePool";
import {
  buildComposeItems,
  selectComposeRows,
} from "@/lib/openQuestions/composeLetter";
import {
  allQuestionKeys,
  coveredQuestionIds,
  decodeStoredLetter,
  encodeStoredLetter,
  type ComposedLetter,
} from "@/lib/openQuestions/letterShape";
import {
  buildMergedPoints,
  buildRawPoints,
  partitionPointsByPath,
  decodeStoredDraftSubmit,
  draftSubmitStorageKey,
  encodeStoredDraftSubmit,
  letterIsStale,
  openCount,
  planDraftWrites,
  resolvedCount,
  serializeAnswer,
  worklistFingerprint,
  worklistLetterStorageKey,
  type OpenPoint,
  type StoredDraftSubmit,
} from "@/lib/openQuestions/worklist";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

/**
 * State and actions for the documents-step worklist.
 *
 * The questions the documents could not answer are composed into a few merged
 * client questions ("Could you please confirm: 1, 2, 3"); the advisor
 * resolves each one (answer it, ask the client, or mark it not applicable),
 * and a gated submit writes the resolutions into the questionnaire as draft
 * answers (atad2_question_prefills, which the questionnaire renders as
 * suggestions). One answer on a merged question covers every decision-tree
 * question it bundles.
 *
 * The merged letter is composed once from the open path questions and kept
 * stable while the advisor works (cached per session); a reopened or new
 * question recomposes it. Only the AI suggestions drive the projected path,
 * never the advisor's resolutions, so the set stays still as it is worked.
 */

export type WorklistPhase = "loading" | "composing" | "ready" | "empty" | "error";

export interface SubmitDraftsResult {
  written: number;
  skipped: number;
}

export interface DocumentsWorklist {
  phase: WorklistPhase;
  composeError: { message: string; notDeployed: boolean } | null;
  /** Merged client questions on the expected path (the main list). */
  pathPoints: OpenPoint[];
  /** Off-path extras behind the "ask everything" expander. */
  offPathPoints: OpenPoint[];
  openPoints: number;
  resolvedPoints: number;
  totalPathPoints: number;
  /** Questions the documents answered on their own (for the result header). */
  autoAnsweredCount: number;
  /** Total distinct questionnaire questions (for the result header). */
  totalQuestions: number | null;
  /** Points currently routed to the client (status "Sent to client"). */
  sentPoints: OpenPoint[];
  taxpayerName: string | null;
  fiscalYear: string | null;
  resolveText: (row: OpenQuestionRow) => string;
  draftsUpToDate: boolean;
  lastSubmit: StoredDraftSubmit | null;
  busy: boolean;
  /** Ids of the points whose answers are currently being worked out by the AI.
   * Per-point (not a single id) so saving one card never blocks another. */
  savingPointIds: Set<string>;
  recompose: () => void;
  /** Save the advisor's free-text context for a point; status becomes Answered. */
  saveContext: (point: OpenPoint, context: string) => Promise<void>;
  askClient: (point: OpenPoint) => Promise<void>;
  markNa: (point: OpenPoint, reason: string) => Promise<void>;
  reopen: (point: OpenPoint) => Promise<void>;
  /** Bulk-resolve points sent to the client from a pasted reply (interim). */
  pasteClientReply: (text: string) => Promise<number>;
  pasting: boolean;
  submitting: boolean;
  submit: () => Promise<SubmitDraftsResult>;
}

function readCachedLetter(sessionId: string): ComposedLetter | null {
  try {
    return (
      decodeStoredLetter(
        localStorage.getItem(worklistLetterStorageKey(sessionId)),
      )?.letter ?? null
    );
  } catch {
    return null;
  }
}

function writeCachedLetter(sessionId: string, letter: ComposedLetter): void {
  try {
    localStorage.setItem(
      worklistLetterStorageKey(sessionId),
      encodeStoredLetter(
        letter,
        allQuestionKeys(letter),
        [],
        new Date().toISOString(),
      ),
    );
  } catch {
    // Storage unavailable: the worklist still shows; it just recomposes next
    // visit instead of reading the cache.
  }
}

function readStoredSubmit(sessionId: string): StoredDraftSubmit | null {
  try {
    return decodeStoredDraftSubmit(
      localStorage.getItem(draftSubmitStorageKey(sessionId)),
    );
  } catch {
    return null;
  }
}

function coveredIdsOf(letter: ComposedLetter): string[] {
  return coveredQuestionIds(letter, new Set(allQuestionKeys(letter)));
}

export function useDocumentsWorklist(sessionId: string): DocumentsWorklist {
  const qc = useQueryClient();
  const view = useOpenQuestionsView(sessionId);
  const branchesQuery = useQuestionBranches();
  const prefillsQuery = useAllPrefills(sessionId);
  // The same suggestion map that drives the projected path inside the view.
  // We read it here only to know whether it has caught up to the prefill rows
  // before composing (see analysisDone). React Query dedupes by key, so this is
  // the one cached query, not a second fetch.
  const suggestionsQuery = useSuggestedAnswerMap(sessionId);
  const questionCountQuery = useQuestionCount();
  const compose = useComposeClientLetter(sessionId);
  const { logEvent } = useOpenQuestionActions(sessionId);

  const { data: sessionMeta } = useQuery({
    // Gated like the other queries here: the sub-header chip mounts this hook
    // with an empty session id on its pre-guard render, and an ungated query
    // would fire a pointless atad2_sessions lookup with session_id="".
    enabled: !!sessionId,
    queryKey: ["open-questions-session-meta", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("taxpayer_name, fiscal_year")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);

  // The open path questions to compose from: needs-attention + active,
  // open or already sent to the client.
  const composeInputRows = useMemo(
    () => selectComposeRows(view.groups),
    [view.groups],
  );
  const composeInputIds = useMemo(
    () => composeInputRows.map((row) => row.question_id),
    [composeInputRows],
  );

  // Off-path open rows: the "ask everything" extras.
  const offPathRows = useMemo(
    () =>
      view.groups.later.filter(
        (row) => row.status === "open" || row.status === "taken_to_client",
      ),
    [view.groups.later],
  );

  const rowByQuestionId = useMemo(
    () => new Map(view.rows.map((row) => [row.question_id, row])),
    [view.rows],
  );

  const [letter, setLetter] = useState<ComposedLetter | null>(null);
  const [phase, setPhase] = useState<WorklistPhase>("loading");
  const [composeError, setComposeError] =
    useState<DocumentsWorklist["composeError"]>(null);
  const [composeUnavailable, setComposeUnavailable] = useState(false);
  // The points whose free text is being turned into a Yes/No right now. Drives
  // each card's "Working it out..." state from the mutation, so a realtime
  // refetch flipping a row to 'answered' mid-analyze can't collapse the card
  // and claim success before the AI has actually produced the answer. A set so
  // several cards can be worked out at once (auto-save on blur can start a new
  // one while a previous save is still running) without clobbering each other.
  const [savingPointIds, setSavingPointIds] = useState<Set<string>>(new Set());

  const composingRef = useRef(false);
  const failedSigRef = useRef<string | null>(null);
  // Latest open-set signature, so an in-flight compose can tell whether the
  // result it is about to publish still matches the current open questions.
  const composeInputIdsRef = useRef<string[]>([]);
  useEffect(() => {
    composeInputIdsRef.current = composeInputIds;
  }, [composeInputIds]);

  const settled =
    !view.isLoading && !branchesQuery.isLoading && !prefillsQuery.isLoading;

  // The analysis is finished when the job says so, or every question already
  // has an analysis row. We never compose the points before this, so the set
  // is computed from the COMPLETE suggestions, not a half-finished swarm.
  const jobQuery = usePrefillJob(sessionId);
  // DISTINCT prefilled question ids, not a raw row count: comparing rows against
  // the suggestion map's distinct ids let a duplicate prefill row wedge the gate
  // (rows > distinct forever). Shared predicate: src/lib/prefill/analysisReady.ts.
  const prefillQuestionIdCount = useMemo(
    () => new Set((prefillsQuery.data ?? []).map((p) => p.question_id)).size,
    [prefillsQuery.data],
  );
  const suggestionCount = suggestionsQuery.data?.size ?? 0;
  const readyInput = {
    jobStatus: jobQuery.data?.status,
    prefillQuestionIdCount,
    suggestionQuestionIdCount: suggestionCount,
    totalQuestions: questionCountQuery.data ?? null,
  };
  const swarmDone = isSwarmDone(readyInput);
  // The core/off-path split is walked from the suggestion map, a SEPARATE query
  // from the prefill list (both read atad2_question_prefills but refetch on
  // their own realtime channels). The prefill count can reach full a beat
  // before the suggestion map does; composing in that gap walks a partial path
  // and drops core ("kernvragen") questions into the off-path "other points"
  // list. So also require the suggestion map to have caught up to the prefilled
  // questions. Both settle to the same sub-total on a partial-failure run, so
  // this never hangs waiting for rows the swarm never wrote.
  const analysisDone = isAnalysisReady(readyInput);

  // Hold the points back until the open set stops narrowing. The projected
  // path keeps shrinking as the last document suggestions land, so a set
  // composed too early would visibly drop from N to a smaller N in front of
  // the user. We wait for the set to be stable for a short window after the
  // analysis finishes, then compose once and reveal the minimal set. This
  // only gates the FIRST reveal; later advisor resolutions take the
  // "letter && !stale -> ready" path and never re-hide the list.
  const composeSig = composeInputIds.join("|");
  const [stableSig, setStableSig] = useState<string | null>(null);
  useEffect(() => {
    if (!analysisDone) return;
    const timer = window.setTimeout(() => setStableSig(composeSig), 1200);
    return () => window.clearTimeout(timer);
  }, [composeSig, analysisDone]);
  const openSetStable = analysisDone && stableSig === composeSig;

  const composeNow = useCallback(async () => {
    if (composingRef.current || composeInputRows.length === 0) return;
    composingRef.current = true;
    const sigAtCall = [...composeInputIds].sort().join(",");
    setPhase("composing");
    try {
      const composed = await compose.mutateAsync({
        items: buildComposeItems(composeInputRows, view.resolveText),
        taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
        fiscalYear: sessionMeta?.fiscal_year || "",
      });
      // A realtime refetch may have changed the open set while we composed.
      // Discard a result that no longer matches; the effect recomposes from
      // the fresh set, so we never cache or show a letter missing a question.
      if ([...composeInputIdsRef.current].sort().join(",") !== sigAtCall) {
        return;
      }
      writeCachedLetter(sessionId, composed);
      setLetter(composed);
      setComposeError(null);
      setComposeUnavailable(false);
      setPhase("ready");
      failedSigRef.current = null;
    } catch (e) {
      const err = e as Error;
      if (err instanceof ComposeNotDeployedError) {
        // Degrade gracefully: show the open path questions one per row so the
        // step still works even before the compose action is live.
        setComposeUnavailable(true);
        setComposeError(null);
        setPhase("ready");
      } else {
        setComposeError({ message: err.message, notDeployed: false });
        setPhase("error");
        failedSigRef.current = [...composeInputIds].sort().join(",");
      }
    } finally {
      composingRef.current = false;
    }
  }, [
    compose,
    composeInputRows,
    composeInputIds,
    sessionId,
    sessionMeta,
    view.resolveText,
  ]);

  // Decide what to show: empty, the cached/stable letter, or a fresh compose.
  // Advisor resolutions only shrink the open set, so the letter stays stable;
  // a reopened or new question makes it stale and recomposes.
  useEffect(() => {
    if (!settled) return;
    // Stay on the analysis screen until the documents are fully read, so the
    // "empty" verdict and the first compose are never taken on partial data.
    if (!analysisDone) return;
    if (letter && !letterIsStale(coveredIdsOf(letter), composeInputIds)) {
      // Already revealed and still covering the open set: keep it (advisor
      // resolutions only shrink the set, never re-hide the list).
      setPhase((prev) => (prev === "ready" ? prev : "ready"));
      return;
    }
    if (composeUnavailable) return; // fallback already showing raw rows
    if (composeInputRows.length === 0) {
      setPhase((prev) => (prev === "empty" ? prev : "empty"));
      return;
    }
    if (composingRef.current) return;
    const needSig = [...composeInputIds].sort().join(",");
    if (failedSigRef.current === needSig) return; // don't auto-retry a failure
    if (!openSetStable) {
      // The set is still settling to its minimum; keep "Preparing the points"
      // up rather than flashing a larger list that then shrinks.
      setPhase((prev) => (prev === "composing" ? prev : "composing"));
      return;
    }
    if (!letter) {
      const cached = readCachedLetter(sessionId);
      if (cached && !letterIsStale(coveredIdsOf(cached), composeInputIds)) {
        setLetter(cached);
        setPhase("ready");
        return;
      }
    }
    void composeNow();
  }, [
    settled,
    analysisDone,
    openSetStable,
    composeInputRows.length,
    composeInputIds,
    composeUnavailable,
    letter,
    sessionId,
    composeNow,
  ]);

  const mergedPoints = useMemo(() => {
    if (composeUnavailable) {
      return buildRawPoints(composeInputRows, branches, view.resolveText);
    }
    if (!letter) return [];
    return buildMergedPoints(letter, rowByQuestionId, branches);
  }, [composeUnavailable, composeInputRows, letter, rowByQuestionId, branches, view.resolveText]);

  // Split the merged points against the current projected path: as the advisor
  // answers a gate (and the AI turns it into a Yes/No), the path narrows and
  // open points it routes away from move to the off-path extras, so the
  // advisor never answers a question the flow has ruled out.
  const { pathPoints, offPathPoints } = useMemo(
    () =>
      partitionPointsByPath(
        mergedPoints,
        offPathRows,
        branches,
        view.resolveText,
        view.projectedIds,
      ),
    [mergedPoints, offPathRows, branches, view.resolveText, view.projectedIds],
  );

  const allPoints = useMemo(
    () => [...pathPoints, ...offPathPoints],
    [pathPoints, offPathPoints],
  );

  // Live mirror of allPoints, so the save->analyze step can feed the model
  // every fact the advisor has entered so far without re-subscribing.
  const allPointsRef = useRef<OpenPoint[]>([]);
  useEffect(() => {
    allPointsRef.current = allPoints;
  }, [allPoints]);

  // The documents bundle is the same for every save in this sitting, so build
  // it once and reuse it instead of re-downloading the documents each time.
  const bundleRef = useRef<ReturnType<typeof buildDocumentsBlock> | null>(null);
  // Drop the cache when the session changes, so it can never serve another
  // session's documents into this session's analysis.
  useEffect(() => {
    bundleRef.current = null;
  }, [sessionId]);
  const getBundle = useCallback(() => {
    if (!bundleRef.current) {
      const promise = buildDocumentsBlock(sessionId);
      // Never keep a rejected promise: clear it so "Try saving again" actually
      // re-downloads instead of replaying the same failure all sitting.
      promise.catch(() => {
        if (bundleRef.current === promise) bundleRef.current = null;
      });
      bundleRef.current = promise;
    }
    return bundleRef.current;
  }, [sessionId]);

  /**
   * Turn the advisor's free text into Yes/No + a prepared explanation by
   * re-running the deployed analyze_one for the point's questions, with the
   * advisor's facts (and everything they've answered so far) supplied as an
   * extra document. The model writes the suggestion + toelichting to the
   * prefill rows; the questionnaire reads those, and the fresh Yes/No narrows
   * the projected path. No new edge function or deploy: this reuses the same
   * action the initial analysis uses.
   */
  const analyzeWithContext = useCallback(
    async (point: OpenPoint, context: string) => {
      const bundle = await getBundle();
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const notes: { q: string; ctx: string }[] = [
        { q: point.questionText, ctx: context },
      ];
      for (const other of allPointsRef.current) {
        if (
          other.id !== point.id &&
          (other.status === "answered" || other.status === "answered_by_client") &&
          other.answerDetail
        ) {
          notes.push({ q: other.questionText, ctx: other.answerDetail });
        }
      }
      const notesBlock =
        `<document category="advisor_input" doc_label="Advisor notes for this assessment">\n` +
        notes
          .map((n) => `Question: ${esc(n.q)}\nWhat the advisor knows: ${esc(n.ctx)}`)
          .join("\n\n") +
        `\n</document>`;
      const documentsBlock = [bundle.textBlock, notesBlock]
        .filter(Boolean)
        .join("\n\n");

      const { data: rawQuestions, error: questionsError } = await supabase
        .from("atad2_questions")
        .select("question_id, question, question_explanation")
        .in("question_id", point.nodeIds);
      if (questionsError) throw questionsError;
      const officialById = new Map<
        string,
        { question: string; question_explanation: string | null }
      >();
      for (const q of rawQuestions ?? []) {
        if (!officialById.has(q.question_id)) officialById.set(q.question_id, q);
      }

      // runAnalyzePool swallows worker rejections (Promise.allSettled), so the
      // worker MUST collect its own failures; otherwise a fully-failed analysis
      // would resolve silently and the card would claim success.
      const failures: string[] = [];
      await runAnalyzePool(point.nodeIds, async (questionId) => {
        const official = officialById.get(questionId);
        if (!official) {
          failures.push(`${questionId}: question text not found`);
          return;
        }
        try {
          await invokePrefillFn({
            action: "analyze_one",
            session_id: sessionId,
            question_id: questionId,
            question_text: official.question,
            question_explanation: official.question_explanation ?? "",
            documents_block: documentsBlock,
            image_refs: bundle.imageRefs,
            pdf_refs: bundle.pdfRefs,
            taxpayer_name: bundle.taxpayerName,
            fiscal_year: bundle.fiscalYear,
          });
        } catch (e) {
          failures.push(`${questionId}: ${(e as Error).message}`);
        }
      });
      // Surface a total failure so the save warns (the free text is already
      // stored); a partial success still classified some of the point's nodes.
      if (point.nodeIds.length > 0 && failures.length === point.nodeIds.length) {
        throw new Error(failures[0]);
      }
    },
    [getBundle, sessionId],
  );

  // Points currently routed to the client: the "Copy points for client" set.
  const sentPoints = useMemo(
    () => allPoints.filter((point) => point.status === "sent_to_client"),
    [allPoints],
  );

  // Questions the documents answered on their own: prefills with a definitive
  // suggestion above the questionnaire's display threshold. Shown in the
  // result header as the value the analysis already created.
  const autoAnsweredCount = useMemo(
    () =>
      (prefillsQuery.data ?? []).filter(
        (prefill) =>
          (prefill.suggested_answer === "yes" ||
            prefill.suggested_answer === "no") &&
          (prefill.confidence_pct ?? 0) >= 40,
      ).length,
    [prefillsQuery.data],
  );
  const totalQuestions = questionCountQuery.data ?? null;

  const fingerprint = useMemo(
    () => worklistFingerprint(allPoints),
    [allPoints],
  );
  // The stored submit record changes only when a submit writes it (set
  // directly below) or when the session changes (re-read in the effect).
  // draftsUpToDate compares it against the live fingerprint, which recomputes
  // every render as the advisor resolves points.
  const [lastSubmit, setLastSubmit] = useState<StoredDraftSubmit | null>(() =>
    readStoredSubmit(sessionId),
  );
  useEffect(() => {
    setLastSubmit(readStoredSubmit(sessionId));
  }, [sessionId]);
  const draftsUpToDate =
    lastSubmit !== null && lastSubmit.fingerprint === fingerprint;

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["open-questions", sessionId] });
    qc.invalidateQueries({ queryKey: ["session-answer-map", sessionId] });
  }, [qc, sessionId]);

  // ---- per-point actions (loop over every covered register row) -----------

  const saveAnswerMutation = useMutation({
    mutationFn: async ({
      point,
      value,
      detail,
    }: {
      point: OpenPoint;
      value: "yes" | "no" | null;
      detail: string;
    }) => {
      const text = serializeAnswer(value, detail);
      if (!text) throw new Error("The answer is empty");
      const now = new Date().toISOString();
      const ids = point.coveredRows.map((row) => row.id);
      const { error } = await supabase
        .from("atad2_open_questions")
        .update({ client_answer: text, client_answer_at: now, status: "answered" })
        .in("id", ids);
      if (error) throw error;
      await Promise.all(
        point.nodeIds.map((nodeId) =>
          logEvent(nodeId, "answer_saved", { chars: text.length }),
        ),
      );
      // Turn the facts into Yes/No + a prepared explanation. A failed analysis
      // never loses the saved context: the questionnaire just shows the point
      // as unknown until a re-save succeeds.
      try {
        await analyzeWithContext(point, text);
      } catch (e) {
        console.warn("[documents-worklist] context analysis failed", e);
        toast.error(
          "Saved your input, but couldn't work out the answer yet. Try saving again.",
        );
      }
    },
    onSuccess: () => {
      invalidate();
      // The fresh suggestion drives both the questionnaire and the projected
      // path (which prunes questions the answer routes away from).
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
      qc.invalidateQueries({ queryKey: ["suggested-answer-map", sessionId] });
    },
    onError: (e: Error) =>
      toast.error("Could not save the answer", { description: e.message }),
  });

  const askClientMutation = useMutation({
    mutationFn: async ({ point }: { point: OpenPoint }) => {
      const ids = point.coveredRows.map((row) => row.id);
      const { error } = await supabase
        .from("atad2_open_questions")
        .update({
          status: "taken_to_client",
          taken_to_client_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
      await Promise.all(
        point.nodeIds.map((nodeId) => logEvent(nodeId, "marked_sent")),
      );
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) =>
      toast.error("Could not add the question to the client letter", {
        description: e.message,
      }),
  });

  const markNaMutation = useMutation({
    mutationFn: async ({
      point,
      reason,
    }: {
      point: OpenPoint;
      reason: string;
    }) => {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error("A short reason is required");
      const now = new Date().toISOString();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      // Covered nodes split three ways:
      //  - a recorded Unknown -> confirm via atad2_answers (the memo-gate
      //    truth; the register follows by trigger);
      //  - a recorded Yes/No -> skip: the question is already definitively
      //    answered, so N/a does not apply and a register-only confirm would
      //    both diverge from the gate truth and violate the answers CHECK
      //    constraint. Editing the recorded answer is the way to change it.
      //  - no answer row -> update the register row directly.
      const confirmNodeIds: string[] = [];
      const directRows: { id: string; questionId: string }[] = [];
      for (const row of point.coveredRows) {
        const recorded = view.answerMap.get(row.question_id);
        if (recorded === "Unknown") {
          confirmNodeIds.push(row.question_id);
        } else if (recorded === "Yes" || recorded === "No") {
          // Skip: already definitively answered (see comment above).
        } else {
          directRows.push({ id: row.id, questionId: row.question_id });
        }
      }

      if (confirmNodeIds.length > 0) {
        if (!userId) throw new Error("Not authenticated");
        const { error } = await supabase
          .from("atad2_answers")
          .update({
            unknown_confirmed_at: now,
            unknown_confirmed_by: userId,
            unknown_confirmed_note: trimmed,
          })
          .eq("session_id", sessionId)
          .in("question_id", confirmNodeIds);
        if (error) throw error;
        // The atad2_answers update is audited by the M1 answer-events trigger.
      }
      if (directRows.length > 0) {
        const { error } = await supabase
          .from("atad2_open_questions")
          .update({
            status: "confirmed_unknown",
            resolution_note: trimmed,
            resolved_at: now,
          })
          .in("id", directRows.map((row) => row.id));
        if (error) throw error;
        // Register-only confirm has no trigger, so log the judgement here.
        await Promise.all(
          directRows.map((row) =>
            logEvent(row.questionId, "confirmed_unknown", {
              note: trimmed,
              on_path: false,
            }),
          ),
        );
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) =>
      toast.error("Could not mark the point as not applicable", {
        description: e.message,
      }),
  });

  const reopenMutation = useMutation({
    mutationFn: async ({ point }: { point: OpenPoint }) => {
      // Reopen is deliberately not audited: the open-question events CHECK has
      // no 'reopened' verb, and adding one needs a VM migration. Reopening
      // merely moves a row back to open; the next resolution is what records
      // the advisor's judgement in the trail.
      const confirmedUnknownNodeIds: string[] = [];
      const directRowIds: string[] = [];
      for (const row of point.coveredRows) {
        if (
          row.status === "confirmed_unknown" &&
          view.answerMap.get(row.question_id) === "Unknown"
        ) {
          confirmedUnknownNodeIds.push(row.question_id);
        } else {
          directRowIds.push(row.id);
        }
      }
      if (confirmedUnknownNodeIds.length > 0) {
        const { error } = await supabase
          .from("atad2_answers")
          .update({
            unknown_confirmed_at: null,
            unknown_confirmed_by: null,
            unknown_confirmed_note: null,
          })
          .eq("session_id", sessionId)
          .in("question_id", confirmedUnknownNodeIds);
        if (error) throw error;
      }
      if (directRowIds.length > 0) {
        const { error } = await supabase
          .from("atad2_open_questions")
          .update({
            status: "open",
            resolved_at: null,
            resolution_note: null,
            taken_to_client_at: null,
          })
          .in("id", directRowIds);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) =>
      toast.error("Could not reopen the point", { description: e.message }),
  });

  // Paste client reply: the advisor pastes the client's email as one block.
  // INTERIM behavior until the AI distribution endpoint exists: the reply is
  // stored as context on every point currently with the client and those
  // points move to Answered (the advisor then trims each one). The badge reads
  // "Answered" because taken_to_client_at stays set.
  // TODO(ai): replace with an edge action that reads the reply and distributes
  // the relevant facts to the right points (the same context -> mapping the
  // per-point read-back will use), instead of copying the whole block.
  const pasteReplyMutation = useMutation({
    mutationFn: async (text: string): Promise<number> => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Paste the client's reply first");
      const sentRowIds = sentPoints.flatMap((point) =>
        point.coveredRows.map((row) => row.id),
      );
      if (sentRowIds.length === 0) return 0;
      const now = new Date().toISOString();
      const stored = trimmed.length <= 4000 ? trimmed : `${trimmed.slice(0, 3997)}...`;
      const { error } = await supabase
        .from("atad2_open_questions")
        .update({ client_answer: stored, client_answer_at: now, status: "answered" })
        .in("id", sentRowIds);
      if (error) throw error;
      await Promise.all(
        sentPoints.flatMap((point) =>
          point.nodeIds.map((nodeId) =>
            logEvent(nodeId, "answer_saved", { source: "client_reply" }),
          ),
        ),
      );
      return sentPoints.length;
    },
    onSuccess: (count) => {
      invalidate();
      if (count > 0) {
        toast.success(
          count === 1
            ? "Recorded the reply against 1 point. Review and trim it."
            : `Recorded the reply against ${count} points. Review and trim each.`,
        );
      }
    },
    onError: (e: Error) =>
      toast.error("Could not record the client reply", { description: e.message }),
  });

  const submitMutation = useMutation({
    mutationFn: async (): Promise<SubmitDraftsResult> => {
      const prefillIdByQuestionId = new Map(
        (prefillsQuery.data ?? []).map((prefill) => [
          prefill.question_id,
          prefill.id,
        ]),
      );
      // Answered points were already turned into Yes/No + text by the AI when
      // they were saved, so submit only drafts the "unknown + note" rows for
      // points sent to the client or marked not applicable. Writing answered
      // points here would overwrite the AI's suggestion with 'unknown'.
      const pendingPoints = allPoints.filter(
        (point) => point.status === "sent_to_client" || point.status === "na",
      );
      const plan = planDraftWrites(
        pendingPoints,
        prefillIdByQuestionId,
        view.answerMap,
      );
      const failures: string[] = [];
      let written = 0;
      await Promise.all(
        plan.writes.map(async (write) => {
          const { error } = await supabase
            .from("atad2_question_prefills")
            .update(write.patch)
            .eq("id", write.prefillId);
          if (error) failures.push(`${write.questionId}: ${error.message}`);
          else written += 1;
        }),
      );
      if (failures.length > 0 && written === 0 && plan.writes.length > 0) {
        throw new Error(failures[0]);
      }
      // The result count reflects everything now in the questionnaire: the
      // answered points (AI-classified on save) plus the pending drafts.
      const answeredPointCount = allPoints.filter(
        (point) =>
          point.status === "answered" || point.status === "answered_by_client",
      ).length;
      const record: StoredDraftSubmit = {
        v: 1,
        fingerprint,
        submittedAt: new Date().toISOString(),
        written: answeredPointCount + written,
      };
      try {
        localStorage.setItem(
          draftSubmitStorageKey(sessionId),
          encodeStoredDraftSubmit(record),
        );
      } catch {
        // Storage unavailable: the submit still happened; only the
        // "up to date" shortcut is lost on the next visit.
      }
      // Reflect the just-written record so draftsUpToDate flips immediately.
      setLastSubmit(record);
      return { written: record.written, skipped: plan.skipped.length + failures.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
      qc.invalidateQueries({ queryKey: ["suggested-answer-map", sessionId] });
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Could not update the draft answers", {
        description: e.message,
      }),
  });

  const busy =
    saveAnswerMutation.isPending ||
    askClientMutation.isPending ||
    markNaMutation.isPending ||
    reopenMutation.isPending;

  const resolvedPhase: WorklistPhase = !settled ? "loading" : phase;

  return {
    phase: resolvedPhase,
    composeError,
    pathPoints,
    offPathPoints,
    openPoints: openCount(pathPoints),
    resolvedPoints: resolvedCount(pathPoints),
    totalPathPoints: pathPoints.length,
    autoAnsweredCount,
    totalQuestions,
    sentPoints,
    taxpayerName: sessionMeta?.taxpayer_name ?? null,
    fiscalYear: sessionMeta?.fiscal_year ?? null,
    resolveText: view.resolveText,
    draftsUpToDate,
    lastSubmit,
    busy,
    savingPointIds,
    recompose: () => {
      failedSigRef.current = null;
      void composeNow();
    },
    saveContext: async (point, context) => {
      setSavingPointIds((prev) => new Set(prev).add(point.id));
      try {
        await saveAnswerMutation.mutateAsync({ point, value: null, detail: context });
      } finally {
        setSavingPointIds((prev) => {
          const next = new Set(prev);
          next.delete(point.id);
          return next;
        });
      }
    },
    askClient: async (point) => {
      await askClientMutation.mutateAsync({ point });
    },
    markNa: async (point, reason) => {
      await markNaMutation.mutateAsync({ point, reason });
    },
    reopen: async (point) => {
      await reopenMutation.mutateAsync({ point });
    },
    pasteClientReply: (text) => pasteReplyMutation.mutateAsync(text),
    pasting: pasteReplyMutation.isPending,
    submitting: submitMutation.isPending,
    submit: () => submitMutation.mutateAsync(),
  };
}
