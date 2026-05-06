import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Home, FileText, Users, Plus, LogOut, Sun, Moon, Sparkles, Activity,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { hasAccess: adminAccess } = useAdminAccess();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (path: string) => () => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search commands…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={go("/")}>
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={go("/assessment")}>
            <Plus className="mr-2 h-4 w-4" />
            New assessment
          </CommandItem>
        </CommandGroup>

        {adminAccess && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Admin">
              <CommandItem onSelect={go("/admin/dashboard")}>
                <Activity className="mr-2 h-4 w-4" />
                Admin hub
              </CommandItem>
              <CommandItem onSelect={go("/admin/sessions")}>
                <FileText className="mr-2 h-4 w-4" />
                Sessions
              </CommandItem>
              <CommandItem onSelect={go("/admin/users")}>
                <Users className="mr-2 h-4 w-4" />
                Users
              </CommandItem>
              <CommandItem onSelect={go("/admin/prefill-prompts")}>
                <Sparkles className="mr-2 h-4 w-4" />
                Pre-fill prompts
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {resolvedTheme === "dark" ? (
              <><Sun className="mr-2 h-4 w-4" />Switch to light mode</>
            ) : (
              <><Moon className="mr-2 h-4 w-4" />Switch to dark mode</>
            )}
          </CommandItem>
          <CommandItem
            onSelect={async () => {
              setOpen(false);
              await signOut();
              navigate("/auth");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteTrigger() {
  const dispatchCmdK = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={dispatchCmdK}
      className="hidden h-9 gap-2 px-3 text-muted-foreground hover:text-foreground sm:inline-flex"
    >
      <span className="text-xs">Search</span>
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </Button>
  );
}
