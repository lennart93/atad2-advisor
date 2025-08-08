import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import NotAuthorized from "@/pages/NotAuthorized";

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading } = useAuth();

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (error) {
        console.error("has_role rpc error", error);
        return false;
      }
      return Boolean(data);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Bezig met laden...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <NotAuthorized />;
  }

  return <>{children}</>;
};

export default AdminRoute;
