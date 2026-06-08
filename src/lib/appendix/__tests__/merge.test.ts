import { describe, it, expect } from 'vitest';
import { mergeOnRegenerate, computeStaleRows } from '@/lib/appendix/merge';
import type { AppendixRow } from '@/lib/appendix/types';

function row(partial: Partial<AppendixRow> & { rowId: string }): AppendixRow {
  return {
    rowId: partial.rowId,
    aiStatus: partial.aiStatus ?? 'Not triggered',
    aiConsequence: partial.aiConsequence ?? 'No adjustment.',
    aiFactualBasis: partial.aiFactualBasis ?? '100% per cap table',
    aiProvenance: partial.aiProvenance ?? 'Q1 answer: Yes',
    status: partial.status ?? partial.aiStatus ?? 'Not triggered',
    consequence: partial.consequence ?? partial.aiConsequence ?? 'No adjustment.',
    factualBasis: partial.factualBasis ?? partial.aiFactualBasis ?? '100% per cap table',
    provenance: partial.provenance ?? partial.aiProvenance ?? 'Q1 answer: Yes',
    source: partial.source ?? 'ai',
    stale: partial.stale ?? false,
    staleReason: partial.staleReason ?? null,
    editedBy: partial.editedBy ?? null,
    editedAt: partial.editedAt ?? null,
  };
}

describe('mergeOnRegenerate', () => {
  it('overwrites ai-source rows with fresh AI values', () => {
    const existing = [row({ rowId: '3.2', source: 'ai', status: 'Not triggered' })];
    const fresh = [row({ rowId: '3.2', aiStatus: 'Triggered', aiConsequence: 'Deduction denied.', aiProvenance: 'Q26=Yes' })];
    const merged = mergeOnRegenerate(existing, fresh);
    expect(merged[0].status).toBe('Triggered');
    expect(merged[0].consequence).toBe('Deduction denied.');
    expect(merged[0].source).toBe('ai');
  });

  it('keeps the edited current value but refreshes the ai shadow so drift is visible', () => {
    const existing = [row({ rowId: '3.7', source: 'edited', status: 'Triggered', consequence: 'human edit', editedBy: 'u1', editedAt: 't1' })];
    const fresh = [row({ rowId: '3.7', aiStatus: 'Not triggered', aiConsequence: 'fresh ai', aiProvenance: 'Q19=No' })];
    const merged = mergeOnRegenerate(existing, fresh);
    expect(merged[0].status).toBe('Triggered');         // human value kept
    expect(merged[0].consequence).toBe('human edit');
    expect(merged[0].aiStatus).toBe('Not triggered');   // ai shadow refreshed
    expect(merged[0].source).toBe('edited');
    expect(merged[0].editedBy).toBe('u1');
  });

  it('adds brand-new fresh rows not present in existing', () => {
    const merged = mergeOnRegenerate([], [row({ rowId: '1.1' })]);
    expect(merged.map((r) => r.rowId)).toContain('1.1');
  });
});

describe('computeStaleRows', () => {
  it('flags only rows whose driving question changed', () => {
    const rows = [
      row({ rowId: '3.2', source: 'ai' }),      // driven by Q26,Q27
      row({ rowId: '3.7', source: 'edited' }),  // driven by Q19,Q4c,Q4d
    ];
    const result = computeStaleRows(rows, ['Q26']);
    const byId = Object.fromEntries(result.map((r) => [r.rowId, r]));
    expect(byId['3.2'].stale).toBe(true);
    expect(byId['3.2'].staleReason).toContain('Q26');
    expect(byId['3.7'].stale).toBe(false);
  });

  it('does not unflag a row that was already stale for another reason', () => {
    const rows = [row({ rowId: '3.2', stale: true, staleReason: 'Q27 changed' })];
    const result = computeStaleRows(rows, []);
    expect(result[0].stale).toBe(true);
  });
});
