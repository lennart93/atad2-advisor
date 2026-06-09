import { describe, it, expect } from 'vitest';
import { buildAppendixPrintHtml } from '@/lib/appendix/printAppendix';
import type { AppendixRow, AppendixFacts } from '@/lib/appendix/types';

const facts = (): AppendixFacts => ({
  entities: [{ id: 'E1', chartEntityId: 'c1', name: 'Acme BV', jurisdiction: 'NL', entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' }],
  actingTogether: [],
  classifications: [],
  transactions: [],
});

const row = (
  rowId: string,
  status: AppendixRow['status'],
  reasoning: string,
  opts: { provenance?: string; excluded?: boolean } = {},
): AppendixRow => ({
  rowId,
  aiStatus: status, aiReasoning: reasoning, aiProvenance: opts.provenance ?? 'Q1 answer: Yes',
  status, reasoning, provenance: opts.provenance ?? 'Q1 answer: Yes',
  excludedFromClient: opts.excluded ?? false,
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixPrintHtml', () => {
  it('dossier renders rows with renumbered codes, condition, status and reasoning', () => {
    const html = buildAppendixPrintHtml(
      [row('3.1', 'Triggered', 'First.'), row('3.2', 'Triggered', 'Deduction denied at the Dutch level.')],
      'dossier',
    );
    expect(html).toContain('1.1');                          // 3.1 renumbered
    expect(html).toContain('1.2');                          // 3.2 renumbered
    expect(html).toContain('Deduction denied at the Dutch level.');
    expect(html).toContain('payment to a hybrid entity');   // condition from the skeleton
    expect(html).toContain('Reasoning');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('internal keeps the original numbering and the provenance column; dossier does not', () => {
    const internal = buildAppendixPrintHtml([row('3.2', 'Not triggered', 'x', { provenance: 'Q26=No' })], 'internal');
    const dossier = buildAppendixPrintHtml([row('3.2', 'Not triggered', 'x', { provenance: 'Q26=No' })], 'dossier');
    expect(internal).toContain('3.2');
    expect(internal).toContain('Provenance (internal)');
    expect(internal).toContain('Q26=No');
    expect(dossier).not.toContain('Provenance (internal)');
    expect(dossier).not.toContain('Q26=No');
  });

  it('dossier drops excluded rows; internal shows them marked', () => {
    const rows = [row('3.1', 'Triggered', 'Kept.'), row('3.2', 'Triggered', 'Hidden.', { excluded: true })];
    const dossier = buildAppendixPrintHtml(rows, 'dossier');
    const internal = buildAppendixPrintHtml(rows, 'internal');
    expect(dossier).toContain('Kept.');
    expect(dossier).not.toContain('Hidden.');
    expect(internal).toContain('Hidden.');
    expect(internal).toContain('excluded');
  });

  it('escapes HTML in row content', () => {
    const html = buildAppendixPrintHtml([row('3.2', 'Not triggered', 'a < b & c')], 'dossier');
    expect(html).toContain('a &lt; b &amp; c');
    expect(html).not.toContain('a < b & c');
  });

  it('renders Part A: dossier shows the NL-perspective classification + names, hides internal codes; internal shows E# codes', () => {
    const dossier = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'dossier', undefined, facts());
    const internal = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'internal', undefined, facts());
    expect(dossier).toContain('Part A');
    expect(dossier).toContain('Acme BV');
    expect(dossier).toContain('Classification (NL perspective)');
    expect(dossier).toContain('Non-transparent');  // derived from the 'resident' tax status
    expect(dossier).not.toContain('E1');            // internal code hidden in the dossier
    expect(internal).toContain('E1');               // Ref column in the internal entity register
  });
});
