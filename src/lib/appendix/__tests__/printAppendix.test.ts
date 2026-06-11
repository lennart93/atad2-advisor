import { describe, it, expect } from 'vitest';
import { buildAppendixPrintHtml } from '@/lib/appendix/printAppendix';
import type { AppendixRow, AppendixFacts, AppendixSectionKey } from '@/lib/appendix/types';

const facts = (): AppendixFacts => ({
  entities: [{ id: 'E1', chartEntityId: 'c1', name: 'Acme BV', jurisdiction: 'NL', entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' }],
  actingTogether: [],
  classifications: [],
  transactions: [],
});

const richFacts = (excludedSections?: AppendixSectionKey[]): AppendixFacts => ({
  entities: [
    { id: 'E1', chartEntityId: 'c1', name: 'Acme BV', jurisdiction: 'NL', entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' },
    { id: 'E2', chartEntityId: 'c2', name: 'Sub Inc', jurisdiction: 'US', entityType: 'corporation', role: 'Subsidiary', ownershipPct: 100, related: true, nlTaxStatus: 'outside_cit' },
  ],
  actingTogether: [{ id: 'A1', memberEntityIds: ['E1', 'E2'], combinedPct: 50, likelihood: 'likely', reasoning: 'coordination present', excludedFromClient: false, source: 'ai' }],
  classifications: [{ entityId: 'E2', homeState: 'US', homeClass: 'opaque', sourceState: 'NL', sourceClass: 'transparent', hybrid: true, status: 'confirmed', excludedFromClient: false, source: 'ai' }],
  transactions: [{ id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: 'note', note: null, articlesTested: ['12aa(1)(a)'], status: 'confirmed', excludedFromClient: false, source: 'ai' }],
  excludedSections,
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

  it('renders Part A: dossier shows the funnel classification + names, hides internal codes; internal shows E# codes', () => {
    const dossier = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'dossier', undefined, facts());
    const internal = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'internal', undefined, facts());
    expect(dossier).toContain('Part A');
    expect(dossier).toContain('Acme BV');
    expect(dossier).toContain('A.3 · Classification of the relevant entities');
    expect(dossier).toContain('Non-transparent');  // derived from the 'resident' tax status
    expect(dossier).not.toContain('E1');            // internal code hidden in the dossier
    expect(internal).toContain('E1');               // Ref column in the internal register
  });

  it('dossier drops whole Part A sections the advisor excluded; internal keeps them', () => {
    const kept = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'dossier', undefined, richFacts());
    expect(kept).toContain('A.1 · The group and the taxpayer');
    expect(kept).toContain('A.2 · Related parties');
    expect(kept).toContain('Acting together');
    expect(kept).toContain('A.4 · Relevant transactions');
    expect(kept).toContain('A.3 · Classification of the relevant entities');

    const allExcluded: AppendixSectionKey[] = ['entityRegister', 'relatedness', 'actingTogether', 'classification', 'transactions'];
    const excl = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'dossier', undefined, richFacts(allExcluded));
    expect(excl).not.toContain('A.1 ·');
    expect(excl).not.toContain('A.2 ·');
    expect(excl).not.toContain('A.3 ·');
    expect(excl).not.toContain('A.4 ·');
    expect(excl).not.toContain('Acting together');
    // With every section dropped the whole Part A disappears, strip included.
    expect(excl).not.toContain('Part A');

    // The internal working copy ignores the exclusions entirely.
    const internal = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'internal', undefined, richFacts(allExcluded));
    expect(internal).toContain('A.1 · The group and the taxpayer');
    expect(internal).toContain('Acting together');
  });

  it('relatedness exclusion drops the related-parties section, not the register', () => {
    const html = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'dossier', undefined, richFacts(['relatedness']));
    expect(html).toContain('A.1 · The group and the taxpayer');
    expect(html).not.toContain('A.2 · Related parties');
    const kept = buildAppendixPrintHtml([row('3.2', 'Triggered', 'x')], 'dossier', undefined, richFacts());
    expect(kept).toContain('A.2 · Related parties');
  });
});

describe('part A funnel export', () => {
  const ent = (id: string, name: string, jur: string, role = 'Group entity', extra: Record<string, unknown> = {}) => ({
    id, chartEntityId: `c-${id}`, name, jurisdiction: jur, entityType: 'corporation', role,
    ownershipPct: null, related: true, nlTaxStatus: 'resident', ...extra,
  });
  const baseFacts = {
    entities: [ent('E1', 'Tax BV', 'NL', 'Taxpayer'), ent('E2', 'US Inc', 'US')],
    transactions: [
      { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null,
        articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai',
        relevant: true, relevanceReason: 'Cross-border to a related party' },
      { id: 'T2', fromEntityId: 'E1', toEntityId: 'E2', kind: 'service', instrument: null, note: null,
        articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai',
        relevant: false, relevanceReason: 'Within the fiscal unity' },
    ],
    classifications: [], actingTogether: [],
    narratives: { register: { text: 'The group narrative.', source: 'ai' } },
  } as never;

  it('renders the summary strip, the narrative and the accounted line', () => {
    const html = buildAppendixPrintHtml([], 'dossier', undefined, baseFacts);
    expect(html).toContain('Cross-border transactions with related parties');
    expect(html).toContain('The group narrative.');
    expect(html).toContain('1 transaction not relevant: Within the fiscal unity');
    expect(html).toContain('Why relevant');
    expect(html).toContain('Cross-border to a related party');
    expect(html).not.toContain('service'); // accounted flow not in the relevant table
  });

  it('drops sub-likely acting-together clusters from the dossier with an accounted line', () => {
    const f = { ...(baseFacts as Record<string, unknown>), actingTogether: [
      { id: 'A1', memberEntityIds: ['E1', 'E2'], combinedPct: 30, likelihood: 'unlikely', reasoning: 'no coordination', excludedFromClient: false, source: 'ai' },
    ] } as never;
    const html = buildAppendixPrintHtml([], 'dossier', undefined, f);
    expect(html).not.toContain('no coordination');
    expect(html).toContain('1 candidate grouping was considered and not assessed as likely');
  });

  it('dossier strip does not count client-excluded flows', () => {
    const f = { ...(baseFacts as Record<string, unknown>), transactions: [
      { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null,
        articlesTested: [], status: 'confirmed', excludedFromClient: true, source: 'ai',
        relevant: true, relevanceReason: 'Cross-border to a related party' },
    ] } as never;
    const html = buildAppendixPrintHtml([], 'dossier', undefined, f);
    expect(html).toContain('None identified');
    expect(html).not.toContain('1 identified'); // strip follows the filtered base, not the raw facts
  });

  it('classifies only in-scope entities and accounts for the rest', () => {
    const f = { ...(baseFacts as Record<string, unknown>), entities: [
      ent('E1', 'Tax BV', 'NL', 'Taxpayer'), ent('E2', 'US Inc', 'US'), ent('E3', 'Idle BV', 'NL'),
    ] } as never;
    const html = buildAppendixPrintHtml([], 'dossier', undefined, f);
    expect(html).toContain('A.3 · Classification');
    // Idle BV is a related party (A.2) but must not reach the classification table (A.3),
    // which now precedes the flows section.
    const partA4 = html.slice(html.indexOf('A.3 ·'), html.indexOf('A.4 ·'));
    expect(partA4).not.toContain('Idle BV');
    expect(html).toContain('The remaining 1 group entity is not party to a relevant transaction');
  });
});
