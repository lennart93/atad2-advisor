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

export function useUpsertAdminQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      values: Partial<AdminQuestion> & {
        question_id: string;
        question: string;
        answer_option: string;
      }
    ) => {
      const { error } = await supabase
        .from("atad2_questions")
        .upsert(values)
        .select()
        .maybeSingle();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question saved");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });
}

export function useDeleteAdminQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atad2_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });
}
