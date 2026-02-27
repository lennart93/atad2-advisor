import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FeedbackWidget } from "@/components/FeedbackWidget";

const AppLayout = () => {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAdminRoute = location.pathname.startsWith("/admin");
  const from = (location.state as any)?.from?.pathname || "/";

  const { data: isAdmin } = useQuery({
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

  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("user_id", user.id)
        .single();
      if (error) {
        console.error("Profile fetch error", error);
        return null;
      }
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(from);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/lovable-uploads/new-logo.png" 
              alt="Company Logo" 
              className="h-8 w-8 object-contain"
            />
            <div>
              <h1 className="text-base sm:text-lg font-semibold">ATAD2 risk assessment</h1>
              {user && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Welcome back, {userProfile?.first_name || user.email?.split('@')[0]}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdminRoute && (
              <Button variant="outline" size="sm" onClick={handleBack} aria-label="Back">
                Terug
              </Button>
            )}
            {isAdmin ? (
              <Button variant="secondary" asChild>
                <Link to="/admin" state={{ from: location }}>Admin</Link>
              </Button>
            ) : null}
            {user && (
              <Button variant="outline" onClick={handleSignOut}>Sign out</Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      {isAdminRoute ? (
        <Outlet />
      ) : (
        <main className="p-4">
          <div className="max-w-4xl mx-auto">
            <Outlet />
          </div>
        </main>
      )}

      <FeedbackWidget />
    </div>
  );
};

export default AppLayout;
