import { cn } from '@/lib/utils';

/**
 * The shared "missing, must be filled in" treatment for an unknown value in the
 * appendix lists (register cells, transaction-row jurisdictions): the word
 * "Unknown" in muted italic, deliberately distinct from a normal filled value.
 */
export function UnknownValue({ className }: { className?: string }) {
  return (
    <span className={cn('text-[12.5px] italic text-muted-foreground/70', className)}>
      Unknown
    </span>
  );
}
