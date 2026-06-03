import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AppFrameProps {
  children: ReactNode;
  /** Optional URL shown in the fake address bar. */
  url?: string;
  /** Extra classes on the inner content wrapper. */
  contentClassName?: string;
  className?: string;
}

/**
 * Browser-window chrome wrapper used to frame both rendered mocks and
 * real screenshots in the tutorial. Subtle, neutral, matches the app palette.
 */
export function AppFrame({ children, url = "app.atad2.tax", contentClassName, className }: AppFrameProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-[hsl(var(--border-default))] bg-background shadow-lg",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-[hsl(var(--border-subtle))] bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="block h-2.5 w-2.5 rounded-full bg-[hsl(0_72%_60%)]/70" />
          <span className="block h-2.5 w-2.5 rounded-full bg-[hsl(40_90%_60%)]/70" />
          <span className="block h-2.5 w-2.5 rounded-full bg-[hsl(140_60%_50%)]/70" />
        </div>
        <div className="mx-auto inline-flex h-6 max-w-[18rem] items-center gap-1.5 rounded-md border border-[hsl(var(--border-subtle))] bg-background/80 px-2.5 text-[11px] font-mono text-muted-foreground">
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path
              fill="currentColor"
              d="M5 6a3 3 0 1 1 6 0v1h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1V6Zm1 1h4V6a2 2 0 1 0-4 0v1Z"
            />
          </svg>
          <span className="truncate">{url}</span>
        </div>
        <div className="w-[44px]" aria-hidden />
      </div>
      <div className={cn("bg-background", contentClassName)}>{children}</div>
    </div>
  );
}
