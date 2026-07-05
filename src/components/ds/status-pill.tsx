import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The only place semantic colors appear in chrome. Pass a lucide icon as a
 * child if the state needs one; never convey the state by color alone when
 * the label is ambiguous. There is no blue pill: the one accent (Svalner
 * terracotta) is the brand marker for active states; amber stays risk-only.
 *
 * - triggered: amber (a finding that represents real ATAD2 risk, e.g.
 *   "ATAD2 risk identified" or a triggered appendix condition)
 * - insufficient: amber (needs attention, not enough information)
 * - complete: sage (done, confirmed, answered)
 * - not-triggered / neutral: muted gray (quiet, in progress, suggested, n/a)
 *
 * Risk reads amber, never accent. Non-risk emphasis (suggestions, counts,
 * in-progress) is neutral gray. Red is reserved for destructive actions and is
 * deliberately not a pill state.
 */
const statusPillVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-ds-chip px-2 py-0.5 text-xs font-normal [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      status: {
        triggered: "bg-ds-amber-bg text-ds-amber-text",
        insufficient: "bg-ds-amber-bg text-ds-amber-text",
        complete: "bg-ds-green-bg text-ds-green-text",
        "not-triggered": "bg-ds-fill-muted text-ds-ink-secondary",
        neutral: "bg-ds-fill-muted text-ds-ink-secondary",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  },
);

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {}

function StatusPill({ className, status, ...props }: StatusPillProps) {
  return (
    <span
      className={cn(statusPillVariants({ status }), className)}
      {...props}
    />
  );
}

export { StatusPill, statusPillVariants };
