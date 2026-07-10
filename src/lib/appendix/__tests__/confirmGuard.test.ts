import { describe, it, expect } from 'vitest';
import { appendixConfirmReadiness } from '../confirmGuard';
import type { AppendixRow } from '../types';

function row(status: AppendixRow['status'], extra: Partial<AppendixRow> = {}): AppendixRow {
  return {
    rowId: '1.1', aiStatus: status, aiReasoning: null, aiProvenance: null,
    status, reasoning: null, provenance: null,
    excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
    ...extra,
  };
}

describe('appendixConfirmReadiness', () => {
  it('blocks a no-risk appendix that still has Insufficient info rows', () => {
    const r = appendixConfirmReadiness([
      row('Not triggered'), row('N/A'), row('Insufficient information'), row('Insufficient information'),
    ]);
    expect(r.canConfirm).toBe(false);
    expect(r.insufficientCount).toBe(2);
    expect(r.reason).toContain('2 conditions');
  });

  it('allows a no-risk appendix once every condition is resolved', () => {
    const r = appendixConfirmReadiness([row('Not triggered'), row('N/A'), row('Not triggered')]);
    expect(r.canConfirm).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('allows confirm when a condition is Triggered, even with Insufficient info rows', () => {
    const r = appendixConfirmReadiness([row('Triggered'), row('Insufficient information')]);
    expect(r.canConfirm).toBe(true);
    expect(r.triggeredCount).toBe(1);
  });

  it('ignores rows excluded from the client', () => {
    const r = appendixConfirmReadiness([
      row('Not triggered'),
      row('Insufficient information', { excludedFromClient: true }),
    ]);
    expect(r.canConfirm).toBe(true);
    expect(r.insufficientCount).toBe(0);
  });

  it('singular wording for one open condition', () => {
    const r = appendixConfirmReadiness([row('Not triggered'), row('Insufficient information')]);
    expect(r.reason).toContain('1 condition ');
  });
});
