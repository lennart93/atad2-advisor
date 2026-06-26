import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { buildMemoAppendicesXml } from '@/lib/appendix/docx/memoAppendices';
import type { AppendixFacts, AppendixRow, SkeletonRow } from '@/lib/appendix/types';

// The parser the app uses, reduced to what matters here: raw OOXML for the
// appendices/section properties must pass through untouched (see DownloadMemoButton).
const dotParser = (tag: string) => ({
  get: (scope: Record<string, unknown>) => {
    const path = tag.trim();
    if (path === 'appendicesXml') return (scope?.appendicesXml as string) ?? '';
    if (path === '.' || path === '') return scope;
    return path.split('.').reduce<unknown>(
      (o, k) => (o == null ? o : (o as Record<string, unknown>)[k]),
      scope,
    );
  },
});

const TEMPLATE = resolve(process.cwd(), 'templates/memo_atad2_with_structure_placeholder.docx');

const DOC_DATA = {
  meta: { taxpayer_name: 'Dutch BidCo BV', fiscal_year: '2024', today_long: '13 June 2026', user_full_name: 'Tester' },
  sections: {
    introduction: 'i', risk_outcome_line: 'Low', executive_summary_intro: 's', executive_summary_bullets: [],
    general_background_intro: 'b', general_background_bullets: [], technical_assessment: 't',
    conclusion_intro: 'c', conclusion_next_steps_bullets: [],
  },
  hasStructureChart: false,
  structureChart: '',
};

function render(appendicesXml: string): Buffer {
  const buf = readFileSync(TEMPLATE);
  const doc = new Docxtemplater(new PizZip(buf), {
    paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' }, nullGetter: () => '', parser: dotParser,
  });
  doc.render({ ...DOC_DATA, appendicesXml });
  return doc.getZip().generate({ type: 'nodebuffer' });
}
const xmlOf = (out: Buffer) => new PizZip(out).file('word/document.xml')!.asText();

const facts: AppendixFacts = {
  entities: [
    { id: 'E1', chartEntityId: 'c1', name: 'Dutch BidCo B.V.', jurisdiction: 'NL', entityType: null, role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' },
    { id: 'E2', chartEntityId: 'c2', name: 'LuxParent S.à r.l.', jurisdiction: 'LU', entityType: null, role: 'Parent', ownershipPct: 60, related: true, nlTaxStatus: 'outside_cit' },
  ],
  actingTogether: [], classifications: [],
  transactions: [
    { id: 'T1', fromEntityId: 'E2', toEntityId: 'E1', kind: 'financing', instrument: 'loan', note: null, articlesTested: ['12aa(1)(a)'], relevanceReason: 'Interest deduction in NL', status: 'confirmed', excludedFromClient: false, source: 'ai' },
  ],
};
const skeleton: SkeletonRow[] = [
  { rowId: '1.1', sectionId: '1', sectionTitle: 'Scope and taxpayer status', legalBasis: 'Article 2 CIT Act', conditionTested: 'In scope.', effect: null, kind: 'gate', allowedStates: ['Triggered', 'Not triggered', 'Insufficient information'], drivenByQuestionIds: [], relatedView: 'none' },
];
const rows: AppendixRow[] = [
  { rowId: '1.1', aiStatus: 'Triggered', aiReasoning: 'Resident.', aiProvenance: 'x', status: 'Triggered', reasoning: 'Resident company.', provenance: 'x', excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null },
];

describe('memo template renders the generated appendices + section properties', () => {
  it('requires the patched repo template (no static sectPr)', () => {
    expect(existsSync(TEMPLATE), 'run scripts/patch-memo-template.cjs').toBe(true);
    const xml = new PizZip(readFileSync(TEMPLATE)).file('word/document.xml')!.asText();
    expect((xml.match(/<w:sectPr\b/g) ?? []).length).toBe(0); // generator supplies the sectPr
    expect(xml).toContain('{{@appendicesXml}}');
  });

  it('injects Appendix 1 + 2 into a valid single-section .docx (Arabic, no Roman)', () => {
    const out = render(buildMemoAppendicesXml(facts, rows, skeleton));
    expect(out.slice(0, 2).toString('hex')).toBe('504b');
    const xml = xmlOf(out);
    expect(xml).toContain('Appendix 1: Facts and relationships');
    expect(xml).toContain('Appendix 2: Condition-by-condition assessment');
    expect(xml).toContain('Dutch BidCo BV'); // suffix normalized (no dots)
    expect(xml).not.toContain('appendicesXml'); // placeholder consumed
    // One decimal page-number section throughout; no Roman numerals.
    expect((xml.match(/<w:sectPr\b/g) ?? []).length).toBe(1);
    expect(xml).toContain('<w:pgNumType w:fmt="decimal"/>');
    expect(xml).not.toContain('lowerRoman');
    expect(xml).toContain('w:left="1134"'); // 2 cm margins
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>'); // fixed layout
    expect(xml).toContain('<w:cantSplit/>'); // condition rows kept together
    expect(xml).toContain('B.1 Scope and taxpayer status'); // Appendix 2 B. prefix
  });

  it('emits only a decimal body section when there is no appendix content', () => {
    const out = render(buildMemoAppendicesXml(null, [], skeleton));
    expect(out.slice(0, 2).toString('hex')).toBe('504b');
    const xml = xmlOf(out);
    expect((xml.match(/<w:sectPr\b/g) ?? []).length).toBe(1);
    expect(xml).toContain('<w:pgNumType w:fmt="decimal"/>');
    expect(xml).not.toContain('lowerRoman');
    expect(xml).not.toContain('Appendix 1');
  });

  it('stays a valid .docx when appendix fields contain XML-illegal control characters', () => {
    const ctrl = String.fromCharCode(0x00, 0x0b, 0x0c, 0x1b);
    const dirtyFacts: AppendixFacts = {
      entities: [{ id: 'E1', chartEntityId: 'c1', name: `BidCo${ctrl} B.V.`, jurisdiction: 'NL', entityType: null, role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' }],
      actingTogether: [], classifications: [], transactions: [],
    };
    const dirtyRows: AppendixRow[] = [
      { rowId: '1.1', aiStatus: 'Triggered', aiReasoning: 'x', aiProvenance: 'x', status: 'Triggered', reasoning: `Resident${ctrl} company.`, provenance: 'x', excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null },
    ];
    const out = render(buildMemoAppendicesXml(dirtyFacts, dirtyRows, skeleton));
    expect(out.slice(0, 2).toString('hex')).toBe('504b');
    const xml = xmlOf(out);
    const hasIllegal = [...xml].some((ch) => {
      const c = ch.charCodeAt(0);
      return c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d;
    });
    expect(hasIllegal).toBe(false);
    expect(xml).toContain('BidCo BV');
  });
});
