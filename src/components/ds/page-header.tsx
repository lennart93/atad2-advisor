import * as React from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned slot, e.g. one secondary action. */
  actions?: React.ReactNode;
}

/**
 * Page title block with fixed margins, so every screen starts the same way.
 * No eyebrow caps; the title carries the hierarchy.
 */
function PageHeader({ title, subtitle, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn("mb-6 flex items-start justify-between gap-4", className)}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-[22px] font-medium leading-tight tracking-tight text-ds-ink">
          {title}
        </h1>
        {subtitle != null && (
          <p className="mt-1 text-[15px] text-ds-ink-secondary">{subtitle}</p>
        )}
      </div>
      {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export { PageHeader };
