import { describe, it, expect } from 'vitest';
import { appendixConfirmReadiness } from '../confirmGuard';
import type { AppendixRow, Status } from '../types';

function row(rowId: string, status: Status | null, extra: Partial<AppendixRow> = {}): AppendixRow {
  return {
    rowId, aiStatus: status, aiReasoning: null, aiProvenance: null,
    status, reasoning: null, provenance: null,
    excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
    ...extra,
  };
}

describe('appendixConfirmReadiness', () => {
  it('blocks while flagged conditions are unreviewed, whatever their status', () => {
    const r = appendixConfirmReadiness([
      row('3.1', 'Triggered'),
      row('3.2', 'Insufficient information'),
      row('3.3', 'Not triggered'),
    ]);
    expect(r.canConfirm).toBe(false);
    expect(r.flagged).toBe(2);
    expect(r.pending).toBe(2);
    expect(r.reason).toContain('2 flagged conditions');
  });

  it('allows confirm once every flagged condition is reviewed, including one deliberately kept "Insufficient information"', () => {
    const r = appendixConfirmReadiness([
      row('3.1', 'Triggered', { reviewed: true }),
      row('3.2', 'Insufficient information', { reviewed: true }),
      row('3.3', 'Not triggered'),
    ]);
    expect(r.canConfirm).toBe(true);
    expect(r.flagged).toBe(2);
    expect(r.reviewed).toBe(2);
    expect(r.reason).toBeNull();
  });

  it('allows confirm when nothing is flagged', () => {
    const r = appendixConfirmReadiness([row('3.1', 'Not triggered'), row('3.3', 'N/A')]);
    expect(r.canConfirm).toBe(true);
    expect(r.flagged).toBe(0);
  });

  it('ignores rows excluded from the client', () => {
    const r = appendixConfirmReadiness([
      row('3.1', 'Not triggered'),
      row('3.2', 'Insufficient information', { excludedFromClient: true }),
    ]);
    expect(r.canConfirm).toBe(true);
    expect(r.flagged).toBe(0);
  });

  it('singular wording for one pending condition', () => {
    const r = appendixConfirmReadiness([row('3.2', 'Insufficient information')]);
    expect(r.reason).toContain('1 flagged condition still needs review');
  });
});
