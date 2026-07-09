import { describe, expect, it } from 'vitest';
import { displayReasoning } from '../rowReasoning';
import { appendixMootRowIds } from '../controlType';
import type { AppendixRow, Status } from '../types';

type RowInput = Pick<AppendixRow, 'rowId' | 'status' | 'source' | 'reasoning' | 'ungrounded'>;
const row = (over: Partial<RowInput> & { rowId: string }): RowInput => ({
  status: 'Not triggered' as Status,
  source: 'ai',
  reasoning: null,
  ...over,
});

// A clean, in-scope dossier with no mismatch: 2.2 and 2.3 are moot.
const cleanRows = [
  { rowId: '2.1', status: 'Triggered' as Status },
  { rowId: '2.2', status: 'Not triggered' as Status },
  { rowId: '2.3', status: 'N/A' as Status },
  { rowId: '3.1', status: 'Not triggered' as Status },
];

describe('displayReasoning', () => {
  it('replaces the model paragraph with the short moot line on a moot N/A row', () => {
    const moot = appendixMootRowIds(cleanRows);
    const long = 'The service fees are booked as revenue and taxed there, with USD 61,667 of US income tax on USD 129,337 of pre-tax profit, and the interest is included in the same year, so any mismatch can be absorbed.';
    const out = displayReasoning(row({ rowId: '2.3', status: 'N/A', reasoning: long }), moot);
    expect(out).toBe('No primary-rule mismatch is triggered, so dual-inclusion income does not need to be tested.');
  });

  it('replaces the structured-arrangement paragraph once the parties are associated', () => {
    const moot = appendixMootRowIds(cleanRows);
    const out = displayReasoning(row({ rowId: '2.2', status: 'Not triggered', reasoning: 'A long improvised structured-arrangement analysis about intragroup fees.' }), moot);
    expect(out).toContain('associated enterprises');
  });

  it('keeps a genuine finding on a live status row', () => {
    const moot = appendixMootRowIds(cleanRows);
    const out = displayReasoning(row({ rowId: '3.1', status: 'Triggered', reasoning: 'A hybrid instrument gives a deduction without inclusion.' }), moot);
    expect(out).toBe('A hybrid instrument gives a deduction without inclusion.');
  });

  it('keeps the advisor edit on a moot row the advisor took over', () => {
    const moot = appendixMootRowIds(cleanRows);
    // An edited row reads as a real status control, so its text is preserved.
    const out = displayReasoning(row({ rowId: '2.3', status: 'Not triggered', source: 'edited', reasoning: 'Advisor: dual inclusion confirmed for these flows.' }), moot);
    expect(out).toBe('Advisor: dual inclusion confirmed for these flows.');
  });

  it('strips the stock opener on a non-moot row', () => {
    const out = displayReasoning(row({ rowId: '3.1', reasoning: 'Based on the available information, no hybrid instrument is present.' }), new Set());
    expect(out).toBe('No hybrid instrument is present.');
  });

  it('shows a bare dash for an ungrounded row, not an apology sentence', () => {
    const out = displayReasoning(row({ rowId: '3.1', ungrounded: true, reasoning: '-' }), new Set());
    expect(out).toBe('-');
  });

  it('collapses the legacy "did not return a grounded answer" text to a dash', () => {
    const legacy = 'The model did not return a grounded answer for this row; confirm manually.';
    expect(displayReasoning(row({ rowId: '3.1', reasoning: legacy }), new Set())).toBe('-');
  });

  it('shows a dash for an empty reasoning instead of blank', () => {
    expect(displayReasoning(row({ rowId: '3.1', reasoning: '' }), new Set())).toBe('-');
  });
});
