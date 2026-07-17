import type { AppendixRow } from './types';
import { partBReviewProgress, type PartBReviewProgress } from './needsAttention';

export interface ConfirmReadiness extends PartBReviewProgress {
  canConfirm: boolean;
  /** User-facing block reason (English, plain), null when confirm is allowed. */
  reason: string | null;
}

/**
 * Gate the "Confirm appendix" action on the advisor's review sign-off. Every
 * flagged condition (Triggered, Insufficient information, or not assessed) must
 * be reviewed first: either its status was changed, or it was explicitly marked
 * reviewed, which includes the deliberate decision to keep a condition as
 * "Insufficient information". Rows the advisor excluded from the client are out
 * of scope and never block.
 */
export function appendixConfirmReadiness(rows: AppendixRow[]): ConfirmReadiness {
  const progress = partBReviewProgress(rows);
  if (progress.pending > 0) {
    const n = progress.pending;
    return {
      ...progress,
      canConfirm: false,
      reason:
        `${n} flagged condition${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} review before the appendix can be confirmed. ` +
        `Open each one and change its status, or mark it reviewed to keep it as it is.`,
    };
  }
  return { ...progress, canConfirm: true, reason: null };
}
