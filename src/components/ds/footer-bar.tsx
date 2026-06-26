import * as React from "react";

import { cn } from "@/lib/utils";

export interface FooterBarGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Secondary action(s): Previous, Cancel, Skip. */
  left?: React.ReactNode;
  center?: React.ReactNode;
  /** Primary action. At most one primary button lives here. */
  right?: React.ReactNode;
}

/**
 * The footer's inner three-column layout. Exposed separately so portal
 * layouts (AssessmentFooterSlot) can render this grid into a FooterBar
 * that acts as the portal target.
 */
function FooterBarGrid({ left, center, right, className, ...props }: FooterBarGridProps) {
  return (
    <div
      className={cn(
        "mx-auto grid min-h-[60px] max-w-6xl grid-cols-3 items-center px-4 py-3",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 justify-self-start">{left}</div>
      <div className="justify-self-center">{center}</div>
      <div className="flex items-center gap-2 justify-self-end">{right}</div>
    </div>
  );
}

export interface FooterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** Set false when a parent shell already pins the bar (portal layouts). */
  sticky?: boolean;
}

/**
 * The one footer used on every step: hairline top border, secondary action
 * left, primary action right. Pass `children` instead of slots to use the
 * bar as a portal target (the portal then renders a FooterBarGrid).
 */
function FooterBar({
  left,
  center,
  right,
  sticky = true,
  className,
  children,
  ...props
}: FooterBarProps) {
  return (
    <div
      className={cn(
        "border-t border-ds-hairline bg-ds-card",
        sticky && "sticky bottom-0 z-10",
        className,
      )}
      {...props}
    >
      {children ?? <FooterBarGrid left={left} center={center} right={right} />}
    </div>
  );
}

export { FooterBar, FooterBarGrid };
