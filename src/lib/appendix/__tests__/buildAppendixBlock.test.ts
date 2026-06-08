import { describe, it, expect } from 'vitest';
import { buildAppendixBlock } from '@/lib/appendix/buildAppendixBlock';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string, status: AppendixRow['status'], consequence: string): AppendixRow => ({
  rowId,
  aiStatus: status, aiConsequence: consequence, aiFactualBasis: '100% per cap table', aiProvenance: 'Q1 answer: Yes',
  status, consequence, factualBasis: '100% per cap table', provenance: 'Q1 answer: Yes',
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixBlock', () => {
  it('emits one line per row with rowId, status, consequence and factual basis, and never the provenance', () => {
    const out = buildAppendixBlock([row('3.2', 'Not triggered', 'No adjustment.')]);
    expect(out).toContain('3.2');
    expect(out).toContain('Not triggered');
    expect(out).toContain('No adjustment.');
    expect(out).toContain('100% per cap table'); // clean factual basis is fed to the memo
    expect(out).not.toContain('Q1 answer: Yes');  // provenance is internal, never fed in
  });

  it('wraps in a labelled block for the n8n payload', () => {
    const out = buildAppendixBlock([row('3.2', 'Not triggered', 'x')]);
    expect(out.startsWith('<confirmed_appendix>')).toBe(true);
    expect(out.trim().endsWith('</confirmed_appendix>')).toBe(true);
  });
});
