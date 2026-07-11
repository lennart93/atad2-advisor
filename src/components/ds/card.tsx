import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Design-system card: 12px radius, hairline border, white fill, no shadow.
 * Every section uses the same padding (p-5) so cards stack evenly.
 */
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-ds-card border border-ds-hairline bg-ds-card text-ds-ink",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "DsCard";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1 p-5", className)}
      {...props}
    />
  ),
);
CardHeader.displayName = "DsCardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-[18px] font-normal leading-snug tracking-tight", className)}
      {...props}
    >
      {children}
    </h3>
  ),
);
CardTitle.displayName = "DsCardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-[13px] text-ds-ink-secondary", className)}
      {...props}
    />
  ),
);
CardDescription.displayName = "DsCardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "DsCardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-2 p-5 pt-0", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "DsCardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
