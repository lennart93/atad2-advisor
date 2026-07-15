import { cn } from '@/lib/utils';

/**
 * The shared "missing, must be filled in" treatment for an unknown value in the
 * appendix lists: muted italic, deliberately distinct from a normal filled
 * value. The default word is "Unknown" (a missing fact, e.g. a jurisdiction);
 * an assessment state that is simply not decided yet passes "To be determined"
 * so the cell matches the dropdown's own label.
 */
export function UnknownValue({ className, label = 'Unknown' }: { className?: string; label?: string }) {
  return (
    <span className={cn('text-[12.5px] italic text-muted-foreground/70', className)}>
      {label}
    </span>
  );
}
