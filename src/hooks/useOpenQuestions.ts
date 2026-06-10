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
    const channel = supabase
      .channel(`open-questions-${sessionId}`)
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
 * question_id -> answer ('Yes' | 'No' | 'Unknown') for this session.
 * Presence of a key means the question is on the answered path (on-path).
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
  /** Needs attention + on-path active rows; off-path and history excluded. */
  badgeCount: number;
  /** question_id -> 'Yes' | 'No' | 'Unknown'; key presence = on-path. */
  answerMap: Map<string, string>;
  /** Display text: client_question, else official text, else fixed sentence. */
  resolveText: (row: OpenQuestionRow) => string;
  isLoading: boolean;
}

/**
 * Composed view for the panel, sheet, stream and sub-header button: live
 * rows grouped with the T1 precedence rules, the badge count, and a text
 * resolver with the official-question fallback wired in.
 */
export function useOpenQuestionsView(sessionId: string | null): OpenQuestionsView {
  const rowsQuery = useOpenQuestions(sessionId);
  const textsQuery = useQuestionTexts();
  const answersQuery = useSessionAnswerMap(sessionId);

  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const answerMap = useMemo(
    () => answersQuery.data ?? new Map<string, string>(),
    [answersQuery.data],
  );
  const questionTexts = useMemo(
    () => textsQuery.data ?? new Map<string, string>(),
    [textsQuery.data],
  );

  const groups = useMemo(
    () => groupOpenQuestions(rows, new Set(answerMap.keys())),
    [rows, answerMap],
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
    resolveText,
    isLoading: rowsQuery.isLoading || textsQuery.isLoading || answersQuery.isLoading,
  };
}
