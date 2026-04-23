import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface AdminQuestion {
  id: string;
  question_id: string;
  question_title: string | null;
  question: string;
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
  difficult_term: string | null;
  term_explanation: string | null;
  question_explanation: string | null;
  created_at?: string;
}

export interface Branch {
  id: string;
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
}

export type SharedFieldKey =
  | "question"
  | "question_title"
  | "question_explanation"
  | "difficult_term"
  | "term_explanation";

export interface FieldConflict {
  field: SharedFieldKey;
  /** per-branch value, keyed by answer_option */
  byAnswer: Record<string, string | null>;
}

export interface GroupedQuestion {
  question_id: string;
  question_title: string | null;
  question: string;
  difficult_term: string | null;
  term_explanation: string | null;
  question_explanation: string | null;
  branches: Branch[];
  /** true when shared fields differ across rows for this question_id — data-integrity warning */
  outOfSync: boolean;
  /** per-field list of conflicting values across branches (only fields with a real conflict) */
  conflicts: FieldConflict[];
}

const DEFAULT_ANSWER_ORDER = ["Yes", "No", "Unknown"];

function sortBranches(branches: Branch[]): Branch[] {
  return [...branches].sort((a, b) => {
    const ai = DEFAULT_ANSWER_ORDER.indexOf(a.answer_option);
    const bi = DEFAULT_ANSWER_ORDER.indexOf(b.answer_option);
    if (ai === -1 && bi === -1) return a.answer_option.localeCompare(b.answer_option);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/**
 * Pick the "best" shared value across branches:
 *   - if all distinct non-empty values agree → return that value
 *   - if only some branches have a value → return the first non-empty (null/"" treated as missing)
 *   - if multiple different non-empty values exist → conflict, return first; caller flags `outOfSync`
 */
function resolveShared<K extends keyof AdminQuestion>(
  rows: AdminQuestion[],
  key: K
): { value: AdminQuestion[K]; conflict: boolean } {
  const nonEmpty = rows
    .map((r) => r[key])
    .filter((v) => v !== null && v !== undefined && v !== "");
  if (nonEmpty.length === 0) {
    return { value: rows[0][key], conflict: false };
  }
  const distinct = Array.from(new Set(nonEmpty.map((v) => String(v))));
  return {
    value: nonEmpty[0],
    conflict: distinct.length > 1,
  };
}

export function groupByQuestionId(rows: AdminQuestion[]): GroupedQuestion[] {
  const map = new Map<string, AdminQuestion[]>();
  rows.forEach((r) => {
    const bucket = map.get(r.question_id) ?? [];
    bucket.push(r);
    map.set(r.question_id, bucket);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([question_id, group]) => {
      const question = resolveShared(group, "question");
      const title = resolveShared(group, "question_title");
      const explanation = resolveShared(group, "question_explanation");
      const difficult = resolveShared(group, "difficult_term");
      const termExpl = resolveShared(group, "term_explanation");

      const conflictSpec: { key: SharedFieldKey; hit: boolean }[] = [
        { key: "question", hit: question.conflict },
        { key: "question_title", hit: title.conflict },
        { key: "question_explanation", hit: explanation.conflict },
        { key: "difficult_term", hit: difficult.conflict },
        { key: "term_explanation", hit: termExpl.conflict },
      ];
      const conflicts: FieldConflict[] = conflictSpec
        .filter((c) => c.hit)
        .map((c) => ({
          field: c.key,
          byAnswer: Object.fromEntries(
            group.map((r) => [r.answer_option, (r[c.key] as string | null) ?? null])
          ),
        }));

      return {
        question_id,
        question: (question.value as string) ?? "",
        question_title: (title.value as string | null) ?? null,
        question_explanation: (explanation.value as string | null) ?? null,
        difficult_term: (difficult.value as string | null) ?? null,
        term_explanation: (termExpl.value as string | null) ?? null,
        branches: sortBranches(
          group.map((r) => ({
            id: r.id,
            answer_option: r.answer_option,
            risk_points: Number(r.risk_points) || 0,
            next_question_id: r.next_question_id,
          }))
        ),
        outOfSync: conflicts.length > 0,
        conflicts,
      };
    });
}

export function useAdminQuestionsList() {
  return useQuery({
    queryKey: ["admin-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("*")
        .order("question_id", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as AdminQuestion[];
    },
    staleTime: 30_000,
  });
}

export function useAdminGroupedQuestions() {
  const { data, isLoading, error } = useAdminQuestionsList();
  const grouped = useMemo(() => groupByQuestionId(data ?? []), [data]);
  return { data: grouped, isLoading, error };
}

export interface SaveGroupedInput {
  question_id: string;
  question_title: string | null;
  question: string;
  difficult_term: string | null;
  term_explanation: string | null;
  question_explanation: string | null;
  branches: Branch[];
  isNew: boolean;
}

export function useSaveGroupedQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveGroupedInput) => {
      const sharedFields = {
        question_id: input.question_id,
        question_title: input.question_title,
        question: input.question,
        difficult_term: input.difficult_term,
        term_explanation: input.term_explanation,
        question_explanation: input.question_explanation,
      };

      if (input.isNew) {
        const rows = input.branches.map((b) => ({
          ...sharedFields,
          answer_option: b.answer_option,
          risk_points: b.risk_points,
          next_question_id: b.next_question_id || null,
        }));
        const { error } = await supabase.from("atad2_questions").insert(rows);
        if (error) throw error;
        return;
      }

      const rows = input.branches.map((b) => ({
        id: b.id,
        ...sharedFields,
        answer_option: b.answer_option,
        risk_points: b.risk_points,
        next_question_id: b.next_question_id || null,
      }));
      const { error } = await supabase
        .from("atad2_questions")
        .upsert(rows, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question saved");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });
}

export function useDeleteGroupedQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (question_id: string) => {
      const { error } = await supabase
        .from("atad2_questions")
        .delete()
        .eq("question_id", question_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });
}
