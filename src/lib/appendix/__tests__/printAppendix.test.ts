import { describe, it, expect } from 'vitest';
import { buildAppendixPrintHtml } from '@/lib/appendix/printAppendix';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (
  rowId: string,
  status: AppendixRow['status'],
  consequence: string,
  provenance = 'Q1 answer: Yes',
): AppendixRow => ({
  rowId,
  aiStatus: status, aiConsequence: consequence, aiFactualBasis: 'fact', aiProvenance: provenance,
  status, consequence, factualBasis: 'fact', provenance,
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixPrintHtml', () => {
  it('renders every present row with its legal basis, condition, status and consequence', () => {
    const html = buildAppendixPrintHtml(
      [row('3.2', 'Triggered', 'Deduction denied.'), row('4.1', 'Not triggered', 'No inclusion.')],
      'dossier',
    );
    expect(html).toContain('3.2');
    expect(html).toContain('4.1');
    expect(html).toContain('Deduction denied.');
    expect(html).toContain('payment to a hybrid entity'); // condition tested, from the skeleton
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('includes the internal Provenance column only in the internal artifact', () => {
    const internal = buildAppendixPrintHtml([row('3.2', 'Not triggered', 'x', 'Q26=No')], 'internal');
    const dossier = buildAppendixPrintHtml([row('3.2', 'Not triggered', 'x', 'Q26=No')], 'dossier');
    expect(internal).toContain('Provenance (internal)');
    expect(internal).toContain('Q26=No');
    expect(dossier).not.toContain('Provenance (internal)');
    expect(dossier).not.toContain('Q26=No');
  });

  it('escapes HTML in row content', () => {
    const html = buildAppendixPrintHtml([row('3.2', 'Not triggered', 'a < b & c')], 'dossier');
    expect(html).toContain('a &lt; b &amp; c');
    expect(html).not.toContain('a < b & c');
  });
});
