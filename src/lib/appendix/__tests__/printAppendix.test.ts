import { describe, it, expect } from 'vitest';
import { buildAppendixPrintHtml } from '@/lib/appendix/printAppendix';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string, decision: string, reasoning: string, reference = 'Q1=Yes'): AppendixRow => ({
  rowId, aiDecision: decision as AppendixRow['decision'], aiReasoning: reasoning, aiReference: reference,
  decision: decision as AppendixRow['decision'], reasoning, reference,
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixPrintHtml', () => {
  it('renders every present row with its legal framework, decision and reasoning', () => {
    const html = buildAppendixPrintHtml([row('1.b', 'Not applicable', 'No hybrid entity.'), row('2.1', 'Not applicable', 'No upstream mismatch.')], false);
    expect(html).toContain('1.b');
    expect(html).toContain('2.1');
    expect(html).toContain('No hybrid entity.');
    expect(html).toContain('payment to a hybrid entity'); // from the skeleton label
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });
  it('includes the internal Reference column only when showRefs is true', () => {
    const withRefs = buildAppendixPrintHtml([row('1.b', 'Not applicable', 'x', 'Q26=No')], true);
    const withoutRefs = buildAppendixPrintHtml([row('1.b', 'Not applicable', 'x', 'Q26=No')], false);
    expect(withRefs).toContain('Reference (internal)');
    expect(withRefs).toContain('Q26=No');
    expect(withoutRefs).not.toContain('Reference (internal)');
    expect(withoutRefs).not.toContain('Q26=No');
  });
  it('escapes HTML in row content', () => {
    const html = buildAppendixPrintHtml([row('1.b', 'Not applicable', 'a < b & c')], false);
    expect(html).toContain('a &lt; b &amp; c');
    expect(html).not.toContain('a < b & c');
  });
});
