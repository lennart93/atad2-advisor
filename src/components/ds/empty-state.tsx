import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  /** One action, usually a secondary Button. */
  action?: React.ReactNode;
  /** One sentence explaining the empty state. */
  children: React.ReactNode;
}

/**
 * Icon + one sentence + one action. No dashed borders; place it inside a
 * Card or directly on the page.
 */
function EmptyState({ icon: Icon, action, children, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-ds-fill-muted text-ds-ink-tertiary">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <p className="max-w-sm text-[13px] text-ds-ink-secondary">{children}</p>
      {action != null && <div className="mt-1">{action}</div>}
    </div>
  );
}

export { EmptyState };
