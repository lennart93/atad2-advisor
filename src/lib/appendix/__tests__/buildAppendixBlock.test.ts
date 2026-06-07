import { describe, it, expect } from 'vitest';
import { buildAppendixBlock } from '@/lib/appendix/buildAppendixBlock';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string, decision: string, reasoning: string): AppendixRow => ({
  rowId, aiDecision: decision as AppendixRow['decision'], aiReasoning: reasoning, aiReference: 'Q1=Yes',
  decision: decision as AppendixRow['decision'], reasoning, reference: 'Q1=Yes',
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixBlock', () => {
  it('emits one line per row with rowId, decision and reasoning, and never the reference', () => {
    const out = buildAppendixBlock([row('1.b', 'Not applicable', 'No hybrid entity.')]);
    expect(out).toContain('1.b');
    expect(out).toContain('Not applicable');
    expect(out).toContain('No hybrid entity.');
    expect(out).not.toContain('Q1=Yes'); // reference is internal, never fed to the memo
  });
  it('wraps in a labelled block for the n8n payload', () => {
    const out = buildAppendixBlock([row('1.b', 'Not applicable', 'x')]);
    expect(out.startsWith('<confirmed_appendix>')).toBe(true);
    expect(out.trim().endsWith('</confirmed_appendix>')).toBe(true);
  });
});
