import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Design-system button. Flat fills, hairline borders, no shadows.
 * Usage rule: at most ONE primary button per screen; everything else is
 * secondary or ghost.
 */
const dsButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ds-control text-[13px] font-normal ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ds-ink text-ds-card hover:bg-ds-ink-hover",
        secondary:
          "border border-ds-hairline bg-ds-card text-ds-ink hover:bg-ds-fill-muted",
        ghost: "text-ds-ink hover:bg-ds-fill-muted",
        destructive: "bg-ds-red text-white hover:bg-ds-red-hover",
      },
      size: {
        sm: "h-8 px-3",
        default: "h-9 px-3.5",
        lg: "h-10 px-4 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof dsButtonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(dsButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "DsButton";

export { Button, dsButtonVariants };
