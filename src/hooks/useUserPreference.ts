import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUserPreference() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    enabled: !!user?.id,
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("before_you_start_dismissed")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ before_you_start_dismissed: true })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", user?.id] }),
  });

  return {
    dismissed: !!profile.data?.before_you_start_dismissed,
    isLoading: profile.isLoading,
    dismiss: dismiss.mutateAsync,
  };
}
