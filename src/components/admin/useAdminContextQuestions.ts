import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface AdminContextQuestion {
  id: string;
  question_id: string;
  context_question: string;
  answer_trigger: string;
  created_at?: string;
}

export function useAdminContextQuestionsList() {
  return useQuery({
    queryKey: ["admin-context-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_context_questions")
        .select("*")
        .limit(2000);
      if (error) throw error;
      const rows = (data ?? []) as AdminContextQuestion[];
      return rows.sort((a, b) =>
        a.question_id.localeCompare(b.question_id, undefined, { numeric: true })
      );
    },
    staleTime: 30_000,
  });
}

export function useUpsertAdminContextQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      values: Partial<AdminContextQuestion> & {
        question_id: string;
        context_question: string;
        answer_trigger: string;
      }
    ) => {
      const { error } = await supabase
        .from("atad2_context_questions")
        .upsert(values)
        .select()
        .maybeSingle();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Context question saved");
      qc.invalidateQueries({ queryKey: ["admin-context-questions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Save failed"),
  });
}

export function useDeleteAdminContextQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("atad2_context_questions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Context question deleted");
      qc.invalidateQueries({ queryKey: ["admin-context-questions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });
}
