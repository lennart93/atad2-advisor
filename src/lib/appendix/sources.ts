import type { ControlType } from './controlType';
import type { AppendixRow } from './types';
import { mootReasoningFor } from './mootReasoning';

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
 * Which findings a moot row is derived FROM, phrased as a source-panel row name.
 * The explanatory note is the canonical moot reason (mootReasoningFor), shared
 * with the row's assessment text so the panel and the body never disagree. Every
 * rowId mootNaRowIds can emit for a non-gate row has a name here. Mirrors the row
 * groupings in mootness.ts (DRAFT, pending tax review, like that file).
 */
const DERIVED_NAME_BY_ROW: Record<string, string> = {
  '2.2': 'Derived from the associated-enterprise finding (2.1)',
  '2.3': 'Derived from the Section 3 findings',
  '5.2': 'Derived from the dual-residence finding (5.1)',
  '5.3': 'Derived from the dual-residence finding (5.1)',
  '5.4': 'Derived from the dual-residence finding (5.1)',
  '6.4': 'Derived from the imported-mismatch findings (6.2 and 6.3)',
  '6.5': 'Derived from the imported-mismatch findings (6.2 and 6.3)',
  '7.1': 'Derived from the primary and secondary rule findings',
  '7.2': 'Derived from the primary and secondary rule findings',
  '8.2': 'Derived from the reverse-hybrid finding (8.1)',
  '8.3': 'Derived from the reverse-hybrid finding (8.1)',
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
    const name = DERIVED_NAME_BY_ROW[row.rowId];
    const note = mootReasoningFor(row.rowId);
    if (name && note) out.push({ kind: 'derived', name, note });
  }

  const trail = (row.provenance ?? '').trim();
  if (trail) out.push({ kind: 'internal', name: 'Internal trail', note: trail });

  return out;
}
