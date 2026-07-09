import { cleanReasoning } from './reasoningText';
import { controlTypeFor } from './controlType';
import { mootReasoningFor } from './mootReasoning';
import type { AppendixRow } from './types';

/** What an ungrounded / empty row shows: a bare dash, never an apology sentence. */
export const UNGROUNDED_DASH = '-';

/**
 * The legacy fallback sentence stored on ungrounded rows before it became a bare
 * dash. Older dossiers still carry it verbatim; collapse it on display so the
 * "The model did not return a grounded answer ..." line never reaches a reader.
 */
const LEGACY_UNGROUNDED = /model did not return a grounded answer/i;

/**
 * The assessment text to SHOW for a condition row.
 *
 * For a row the mootness backstop makes N/A (not advisor-edited), this returns
 * the short canonical "not reached, because ..." line instead of the model's
 * improvised paragraph: a moot row carries no live finding, so its long AI text
 * is noise at best and invented facts at worst. An ungrounded or empty row reads
 * as a bare dash. Every other row keeps its own cleaned reasoning, so a genuine
 * finding, a gate explanation or an advisor's edited text is never overwritten.
 *
 * Derived, never stored - it shares the moot logic with controlTypeFor, so the
 * screen, the memo and the print export always agree with the status pill.
 */
export function displayReasoning(
  row: Pick<AppendixRow, 'rowId' | 'status' | 'source' | 'reasoning' | 'ungrounded'>,
  mootRowIds: ReadonlySet<string>,
): string {
  if (controlTypeFor(row, mootRowIds) === 'na' && mootRowIds.has(row.rowId)) {
    const moot = mootReasoningFor(row.rowId);
    if (moot) return moot;
  }
  const cleaned = cleanReasoning(row.reasoning);
  if (!cleaned || row.ungrounded || LEGACY_UNGROUNDED.test(cleaned)) return UNGROUNDED_DASH;
  return cleaned;
}
