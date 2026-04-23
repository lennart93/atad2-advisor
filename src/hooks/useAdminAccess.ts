import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface AdminAccess {
  isAdmin: boolean;
  isModerator: boolean;
  hasAccess: boolean;
  canEdit: boolean;
  isLoading: boolean;
}

export function useAdminAccess(): AdminAccess {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-access", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      if (!user) return { isAdmin: false, isModerator: false };
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) return { isAdmin: false, isModerator: false };
      const roles = new Set((data ?? []).map((r) => r.role));
      return {
        isAdmin: roles.has("admin"),
        isModerator: roles.has("moderator"),
      };
    },
  });

  const isAdmin = Boolean(data?.isAdmin);
  const isModerator = Boolean(data?.isModerator);
  return {
    isAdmin,
    isModerator,
    hasAccess: isAdmin || isModerator,
    canEdit: isAdmin,
    isLoading: isLoading && !!user,
  };
}
