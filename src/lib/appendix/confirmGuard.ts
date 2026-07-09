import type { AppendixRow } from './types';

export interface ConfirmReadiness {
  canConfirm: boolean;
  triggeredCount: number;
  insufficientCount: number;
  /** User-facing block reason (English, plain), null when confirm is allowed. */
  reason: string | null;
}

/**
 * Gate the "Confirm appendix" action. A "no risk" appendix (no condition is
 * Triggered) must NOT be confirmed while conditions are still "Insufficient
 * information": a no-risk conclusion cannot rest on unresolved conditions, so the
 * advisor must first set each open condition to Not triggered, Triggered or N/A.
 *
 * Rows the advisor excluded from the client are out of scope and do not count.
 * When at least one condition is Triggered the appendix concludes a risk and the
 * advisor may confirm (any remaining "Insufficient info" rows are secondary to a
 * finding that is already made).
 */
export function appendixConfirmReadiness(rows: AppendixRow[]): ConfirmReadiness {
  const inScope = rows.filter((r) => !r.excludedFromClient);
  const triggeredCount = inScope.filter((r) => r.status === 'Triggered').length;
  const insufficientCount = inScope.filter((r) => r.status === 'Insufficient information').length;

  if (triggeredCount === 0 && insufficientCount > 0) {
    const n = insufficientCount;
    return {
      canConfirm: false,
      triggeredCount,
      insufficientCount,
      reason:
        `Resolve the ${n} condition${n === 1 ? '' : 's'} still marked "Insufficient info" before confirming. ` +
        `A "no risk identified" conclusion cannot rest on unresolved conditions: set each to Not triggered, Triggered or N/A.`,
    };
  }

  return { canConfirm: true, triggeredCount, insufficientCount, reason: null };
}
