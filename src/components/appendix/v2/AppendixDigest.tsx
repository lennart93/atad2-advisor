import { cn } from '@/lib/utils';

/**
 * The single strip under the page title (spec §4). Left: counts joined by middots.
 * Right: "N need review" in accent with a dot, only when N > 0; clicking it jumps
 * to the first flagged row. No card, no border, one thin line.
 */
export function AppendixDigest({
  counts, needReview, onNeedReviewClick, className,
}: {
  counts: string[];
  needReview: number;
  onNeedReviewClick?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 text-[12.5px]', className)}>
      <p className="text-muted-foreground">
        {counts.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1.5 text-muted-foreground/40" aria-hidden>·</span>}
            {c}
          </span>
        ))}
      </p>
      {needReview > 0 && (
        <button
          type="button"
          onClick={onNeedReviewClick}
          className="inline-flex items-center gap-1.5 font-medium text-brand-terracotta transition-colors hover:text-brand-terracotta-deep"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-brand-terracotta" aria-hidden />
          {needReview} need review
        </button>
      )}
    </div>
  );
}
