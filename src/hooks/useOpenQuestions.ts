import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";
import {
  countActiveOpenQuestions,
  groupOpenQuestions,
  resolveClientQuestion,
  type OpenQuestionGroups,
} from "@/lib/openQuestions/grouping";
import {
  computeProjectedPath,
  type QuestionBranchRow,
} from "@/lib/openQuestions/projectedPath";

/**
 * Live register rows for one session. Clones the proven realtime pattern of
 * useAllPrefills (usePrefill.ts). The realtime event also invalidates the
 * session answer map: the DB triggers write the register whenever the
 * relevant answer columns change, so register events are a reliable proxy
 * for answer changes and we avoid a second channel on atad2_answers.
 */
export function useOpenQuestions(sessionId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    enabled: !!sessionId,
    queryKey: ["open-questions", sessionId],
    queryFn: async (): Promise<OpenQuestionRow[]> => {
      const { data, error } = await supabase
        .from("atad2_open_questions")
        .select("*")
        .eq("session_id", sessionId!);
      if (error) throw error;
      return (data ?? []) as OpenQuestionRow[];
    },
  });

  useEffect(() => {
    if (!sessionId) return;
    // Unique topic per mount: supabase.channel() returns the EXISTING channel
    // for a duplicate topic, so several simultaneous consumers (sub-header
    // button, sheet, page panel, analysis stream) would share one channel.
    // Then one consumer's cleanup would remove the shared channel and kill
    // realtime for the others, and a same-commit double mount can error the
    // join with a bindings mismatch. A unique suffix gives each mount its own
    // channel; identical postgres_changes filters across channels are fine.
    const topic = `open-questions-${sessionId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atad2_open_questions", filter: `session_id=eq.${sessionId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["open-questions", sessionId] });
          qc.invalidateQueries({ queryKey: ["session-answer-map", sessionId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, qc]);

  return query;
}

/**
 * Official question text per question_id. atad2_questions holds one row per
 * answer option, so rows are deduped by question_id (same pattern as the
 * question count in AnalyzeProgress).
 */
export function useQuestionTexts() {
  return useQuery({
    queryKey: ["atad2-question-texts"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("question_id, question");
      if (error) throw error;
      const byId = new Map<string, string>();
      for (const row of data ?? []) {
        if (!byId.has(row.question_id)) byId.set(row.question_id, row.question);
      }
      return byId;
    },
  });
}

/**
 * The questionnaire branching rows: one row per (question_id, answer_option)
 * with the next_question_id edge. This is the SAME table the real flow walks
 * (the replay loop in Assessment.tsx); computeProjectedPath consumes it
 * directly so there is no second copy of the tree. Static data, cached 1h.
 */
export function useQuestionBranches() {
  return useQuery({
    queryKey: ["atad2-question-branches"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<QuestionBranchRow[]> => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("question_id, answer_option, next_question_id");
      if (error) throw error;
      return (data ?? []) as QuestionBranchRow[];
    },
  });
}

/**
 * question_id -> suggested_answer ('yes' | 'no' | 'unknown' | null) from the
 * AI prefills of this session. Feeds the projected-path walk: suggestions
 * steer the branching wherever no recorded answer exists yet.
 */
export function useSuggestedAnswerMap(sessionId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    enabled: !!sessionId,
    queryKey: ["suggested-answer-map", sessionId],
    queryFn: async (): Promise<Map<string, string | null>> => {
      const { data, error } = await supabase
        .from("atad2_question_prefills")
        .select("question_id, suggested_answer")
        .eq("session_id", sessionId!);
      if (error) throw error;
      const byId = new Map<string, string | null>();
      for (const row of data ?? []) {
        byId.set(row.question_id, row.suggested_answer);
      }
      return byId;
    },
  });

  useEffect(() => {
    if (!sessionId) return;
    // Unique topic per mount, same reasoning as in useOpenQuestions above:
    // supabase.channel() returns the EXISTING channel for a duplicate topic,
    // so several simultaneous consumers (sub-header button, sheet, page
    // panel, analysis stream) would share one channel and one consumer's
    // cleanup would kill realtime for the others. Deliberately NOT reusing
    // useAllPrefills: its fixed topic `question-prefills-${sessionId}`
    // collides when those consumers mount together.
    const topic = `suggested-answers-${sessionId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atad2_question_prefills", filter: `session_id=eq.${sessionId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["suggested-answer-map", sessionId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, qc]);

  return query;
}

/**
 * question_id -> answer ('Yes' | 'No' | 'Unknown') for this session.
 * Presence of a key means an answer row exists for the question.
 * Invalidation rides on the register realtime channel in useOpenQuestions.
 */
export function useSessionAnswerMap(sessionId: string | null) {
  return useQuery({
    enabled: !!sessionId,
    queryKey: ["session-answer-map", sessionId],
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("atad2_answers")
        .select("question_id, answer")
        .eq("session_id", sessionId!);
      if (error) throw error;
      const byId = new Map<string, string>();
      for (const row of data ?? []) {
        byId.set(row.question_id, row.answer);
      }
      return byId;
    },
  });
}

export interface OpenQuestionsView {
  rows: OpenQuestionRow[];
  groups: OpenQuestionGroups;
  /** Needs attention + projected-path active rows; later and history excluded. */
  badgeCount: number;
  /** question_id -> 'Yes' | 'No' | 'Unknown'; key presence = answer row exists. */
  answerMap: Map<string, string>;
  /**
   * Question ids reachable when the questionnaire is walked with recorded
   * answers first, then AI suggestions, exploring all branches of unknowns.
   */
  projectedIds: Set<string>;
  /** Display text: client_question, else official text, else fixed sentence. */
  resolveText: (row: OpenQuestionRow) => string;
  isLoading: boolean;
}

/**
 * Composed view for the panel, sheet, stream and sub-header button: live
 * rows grouped by the projected questionnaire path, the badge count, and a
 * text resolver with the official-question fallback wired in.
 */
export function useOpenQuestionsView(sessionId: string | null): OpenQuestionsView {
  const rowsQuery = useOpenQuestions(sessionId);
  const textsQuery = useQuestionTexts();
  const answersQuery = useSessionAnswerMap(sessionId);
  const branchesQuery = useQuestionBranches();
  const suggestionsQuery = useSuggestedAnswerMap(sessionId);

  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const answerMap = useMemo(
    () => answersQuery.data ?? new Map<string, string>(),
    [answersQuery.data],
  );
  const questionTexts = useMemo(
    () => textsQuery.data ?? new Map<string, string>(),
    [textsQuery.data],
  );
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const suggestionMap = useMemo(
    () => suggestionsQuery.data ?? new Map<string, string | null>(),
    [suggestionsQuery.data],
  );

  const projectedIds = useMemo(
    () => computeProjectedPath(branches, answerMap, suggestionMap),
    [branches, answerMap, suggestionMap],
  );
  const groups = useMemo(
    () => groupOpenQuestions(rows, projectedIds),
    [rows, projectedIds],
  );
  const badgeCount = useMemo(() => countActiveOpenQuestions(groups), [groups]);
  const resolveText = useMemo(
    () => (row: OpenQuestionRow) => resolveClientQuestion(row, questionTexts),
    [questionTexts],
  );

  return {
    rows,
    groups,
    badgeCount,
    answerMap,
    projectedIds,
    resolveText,
    // The branch and suggestion queries are part of the loading gate so the
    // filtered view never renders from a half-loaded (empty) projected path.
    isLoading:
      rowsQuery.isLoading ||
      textsQuery.isLoading ||
      answersQuery.isLoading ||
      branchesQuery.isLoading ||
      suggestionsQuery.isLoading,
  };
}
