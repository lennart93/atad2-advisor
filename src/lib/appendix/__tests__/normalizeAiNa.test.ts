import { describe, it, expect } from 'vitest';
import { normalizeAiNaStatuses } from '@/lib/appendix/normalizeAiNa';
import type { AppendixRow, Status } from '@/lib/appendix/types';

const row = (rowId: string, status: Status | null, source: 'ai' | 'edited' = 'ai'): AppendixRow => ({
  rowId, aiStatus: status, aiReasoning: null, aiProvenance: null, status,
  reasoning: null, provenance: null, excludedFromClient: false, source,
  stale: false, staleReason: null, editedBy: null, editedAt: null,
});

// Clean dossier: in scope, related party, no mismatch anywhere. Downstream rows
// (2.3, 5.2-5.4, 6.4-6.5, 7.x, 8.2-8.3) and satisfied gates are moot.
const clean: AppendixRow[] = [
  row('1.1', 'Triggered'), row('1.2', 'Triggered'),
  row('2.1', 'Triggered'), row('2.2', 'Not triggered'), row('2.3', 'N/A'),
  row('3.1', 'Not triggered'), row('3.2', 'N/A'), row('3.5', 'N/A'),
  row('5.1', 'Not triggered'), row('5.2', 'N/A'),
  row('7.1', 'N/A'),
  row('8.1', 'Not triggered'), row('8.2', 'N/A'),
];

describe('normalizeAiNaStatuses', () => {
  it('coerces a model N/A on a live (non-moot, non-gate) row to Not triggered', () => {
    const out = normalizeAiNaStatuses(clean);
    const byId = new Map(out.map((r) => [r.rowId, r]));
    // Section 3 rows are never moot: their N/A came from the model itself.
    expect(byId.get('3.2')!.status).toBe('Not triggered');
    expect(byId.get('3.5')!.status).toBe('Not triggered');
  });

  it('leaves moot rows and gate rows at their stored N/A', () => {
    const out = normalizeAiNaStatuses(clean);
    const byId = new Map(out.map((r) => [r.rowId, r]));
    // Moot on this dossier: dual-inclusion income, dual-residence DD, recapture,
    // reverse-hybrid threshold. Their N/A is the deliberate backstop result.
    for (const id of ['2.3', '5.2', '7.1', '8.2']) {
      expect(byId.get(id)!.status).toBe('N/A');
    }
  });

  it('leaves a gate row N/A untouched', () => {
    const out = normalizeAiNaStatuses([row('1.1', 'N/A'), row('3.1', 'Not triggered')]);
    expect(out.find((r) => r.rowId === '1.1')!.status).toBe('N/A');
  });

  it('never touches an advisor-edited N/A', () => {
    const rows = [row('3.4', 'N/A', 'edited'), row('3.1', 'Not triggered')];
    const out = normalizeAiNaStatuses(rows);
    expect(out.find((r) => r.rowId === '3.4')!.status).toBe('N/A');
  });

  it('returns the same array instance when nothing changes', () => {
    const rows = [row('3.1', 'Not triggered'), row('3.2', 'Triggered')];
    expect(normalizeAiNaStatuses(rows)).toBe(rows);
  });

  it('does not let the coercion itself change the moot set (only Triggered feeds it)', () => {
    // 5.2 is moot only because 5.1 is not triggered; an N/A on 5.1 (a live row)
    // becomes Not triggered, which keeps 5.2 moot, so 5.2 keeps its N/A.
    const rows = [row('5.1', 'N/A'), row('5.2', 'N/A')];
    const out = normalizeAiNaStatuses(rows);
    expect(out.find((r) => r.rowId === '5.1')!.status).toBe('Not triggered');
    expect(out.find((r) => r.rowId === '5.2')!.status).toBe('N/A');
  });
});
