import { describe, it, expect } from 'vitest';
import { mergeOnRegenerate, computeStaleRows } from '@/lib/appendix/merge';
import type { AppendixRow } from '@/lib/appendix/types';

function row(partial: Partial<AppendixRow> & { rowId: string }): AppendixRow {
  return {
    rowId: partial.rowId,
    aiDecision: partial.aiDecision ?? 'Not applicable',
    aiReasoning: partial.aiReasoning ?? 'ai reason',
    aiReference: partial.aiReference ?? 'Q1=Yes',
    decision: partial.decision ?? partial.aiDecision ?? 'Not applicable',
    reasoning: partial.reasoning ?? partial.aiReasoning ?? 'ai reason',
    reference: partial.reference ?? partial.aiReference ?? 'Q1=Yes',
    source: partial.source ?? 'ai',
    stale: partial.stale ?? false,
    staleReason: partial.staleReason ?? null,
    editedBy: partial.editedBy ?? null,
    editedAt: partial.editedAt ?? null,
  };
}

describe('mergeOnRegenerate', () => {
  it('overwrites ai-source rows with fresh AI values', () => {
    const existing = [row({ rowId: '1.b', source: 'ai', decision: 'Not applicable' })];
    const fresh = [row({ rowId: '1.b', aiDecision: 'Potentially applicable', aiReasoning: 'new', aiReference: 'Q26=Yes' })];
    const merged = mergeOnRegenerate(existing, fresh);
    expect(merged[0].decision).toBe('Potentially applicable');
    expect(merged[0].reasoning).toBe('new');
    expect(merged[0].source).toBe('ai');
  });
  it('keeps the edited current value but refreshes the ai shadow so drift is visible', () => {
    const existing = [row({ rowId: '1.g', source: 'edited', decision: 'Potentially applicable', reasoning: 'human edit', editedBy: 'u1', editedAt: 't1' })];
    const fresh = [row({ rowId: '1.g', aiDecision: 'Not applicable', aiReasoning: 'fresh ai', aiReference: 'Q19=No' })];
    const merged = mergeOnRegenerate(existing, fresh);
    expect(merged[0].decision).toBe('Potentially applicable'); // human value kept
    expect(merged[0].reasoning).toBe('human edit');
    expect(merged[0].aiDecision).toBe('Not applicable');       // ai shadow refreshed
    expect(merged[0].source).toBe('edited');
    expect(merged[0].editedBy).toBe('u1');
  });
  it('adds brand-new fresh rows not present in existing', () => {
    const merged = mergeOnRegenerate([], [row({ rowId: '0.1' })]);
    expect(merged.map((r) => r.rowId)).toContain('0.1');
  });
});

describe('computeStaleRows', () => {
  it('flags only rows whose driving question changed', () => {
    const rows = [
      row({ rowId: '1.b', source: 'ai' }),        // driven by Q26,Q27
      row({ rowId: '1.g', source: 'edited' }),     // driven by Q19,Q4c,Q4d
    ];
    const result = computeStaleRows(rows, ['Q26']);
    const byId = Object.fromEntries(result.map((r) => [r.rowId, r]));
    expect(byId['1.b'].stale).toBe(true);
    expect(byId['1.b'].staleReason).toContain('Q26');
    expect(byId['1.g'].stale).toBe(false);
  });
  it('does not unflag a row that was already stale for another reason', () => {
    const rows = [row({ rowId: '1.b', stale: true, staleReason: 'Q27 changed' })];
    const result = computeStaleRows(rows, []);
    expect(result[0].stale).toBe(true);
  });
});
