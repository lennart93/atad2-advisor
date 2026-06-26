import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/lib/utils";

export type CommentMode = "smart" | "always";

const OPTIONS: { value: CommentMode; label: string }[] = [
  { value: "smart", label: "Smart" },
  { value: "always", label: "Always" },
];

const TOOLTIP =
  "Smart asks for a comment only where it's most relevant. Always lets you complete every question.";

interface CommentModeToggleProps {
  value: CommentMode;
  onChange: (mode: CommentMode) => void;
  className?: string;
}

/**
 * Quiet two-segment control for the per-session comment mode.
 *
 * One enclosing container split into two equal halves (Smart / Always). The
 * active half is a soft neutral fill with near-black text, the inactive half is
 * transparent with grey text — a calm highlight, never a hard black block.
 * Built on a Radix radio group for real radio semantics and arrow-key nav; the
 * helper text surfaces on hover of the control itself. Tokens only.
 */
export function CommentModeToggle({ value, onChange, className }: CommentModeToggleProps) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => {
        // A radio group never emits an empty value, but guard anyway so the
        // mode can never be cleared.
        if (next) onChange(next as CommentMode);
      }}
      aria-label="Comments"
      title={TOOLTIP}
      className={cn(
        "inline-grid grid-cols-2 gap-0.5 rounded-ds-control border border-ds-hairline bg-ds-card p-0.5",
        className,
      )}
    >
      {OPTIONS.map((opt) => (
        <RadioGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          className={cn(
            "rounded-ds-chip px-3 py-1 text-center text-[12px] font-medium leading-none transition-colors duration-fast",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-1 focus-visible:ring-offset-ds-card",
            "data-[state=checked]:bg-ds-fill-muted data-[state=checked]:text-ds-ink",
            "data-[state=unchecked]:bg-transparent data-[state=unchecked]:text-ds-ink-secondary data-[state=unchecked]:hover:text-ds-ink",
          )}
        >
          {opt.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
