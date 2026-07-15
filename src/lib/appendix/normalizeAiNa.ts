import { appendixMootRowIds, GATE_ROWS } from './controlType';
import type { AppendixRow } from './types';

/**
 * "N/A" is advisor vocabulary, not model vocabulary. The model answers the
 * binary question (does the condition fire on these facts or not); which rows
 * are out of scope or moot is decided deterministically (GATE_ROWS + the
 * mootness backstop), and beyond that "N/A" is the advisor's own call via the
 * status dropdown. A model-assigned "N/A" on a live row therefore reads
 * "Not triggered", so one section never mixes "Not triggered" and "N/A"
 * without a real difference behind it.
 *
 * Applied on load (client.ts) so dossiers generated before this rule display
 * consistently without a regenerate; the edge function applies the same rule
 * at generation time. Rows the advisor edited, gate rows and moot rows are
 * left untouched (their stored "N/A" is deliberate and renders as the calm
 * gate check / "Not applicable" circle, not as a status pill).
 */
export function normalizeAiNaStatuses(rows: AppendixRow[]): AppendixRow[] {
  // The moot set only reads 'Triggered' statuses, so coercing 'N/A' rows can
  // never change it; computing it up front is order-independent.
  const moot = appendixMootRowIds(rows);
  let changed = false;
  const out = rows.map((r) => {
    if (r.status === 'N/A' && r.source !== 'edited' && !GATE_ROWS.has(r.rowId) && !moot.has(r.rowId)) {
      changed = true;
      return { ...r, status: 'Not triggered' as const };
    }
    return r;
  });
  return changed ? out : rows;
}
