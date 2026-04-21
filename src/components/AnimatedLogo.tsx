import { cn } from "@/lib/utils";

export type AnimatedLogoState = "idle" | "working";

export interface AnimatedLogoProps {
  size?: number;
  state?: AnimatedLogoState;
  interactive?: boolean;
  alt?: string;
  className?: string;
}

/**
 * Svalner Atlas asterisk. Brand-anchor + loading indicator.
 * - state="idle": subtle breathe. Hover = snap-rotate 60° (if interactive).
 * - state="working": continuous rotation (replaces Loader2 in prominent flows).
 * CSS lives in src/index.css under `.animated-logo`.
 * Asset path: public/lovable-uploads/new-logo.png (do not change).
 */
export function AnimatedLogo({
  size = 32,
  state = "idle",
  interactive = true,
  alt = "Svalner Atlas",
  className,
}: AnimatedLogoProps) {
  const role = state === "working" ? "status" : "img";
  const ariaLabel = state === "working" ? "Loading" : alt;
  return (
    <span
      role={role}
      aria-label={ariaLabel}
      className={cn(
        "animated-logo",
        state === "idle" ? "is-idle" : "is-working",
        interactive && state === "idle" && "is-interactive",
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src="/lovable-uploads/new-logo.png"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </span>
  );
}
