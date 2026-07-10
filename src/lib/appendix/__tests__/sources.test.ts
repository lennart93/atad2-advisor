import { describe, expect, it } from 'vitest';
import { buildSourcePanelRows } from '../sources';
import { appendixMootRowIds, GATE_ROWS } from '../controlType';
import { APPENDIX_SKELETON } from '../skeleton';
import type { AppendixRow, Status } from '../types';

type RowInput = Pick<AppendixRow, 'rowId' | 'status' | 'provenance' | 'sources'>;

const row = (over: Partial<RowInput> & { rowId: string }): RowInput => ({
  status: 'Not triggered' as Status,
  provenance: null,
  sources: undefined,
  ...over,
});

const NO_MOOT = new Set<string>();

describe('buildSourcePanelRows', () => {
  it('maps structured AI sources in order, keeping their kinds and notes', () => {
    const rows = buildSourcePanelRows(
      row({
        rowId: '3.2',
        status: 'Insufficient information',
        sources: [
          { kind: 'on_file', name: 'Intra-group loan agreement (2023)', note: 'Confirms the interest payment.' },
          { kind: 'missing', name: 'US tax classification of the lender', note: 'Check-the-box status is not in the file.' },
        ],
      }),
      'status',
      NO_MOOT,
    );
    expect(rows).toEqual([
      { kind: 'on_file', name: 'Intra-group loan agreement (2023)', note: 'Confirms the interest payment.' },
      { kind: 'missing', name: 'US tax classification of the lender', note: 'Check-the-box status is not in the file.' },
    ]);
  });

  it('drops malformed structured sources instead of rendering empty rows', () => {
    const rows = buildSourcePanelRows(
      row({
        rowId: '3.2',
        sources: [
          { kind: 'on_file', name: '   ', note: 'no name' },
          // Out-of-vocabulary kind from a model slip must not crash the panel.
          { kind: 'derived' as never, name: 'Should not appear', note: null },
          { kind: 'missing', name: 'Real one', note: '  ' },
        ],
      }),
      'status',
      NO_MOOT,
    );
    expect(rows).toEqual([{ kind: 'missing', name: 'Real one', note: null }]);
  });

  it('adds a derived row for a moot N/A condition, from the mootness groupings', () => {
    // No mismatch triggered anywhere -> 2.3 (dual-inclusion income) is moot.
    const moot = appendixMootRowIds([
      { rowId: '2.3', status: 'N/A' },
      { rowId: '3.1', status: 'Not triggered' },
    ]);
    const rows = buildSourcePanelRows(row({ rowId: '2.3', status: 'N/A' }), 'na', moot);
    expect(rows).toEqual([
      {
        kind: 'derived',
        name: 'Derived from the Section 3 findings',
        note: 'No primary-rule mismatch is triggered, so dual-inclusion income does not need to be tested.',
      },
    ]);
  });

  it('does not add a derived row to a satisfied gate, even though gates sit in the moot set', () => {
    const moot = appendixMootRowIds([{ rowId: '1.1', status: 'Triggered' }]);
    expect(moot.has('1.1')).toBe(true);
    const rows = buildSourcePanelRows(row({ rowId: '1.1', status: 'N/A' }), 'gate', moot);
    expect(rows).toEqual([]);
  });

  it("only the 'na' control gets a derived row, even for a rowId that has one on file", () => {
    // 2.3 has a DERIVED_BY_ROW entry, so this pins the ctype guard itself: the
    // 1.1 gate test above would also pass if the guard were deleted (1.1 simply
    // has no entry).
    const moot = appendixMootRowIds([
      { rowId: '2.3', status: 'N/A' },
      { rowId: '3.1', status: 'Not triggered' },
    ]);
    expect(buildSourcePanelRows(row({ rowId: '2.3', status: 'N/A' }), 'gate', moot)).toEqual([]);
    expect(buildSourcePanelRows(row({ rowId: '2.3', status: 'N/A' }), 'status', moot)).toEqual([]);
  });

  it('has a derived explanation for EVERY non-gate row the mootness backstop can make N/A', () => {
    // All skeleton rows present, nothing triggered anywhere: that is the maximal
    // moot set (no mismatch, no dual residence, no imported mismatch, no reverse
    // hybrid). If mootness.ts grows a new moot row without a DERIVED_BY_ROW
    // entry, its panel explanation would silently vanish; this pins the sync.
    const everyRow = APPENDIX_SKELETON.map((sk) => ({ rowId: sk.rowId, status: 'Not triggered' as Status }));
    const moot = appendixMootRowIds(everyRow);
    const nonGateMoot = [...moot].filter((id) => !GATE_ROWS.has(id));
    expect(nonGateMoot.length).toBeGreaterThanOrEqual(10);
    for (const rowId of nonGateMoot) {
      const rows = buildSourcePanelRows(row({ rowId, status: 'N/A' }), 'na', moot);
      expect(rows.map((r) => r.kind), `rowId ${rowId} is missing a DERIVED_BY_ROW entry`).toEqual(['derived']);
    }
  });

  it('keeps the raw provenance as a closing internal-trail row', () => {
    const rows = buildSourcePanelRows(
      row({ rowId: '3.1', provenance: 'Q26; edge E1->E4 (loan)' }),
      'status',
      NO_MOOT,
    );
    expect(rows).toEqual([{ kind: 'internal', name: 'Internal trail', note: 'Q26; edge E1->E4 (loan)' }]);
  });

  it('orders structured sources before the derived and internal rows', () => {
    // 7.1 (recapture) is moot when nothing was denied.
    const moot = appendixMootRowIds([
      { rowId: '7.1', status: 'N/A' },
      { rowId: '3.1', status: 'Not triggered' },
    ]);
    const rows = buildSourcePanelRows(
      row({
        rowId: '7.1',
        status: 'N/A',
        provenance: 'Q12',
        sources: [{ kind: 'on_file', name: 'Group structure memo', note: null }],
      }),
      'na',
      moot,
    );
    expect(rows.map((r) => r.kind)).toEqual(['on_file', 'derived', 'internal']);
  });

  it('returns nothing to fabricate for a bare pre-v5 row', () => {
    expect(buildSourcePanelRows(row({ rowId: '3.1' }), 'status', NO_MOOT)).toEqual([]);
  });
});
