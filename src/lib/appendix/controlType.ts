import { mootNaRowIds } from './mootness';
import type { AppendixRow, Status } from './types';

/**
 * Which of the three controls the condition checklist renders a row with:
 *
 *   'gate'   - a precondition. Met -> a single sage check in a round circle, no
 *              label, no status pill (being in scope is the baseline, not a finding).
 *              The scope rows 1.1, 1.2, the associated-enterprise definition 2.1
 *              and the art. 12ad relatedness precondition 6.1.
 *   'na'     - does not apply. A grey slashed circle + "Not applicable" + the reason
 *              in the expandable body. Any row whose status is N/A, or one the
 *              deterministic backstop (mootNaRowIds) makes moot, unless the advisor
 *              has deliberately set a real status on it.
 *   'status' - a substantive condition that is tested. A colour-coded pill: a clean
 *              outcome reads sage (good), a missing fact amber, a fired mismatch
 *              terracotta (attention). Section 3, 5, 6, the reverse-hybrid section
 *              and the structured-arrangement row 2.2.
 *
 * Derived, never stored, so the screen reflects the moot logic immediately even on a
 * dossier generated before the backstop last changed. It shares mootNaRowIds with the
 * server (and the memo/print) so the three can never disagree on what is moot.
 */
export type ControlType = 'gate' | 'na' | 'status';

/**
 * Preconditions shown as a calm sage check ("Applicable") rather than a status
 * pill. The scope rows 1.1 / 1.2, the associated-enterprise definition 2.1, and
 * the art. 12ad relatedness precondition 6.1 (the Dutch payment is made to a
 * related party / structured arrangement) - a met precondition reads "Applicable",
 * never a risk-coloured "Triggered".
 */
export const GATE_ROWS: ReadonlySet<string> = new Set(['1.1', '1.2', '2.1', '6.1']);

export function controlTypeFor(
  row: Pick<AppendixRow, 'rowId' | 'status' | 'source'>,
  mootRowIds: ReadonlySet<string>,
): ControlType {
  if (GATE_ROWS.has(row.rowId)) return 'gate';
  if (row.status === 'N/A') return 'na';
  // A moot row reads N/A even when its stored status is a stale 'Not triggered'
  // (e.g. 4.1 before a regenerate), unless the advisor set a real status on it.
  if (mootRowIds.has(row.rowId) && row.source !== 'edited') return 'na';
  return 'status';
}

/** The moot set for a whole appendix; compute once, then pass to controlTypeFor. */
export function appendixMootRowIds(
  rows: ReadonlyArray<{ rowId: string; status: Status | null }>,
): Set<string> {
  return mootNaRowIds(rows.map((r) => ({ rowId: r.rowId, status: r.status })));
}
