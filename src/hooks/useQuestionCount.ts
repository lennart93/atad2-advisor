import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useQuestionCount() {
  return useQuery({
    queryKey: ["question-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("question_id");
      if (error) throw error;
      const uniq = new Set((data ?? []).map((q) => q.question_id));
      return uniq.size;
    },
    staleTime: 5 * 60_000,
  });
}
