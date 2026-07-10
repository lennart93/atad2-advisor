import { describe, it, expect } from 'vitest';
import { mootNaRowIds } from '@/lib/appendix/mootness';
import type { Status } from '@/lib/appendix/types';

const rowsFrom = (m: Record<string, Status>) =>
  Object.entries(m).map(([rowId, status]) => ({ rowId, status }));

// The spec dossier: in scope, related party present, but no mismatch anywhere.
// Scope/definition gates fire (satisfied); everything substantive is clean.
const cleanDossier: Record<string, Status> = {
  '1.1': 'Triggered', '1.2': 'Triggered',
  '2.1': 'Triggered', '2.2': 'Not triggered', '2.3': 'Insufficient information',
  '3.1': 'Not triggered', '3.2': 'Not triggered', '3.3': 'Not triggered', '3.4': 'Not triggered',
  '3.5': 'Not triggered', '3.6': 'Not triggered', '3.7': 'Not triggered',
  '4.1': 'Not triggered',
  '5.1': 'Not triggered', '5.2': 'Not triggered', '5.3': 'Not triggered', '5.4': 'Not triggered',
  '6.1': 'Triggered', '6.2': 'Not triggered', '6.3': 'Not triggered', '6.4': 'Not triggered', '6.5': 'Not triggered',
  '7.1': 'Not triggered', '7.2': 'Not triggered',
  '8.1': 'Not triggered', '8.2': 'Not triggered', '8.3': 'Not triggered',
};

describe('mootNaRowIds', () => {
  it('matches the spec reclassification on a clean, in-scope dossier', () => {
    const na = mootNaRowIds(rowsFrom(cleanDossier));
    // 6.1 is a satisfied relatedness gate ("Applicable"); 2.2 (structured
    // arrangement) is N/A once the parties are associated (2.1). 4.1 (secondary
    // rule) is NOT here: it is always a live row (NL as recipient state).
    const expected = ['1.1', '1.2', '2.1', '2.2', '2.3', '5.2', '5.3', '5.4', '6.1', '6.4', '6.5', '7.1', '7.2', '8.2', '8.3'];
    expect([...na].sort()).toEqual(expected.sort());
  });

  it('leaves the substantively-assessed rows alone (they stay Not triggered)', () => {
    const na = mootNaRowIds(rowsFrom(cleanDossier));
    // 4.1 is always live now (never auto-moot), so it belongs in this list.
    for (const id of ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '4.1', '5.1', '6.2', '6.3', '8.1']) {
      expect(na.has(id)).toBe(false);
    }
  });

  it('treats the art. 12ad relatedness precondition (6.1) as a satisfied gate when met', () => {
    // Payment to a related party: 6.1 is met, so it is a satisfied gate (N/A ->
    // rendered "Applicable"), not a live "Triggered" status row.
    expect(mootNaRowIds(rowsFrom(cleanDossier)).has('6.1')).toBe(true);
    // Genuinely not met (out of scope) -> left alone, like any unmet gate.
    const noRelatedPayment = { ...cleanDossier, '6.1': 'Not triggered' as Status };
    expect(mootNaRowIds(rowsFrom(noRelatedPayment)).has('6.1')).toBe(false);
  });

  // Structured arrangement (2.2) is N/A ONLY when the parties are associated (2.1):
  // the associated-enterprise test already covers them. When the parties are not
  // associated it stays a live row, whatever the Section 3 outcome, because a
  // third-party arrangement can still be structured.
  it('makes the structured arrangement (2.2) N/A when the parties are associated', () => {
    const associatedWithMismatch = { ...cleanDossier, '2.1': 'Triggered' as Status, '3.1': 'Triggered' as Status };
    expect(mootNaRowIds(rowsFrom(associatedWithMismatch)).has('2.2')).toBe(true);
  });

  it('keeps the structured arrangement (2.2) live when the parties are not associated', () => {
    // No mismatch: still live (a third-party arrangement can be structured).
    const notAssociatedNoMismatch = { ...cleanDossier, '2.1': 'Not triggered' as Status };
    expect(mootNaRowIds(rowsFrom(notAssociatedNoMismatch)).has('2.2')).toBe(false);
    // With a mismatch and unrelated parties: also live.
    const unrelatedWithMismatch = { ...cleanDossier, '2.1': 'Not triggered' as Status, '3.1': 'Triggered' as Status };
    expect(mootNaRowIds(rowsFrom(unrelatedWithMismatch)).has('2.2')).toBe(false);
  });

  it('never auto-moots the secondary rule (4.1): NL is the recipient state', () => {
    // Whatever the Section 3 outcome, 4.1 stays a live row (a foreign primary rule
    // may apply even when no NL primary mismatch fired).
    expect(mootNaRowIds(rowsFrom(cleanDossier)).has('4.1')).toBe(false);
    const withMismatch = { ...cleanDossier, '3.1': 'Triggered' as Status };
    expect(mootNaRowIds(rowsFrom(withMismatch)).has('4.1')).toBe(false);
  });

  it('forces Insufficient information on a moot row to N/A', () => {
    // 2.3 is "Insufficient information" above, yet moot because no mismatch fires.
    expect(mootNaRowIds(rowsFrom(cleanDossier)).has('2.3')).toBe(true);
  });

  it('does not touch downstream rows once their trigger fires', () => {
    const withReverseHybrid = { ...cleanDossier, '8.1': 'Triggered' as Status };
    const na = mootNaRowIds(rowsFrom(withReverseHybrid));
    expect(na.has('8.2')).toBe(false);
    expect(na.has('8.3')).toBe(false);

    const withMismatch = { ...cleanDossier, '3.1': 'Triggered' as Status };
    expect(mootNaRowIds(rowsFrom(withMismatch)).has('2.3')).toBe(false);
    // The secondary rule (4.1) becomes live once a primary mismatch exists.
    expect(mootNaRowIds(rowsFrom(withMismatch)).has('4.1')).toBe(false);
    // A denial occurred, so recapture is reachable, not moot.
    expect(mootNaRowIds(rowsFrom(withMismatch)).has('7.1')).toBe(false);

    const withDualResidence = { ...cleanDossier, '5.1': 'Triggered' as Status };
    expect(mootNaRowIds(rowsFrom(withDualResidence)).has('5.2')).toBe(false);

    const withImported = { ...cleanDossier, '6.2': 'Triggered' as Status, '6.3': 'Triggered' as Status };
    const naImp = mootNaRowIds(rowsFrom(withImported));
    expect(naImp.has('6.4')).toBe(false);
    expect(naImp.has('6.5')).toBe(false);
  });

  it('does not force a scope gate that is genuinely not met (out of scope) to N/A', () => {
    const outOfScope = { ...cleanDossier, '1.2': 'Not triggered' as Status };
    expect(mootNaRowIds(rowsFrom(outOfScope)).has('1.2')).toBe(false);
  });

  it('only forces present rows (skips rows absent from the dossier)', () => {
    const subset = rowsFrom(cleanDossier).filter((r) => r.rowId !== '8.2' && r.rowId !== '8.3');
    const na = mootNaRowIds(subset);
    expect(na.has('8.2')).toBe(false);
    expect(na.has('8.3')).toBe(false);
    // The other moot rows are still caught.
    expect(na.has('2.3')).toBe(true);
  });
});
