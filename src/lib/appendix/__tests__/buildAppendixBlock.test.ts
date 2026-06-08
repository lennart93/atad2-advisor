import { describe, it, expect } from 'vitest';
import { buildAppendixBlock } from '@/lib/appendix/buildAppendixBlock';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string, status: AppendixRow['status'], reasoning: string, excluded = false): AppendixRow => ({
  rowId,
  aiStatus: status, aiReasoning: reasoning, aiProvenance: 'Q1 answer: Yes',
  status, reasoning, provenance: 'Q1 answer: Yes',
  excludedFromClient: excluded,
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixBlock', () => {
  it('emits one line per row with rowId, status and reasoning, and never the provenance', () => {
    const out = buildAppendixBlock([row('3.2', 'Not triggered', 'No hybrid entity is involved, the BV pays a third-party bank.')]);
    expect(out).toContain('3.2');
    expect(out).toContain('Not triggered');
    expect(out).toContain('No hybrid entity is involved');
    expect(out).not.toContain('Q1 answer: Yes');
  });

  it('drops rows excluded from the client export', () => {
    const out = buildAppendixBlock([
      row('3.1', 'Triggered', 'Kept reasoning.'),
      row('3.2', 'Triggered', 'Excluded reasoning.', true),
    ]);
    expect(out).toContain('Kept reasoning.');
    expect(out).not.toContain('Excluded reasoning.');
  });

  it('wraps in a labelled block for the n8n payload', () => {
    const out = buildAppendixBlock([row('3.2', 'Not triggered', 'x')]);
    expect(out.startsWith('<confirmed_appendix>')).toBe(true);
    expect(out.trim().endsWith('</confirmed_appendix>')).toBe(true);
  });
});
