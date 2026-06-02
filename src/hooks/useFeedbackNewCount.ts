import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAccess } from "@/hooks/useAdminAccess";

/**
 * Count of feedback rows still in `status = 'new'`. Used for the
 * unread-style badge on the admin sidebar and dashboard tile.
 * Returns 0 for non-staff (the SELECT is RLS-blocked anyway).
 */
export function useFeedbackNewCount(): number {
  const { hasAccess } = useAdminAccess();

  const { data } = useQuery({
    queryKey: ["admin-feedback-new-count"],
    enabled: hasAccess,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("atad2_feedback")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (error) return 0;
      return count ?? 0;
    },
  });

  return data ?? 0;
}
