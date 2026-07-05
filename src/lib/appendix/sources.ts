import type { ControlType } from './controlType';
import type { AppendixRow } from './types';

/**
 * One display row in the per-condition source panel (the reveal the "Source"
 * chip opens under the rationale footer). Internal view only, never exported.
 *
 *   - 'on_file'  a session document that backs the deciding fact (sage tag).
 *   - 'missing'  a document or fact NOT in the file that holds up an
 *                "Insufficient information" outcome (amber tag + tile); the most
 *                valuable row, it tells the reviewer exactly what to chase.
 *   - 'derived'  no document: the outcome follows from another section's
 *                findings (e.g. a moot N/A row downstream of an absent trigger).
 *   - 'internal' the raw provenance trail the model recorded (answer ids, edge
 *                references), kept so no audit information is lost on rows
 *                generated before the structured sources existed.
 */
export interface SourcePanelRow {
  kind: 'on_file' | 'missing' | 'derived' | 'internal';
  name: string;
  note: string | null;
}

/**
 * Why a moot row is N/A, phrased as a "derived from" source row. Mirrors the
 * row groupings in mootness.ts (DRAFT, pending tax review, like that file):
 * every rowId mootNaRowIds can emit for a non-gate row appears here.
 */
const DERIVED_BY_ROW: Record<string, { name: string; note: string }> = {
  '2.3': {
    name: 'Derived from the Section 3 findings',
    note: 'No primary-rule mismatch is triggered, so dual-inclusion income does not need to be tested.',
  },
  '4.1': {
    name: 'Derived from the Section 3 findings',
    note: 'No primary-rule mismatch is triggered, so there is nothing for the secondary rule to include.',
  },
  '5.2': {
    name: 'Derived from the dual-residence finding (5.1)',
    note: 'The dual-residence condition is not met, so this row does not come into play.',
  },
  '5.3': {
    name: 'Derived from the dual-residence finding (5.1)',
    note: 'The dual-residence condition is not met, so this row does not come into play.',
  },
  '6.4': {
    name: 'Derived from the imported-mismatch findings (6.2 and 6.3)',
    note: 'No funded mismatch elsewhere in the chain, so the carve-back rows do not apply.',
  },
  '6.5': {
    name: 'Derived from the imported-mismatch findings (6.2 and 6.3)',
    note: 'No funded mismatch elsewhere in the chain, so the carve-back rows do not apply.',
  },
  '7.1': {
    name: 'Derived from the primary and secondary rule findings',
    note: 'No deduction was denied, so there is nothing to carry forward or recapture.',
  },
  '7.2': {
    name: 'Derived from the primary and secondary rule findings',
    note: 'No deduction was denied, so there is nothing to carry forward or recapture.',
  },
  '8.2': {
    name: 'Derived from the reverse-hybrid finding (8.1)',
    note: 'No reverse-hybrid classification conflict, so the threshold and exception rows do not apply.',
  },
  '8.3': {
    name: 'Derived from the reverse-hybrid finding (8.1)',
    note: 'No reverse-hybrid classification conflict, so the threshold and exception rows do not apply.',
  },
};

/**
 * Build the source panel for one condition row, from what is actually on the
 * row. Nothing is invented: AI-named documents (post-prompt-v5 rows) come
 * first, a moot row explains which findings it is derived from, and the raw
 * provenance trail closes the list. An empty result renders as a quiet
 * "no sources recorded" line in the panel.
 */
export function buildSourcePanelRows(
  row: Pick<AppendixRow, 'rowId' | 'status' | 'provenance' | 'sources'>,
  ctype: ControlType,
  mootRowIds: ReadonlySet<string>,
): SourcePanelRow[] {
  const out: SourcePanelRow[] = [];

  for (const s of row.sources ?? []) {
    if (!s || (s.kind !== 'on_file' && s.kind !== 'missing')) continue;
    const name = (s.name ?? '').trim();
    if (!name) continue;
    const note = (s.note ?? '').trim();
    out.push({ kind: s.kind, name, note: note || null });
  }

  // A moot N/A row carries a deterministic "derived from" explanation. Gates are
  // also in the moot set when satisfied, but they render as a check, not N/A,
  // so only a real 'na' control gets the derived row.
  if (ctype === 'na' && mootRowIds.has(row.rowId)) {
    const d = DERIVED_BY_ROW[row.rowId];
    if (d) out.push({ kind: 'derived', name: d.name, note: d.note });
  }

  const trail = (row.provenance ?? '').trim();
  if (trail) out.push({ kind: 'internal', name: 'Internal trail', note: trail });

  return out;
}
