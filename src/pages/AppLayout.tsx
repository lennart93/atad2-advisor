import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminAccess } from "@/hooks/useAdminAccess";

const AppLayout = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const isAdminRoute = location.pathname.startsWith("/admin");

  const { hasAccess: isAdmin } = useAdminAccess();

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

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="relative border-b border-[hsl(var(--border-subtle))] bg-surface-header after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-[hsl(var(--border-default))] after:to-transparent">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/"
                    aria-label="To dashboard"
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <AnimatedLogo size={36} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom">To dashboard</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">ATAD2 risk assessment</h1>
              {user && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Welcome back, {userProfile?.first_name || user.email?.split('@')[0]}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
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

    </div>
  );
};

export default AppLayout;
