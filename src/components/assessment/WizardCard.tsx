// src/components/assessment/WizardCard.tsx
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The shared wizard-step card: a white panel on the warm paper with a 3px
 * terracotta letterhead line on top. Every form-like step (Intake, Documents,
 * later Confirmation / Structure) wraps its header + content in this so the
 * steps read as one family. The centered narrow column (max-w-3xl) comes from
 * the shell for `card` steps; this component owns only the card chrome.
 */
export function WizardCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-ds-card border border-ds-hairline border-t-[3px] border-t-brand-terracotta bg-ds-card p-9",
        className,
      )}
    >
      {children}
    </div>
  );
}
