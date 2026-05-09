import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

const AppLayout = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const isAdminRoute = location.pathname.startsWith("/admin");

  const { hasAccess, isAdmin, isModerator } = useAdminAccess();

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
      <header className="sticky top-0 z-40 border-b border-[hsl(var(--border-subtle))] bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
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
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {hasAccess ? (
              <Button
                variant="secondary"
                size="sm"
                className={cn(
                  "h-9 transition-all",
                  isAdminRoute && "ring-1 ring-primary/30"
                )}
                aria-current={isAdminRoute ? "page" : undefined}
                data-active={isAdminRoute}
                asChild
              >
                <Link to="/admin" state={{ from: location }}>
                  {isAdmin ? "Admin" : isModerator ? "Moderator" : "Admin"}
                </Link>
              </Button>
            ) : null}
            {user && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
                Sign out
              </Button>
            )}
          </div>
        </div>
      </header>
      <CommandPalette />

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
