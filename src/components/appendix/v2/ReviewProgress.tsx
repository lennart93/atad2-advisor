import { Button } from '@/components/ds';

/** The count shape both appendix pages feed this cluster (Part A and Part B progress fit it). */
export interface ReviewProgressCounts {
  total: number;
  reviewed: number;
  open: number;
}

/**
 * The quiet review-progress cluster next to the footer's forward button:
 * "5 of 18 reviewed" with a thin muted bar, plus a "Review next" action that
 * takes the advisor to the first unresolved item instead of just naming it.
 * Renders nothing once every item is reviewed.
 */
export function ReviewProgress({ progress, onReviewNext }: {
  progress: ReviewProgressCounts;
  onReviewNext?: () => void;
}) {
  if (progress.open === 0) return null;
  const pct = progress.total > 0 ? Math.round((progress.reviewed / progress.total) * 100) : 0;
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
          {progress.reviewed} of {progress.total} reviewed
        </span>
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.reviewed}
          aria-label="Review progress"
          className="h-1 w-24 overflow-hidden rounded-full bg-muted"
        >
          <span className="block h-full rounded-full bg-brand-sage" style={{ width: `${pct}%` }} />
        </span>
      </div>
      {onReviewNext && (
        <Button variant="secondary" onClick={onReviewNext}>
          Review next
        </Button>
      )}
    </>
  );
}
