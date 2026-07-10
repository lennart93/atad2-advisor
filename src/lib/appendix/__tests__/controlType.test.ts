import { describe, it, expect } from 'vitest';
import { controlTypeFor, appendixMootRowIds, GATE_ROWS } from '@/lib/appendix/controlType';
import type { AppendixRow, Status } from '@/lib/appendix/types';

const row = (rowId: string, status: Status | null, source: 'ai' | 'edited' = 'ai'): Pick<AppendixRow, 'rowId' | 'status' | 'source'> =>
  ({ rowId, status, source });

// The spec dossier: in scope, related party present, no mismatch anywhere.
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
const moot = appendixMootRowIds(Object.entries(cleanDossier).map(([rowId, status]) => ({ rowId, status })));

describe('controlTypeFor', () => {
  it('renders the preconditions as gates', () => {
    for (const id of GATE_ROWS) {
      expect(controlTypeFor(row(id, 'Triggered'), moot)).toBe('gate');
    }
    // A gate stays a gate even when not met (the renderer flips its look, not the type).
    expect(controlTypeFor(row('1.2', 'Not triggered'), moot)).toBe('gate');
  });

  it('renders any N/A-status row as the N/A control', () => {
    expect(controlTypeFor(row('5.2', 'N/A'), moot)).toBe('na');
  });

  it('renders a moot row as N/A even when its stored status is a stale Not triggered', () => {
    // 7.1 (recapture), 2.3 and 2.2 (structured arrangement, moot once the parties
    // are associated) are moot on the clean dossier.
    expect(controlTypeFor(row('7.1', 'Not triggered'), moot)).toBe('na');
    expect(controlTypeFor(row('2.3', 'Insufficient information'), moot)).toBe('na');
    expect(controlTypeFor(row('2.2', 'Not triggered'), moot)).toBe('na');
  });

  it('honours an advisor override on a moot row (a deliberate status wins)', () => {
    expect(controlTypeFor(row('7.1', 'Triggered', 'edited'), moot)).toBe('status');
  });

  it('keeps the secondary rule (4.1) a live status row, never auto-moot', () => {
    expect(controlTypeFor(row('4.1', 'Not triggered'), moot)).toBe('status');
  });

  it('renders the art. 12ad relatedness precondition (6.1) as a gate', () => {
    // A met 6.1 (payment to a related party) reads "Applicable", like 2.1.
    expect(controlTypeFor(row('6.1', 'Triggered'), moot)).toBe('gate');
    // The substantive Section 6 tests stay status rows.
    expect(controlTypeFor(row('6.2', 'Not triggered'), moot)).toBe('status');
  });

  it('renders substantive conditions as status pills', () => {
    expect(controlTypeFor(row('3.1', 'Triggered'), moot)).toBe('status');
    expect(controlTypeFor(row('8.1', 'Not triggered'), moot)).toBe('status');
  });

  it('keeps the structured arrangement (2.2) a live status row for unrelated parties with a mismatch', () => {
    const liveDossier = { ...cleanDossier, '2.1': 'Not triggered' as Status, '3.1': 'Triggered' as Status };
    const liveMoot = appendixMootRowIds(Object.entries(liveDossier).map(([rowId, status]) => ({ rowId, status })));
    expect(controlTypeFor(row('2.2', 'Not triggered'), liveMoot)).toBe('status');
  });
});
