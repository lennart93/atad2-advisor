import { describe, it, expect } from 'vitest';
import { buildMemoAppendicesXml } from '@/lib/appendix/docx/memoAppendices';
import { statusDisplayLabel } from '@/lib/appendix/status';
import type {
  ActingTogetherCluster,
  AppendixFacts,
  AppendixRow,
  ClassificationItem,
  FactEntity,
  SkeletonRow,
  Status,
  TransactionItem,
} from '@/lib/appendix/types';

// --- fixtures --------------------------------------------------------------

const ent = (e: Partial<FactEntity> & Pick<FactEntity, 'id' | 'name' | 'role'>): FactEntity => ({
  chartEntityId: `c-${e.id}`,
  jurisdiction: null,
  entityType: null,
  ownershipPct: null,
  related: false,
  nlTaxStatus: 'resident',
  ...e,
});

const cls = (c: Partial<ClassificationItem> & Pick<ClassificationItem, 'entityId' | 'homeState' | 'homeClass'>): ClassificationItem => ({
  sourceState: null,
  sourceClass: null,
  hybrid: false,
  status: 'confirmed',
  excludedFromClient: false,
  source: 'ai',
  ...c,
});

const tx = (t: Partial<TransactionItem> & Pick<TransactionItem, 'id' | 'fromEntityId' | 'toEntityId' | 'kind'>): TransactionItem => ({
  instrument: null,
  note: null,
  articlesTested: [],
  status: 'confirmed',
  excludedFromClient: false,
  source: 'ai',
  ...t,
});

const cluster = (a: Partial<ActingTogetherCluster> & Pick<ActingTogetherCluster, 'id' | 'memberEntityIds' | 'likelihood'>): ActingTogetherCluster => ({
  combinedPct: null,
  reasoning: '',
  excludedFromClient: false,
  source: 'ai',
  ...a,
});

const facts: AppendixFacts = {
  entities: [
    ent({ id: 'E1', name: 'Dutch BidCo B.V.', role: 'Taxpayer', jurisdiction: 'NL', nlTaxStatus: 'resident' }),
    ent({ id: 'E2', name: 'LuxParent S.à r.l.', role: 'Parent', jurisdiction: 'LU', ownershipPct: 60, related: true, nlTaxStatus: 'outside_cit' }),
    ent({ id: 'E3', name: 'German OpCo GmbH', role: 'Subsidiary', jurisdiction: 'DE', ownershipPct: 100, related: true, directLink: true, nlTaxStatus: 'resident' }),
    // Hybrid mismatch: NL non-transparent vs local transparent.
    ent({ id: 'E4', name: 'Swiss Finance AG', role: 'Group entity', jurisdiction: 'CH', relatedViaPct: 30, related: false, nlTaxStatus: 'resident' }),
    // Below 25%, no difference; name exercises XML escaping.
    ent({ id: 'E5', name: 'Acme & Sons <Holding>', role: 'Group entity', jurisdiction: 'BE', ownershipPct: 10, related: false, nlTaxStatus: 'resident' }),
    // Party to a relevant transaction, local qualification undetermined -> "To be determined".
    ent({ id: 'E6', name: 'Jersey Co Ltd', role: 'Group entity', jurisdiction: 'JE', related: false, nlTaxStatus: 'resident' }),
  ],
  actingTogether: [
    // A manually-built group (origin 'manual') reaches the client appendix + memo.
    cluster({ id: 'A1', memberEntityIds: ['E2', 'E4'], combinedPct: 90, likelihood: 'likely', origin: 'manual', basis: 'shareholders_agreement', reasoning: 'Co-investors under a shareholders agreement.' }),
    // A non-binding AI hint (origin undefined) never reaches the client.
    cluster({ id: 'A2', memberEntityIds: ['E5'], likelihood: 'unlikely', reasoning: 'No coordination shown.' }),
  ],
  classifications: [
    cls({ entityId: 'E4', homeState: 'CH', homeClass: 'transparent', hybrid: true }),
    cls({ entityId: 'E6', homeState: 'JE', homeClass: '' }),
  ],
  transactions: [
    tx({ id: 'T1', fromEntityId: 'E1', toEntityId: 'E6', kind: 'financing', instrument: 'loan', relevanceReason: 'Interest deduction in NL', articlesTested: ['12aa(1)(a)'] }),
    tx({ id: 'T2', fromEntityId: 'E2', toEntityId: 'E3', kind: 'royalty', relevant: false, relevanceReason: 'Within same tax group' }),
  ],
};

const skeleton: SkeletonRow[] = [
  { rowId: 's1r1', sectionId: '1', sectionTitle: 'Scope and taxpayer status', legalBasis: 'Article 2 CIT Act', conditionTested: 'The taxpayer is within scope of ATAD2.', effect: null, kind: 'gate', allowedStates: ['Triggered', 'Not triggered', 'Insufficient information'], drivenByQuestionIds: [], relatedView: 'none' },
  { rowId: 's1r2', sectionId: '1', sectionTitle: 'Scope and taxpayer status', legalBasis: 'Article 3 CIT Act', conditionTested: 'Non-resident with a Dutch permanent establishment.', effect: null, kind: 'gate', allowedStates: ['Triggered', 'Not triggered', 'Insufficient information'], drivenByQuestionIds: [], relatedView: 'none' },
  { rowId: 's3r1', sectionId: '3', sectionTitle: 'Primary rule: hybrid mismatches (art. 12aa)', legalBasis: 'Article 12aa(1)(a) CIT Act', conditionTested: 'A deduction without inclusion arises on a hybrid instrument.', effect: 'D/NI', kind: 'operative', allowedStates: ['Triggered', 'Not triggered', 'Insufficient information'], drivenByQuestionIds: [], relatedView: 'none' },
];

const condRow = (rowId: string, status: Status, reasoning: string): AppendixRow => ({
  rowId,
  aiStatus: status, aiReasoning: reasoning, aiProvenance: 'internal trail',
  status, reasoning, provenance: 'internal trail',
  excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

const rows: AppendixRow[] = [
  condRow('s1r1', 'Triggered', 'The taxpayer is a Dutch resident company within scope.'),
  condRow('s1r2', 'Not triggered', 'No non-resident permanent establishment.'),
  condRow('s3r1', 'Insufficient information', 'The loan agreement is required to confirm the foreign treatment.'),
];

// --- tests -----------------------------------------------------------------

describe('statusDisplayLabel', () => {
  it('uses one status vocabulary, with the short Insufficient label', () => {
    expect(statusDisplayLabel('Triggered')).toBe('Triggered');
    expect(statusDisplayLabel('Not triggered')).toBe('Not triggered');
    expect(statusDisplayLabel('N/A')).toBe('N/A');
    expect(statusDisplayLabel('Insufficient information')).toBe('Insufficient info');
    expect(statusDisplayLabel(null)).toBe('');
  });
});

describe('buildMemoAppendicesXml', () => {
  const xml = buildMemoAppendicesXml(facts, rows, skeleton);

  it('renders both appendix headings (handoff 68 titles)', () => {
    expect(xml).toContain('Appendix 1: Classification and transaction overview');
    expect(xml).toContain('Appendix 2: Technical overview');
  });

  it('groups entities under sentence-case headings and lists the Other group in full', () => {
    // Group headings are plain sentence-case labels (handoff 68, fix 0): no
    // uppercase eyebrows, and the Other heading carries no right-hand caption.
    expect(xml).toContain('>The taxpayer<');
    expect(xml).toContain('>Related<');
    expect(xml).toContain('>Other<');
    expect(xml).not.toContain('THE TAXPAYER');
    expect(xml).not.toContain('RELATED AND RELEVANT');
    expect(xml).not.toContain('OTHER GROUP ENTITIES');
    expect(xml).not.toContain('below the 25% threshold');
    expect(xml).not.toContain('no qualification difference');
    // E5 + E6 are below threshold and must both appear, not be collapsed.
    expect(xml).toContain('Jersey Co Ltd');
  });

  it('renders the Other entities in the same ink as every other row (not dimmed)', () => {
    // A muted row used to print its name in faint grey; every name run is now ink.
    const nameRun = (name: string) =>
      new RegExp(`<w:rPr><w:b/><w:color w:val="([0-9A-F]{6})"/>(?:<w:sz[^>]*/><w:szCs[^>]*/>)?</w:rPr><w:t xml:space="preserve">${name}`);
    const other = xml.match(nameRun('Jersey Co Ltd'));
    const taxpayer = xml.match(nameRun('Dutch BidCo BV'));
    expect(other?.[1]).toBe('1A1A1A');
    expect(taxpayer?.[1]).toBe('1A1A1A');
  });

  it('escapes XML-special characters in entity names', () => {
    expect(xml).toContain('Acme &amp; Sons &lt;Holding&gt;');
    expect(xml).not.toContain('Acme & Sons <Holding>');
  });

  it('shows one classification column and a home-state line for every foreign entity', () => {
    expect(xml).not.toContain('To be determined (JE)'); // old two-column format
    // Every foreign entity always carries a home-state line, using the same
    // 4-value vocabulary Appendix 1 shows on screen, even when still undetermined.
    expect(xml).toContain('JE: To be determined'); // unset local view still shows a line
    expect(xml).toContain('LU: To be determined'); // no classification entry -> still a line
    expect(xml).toContain('CH: Transparent'); // the hybrid mismatch entity
    // The old "not set" wording is gone; the shared vocabulary is used instead.
    expect(xml).not.toContain('qualification not set');
    // A Dutch entity prints its classification exactly once, no local echo.
    expect(xml).not.toContain('NL: Non-transparent');
    expect(xml).not.toContain('NL: To be determined');
  });

  it('shows the manual acting-together group and never the candidate-grouping line', () => {
    expect(xml).toContain('Co-investors under a shareholders agreement.');
    // A non-binding AI hint (A2) stays internal: it never reaches the client memo.
    expect(xml).not.toContain('No coordination shown.');
    // Handoff 68 fix 2: the accounting sentence must never print.
    expect(xml).not.toContain('candidate grouping');
    expect(xml).not.toContain('left out of the client annex');
    expect(xml).not.toContain('No entities that could form an acting-together group have been identified.');
  });

  it('splits transactions into needs-assessment and no-risk groups, all listed', () => {
    expect(xml).toContain('Needs assessment');
    expect(xml).toContain('1 transaction, risk indicator present');
    expect(xml).toContain('Interest deduction in NL'); // its reason line
    expect(xml).toContain('No risk identified'); // the assessed group + verdict use the shared vocabulary
    expect(xml).toContain('1 transaction, listed in full');
    expect(xml).toContain('Within same tax group');
    // Jurisdictions ride inline with the two parties.
    expect(xml).toContain('(NL)');
    expect(xml).toContain('(JE)');
    // The old vocabulary and six-column layout are gone.
    expect(xml).not.toContain('Risk indicator');
    expect(xml).not.toContain('No hybrid element');
    expect(xml).not.toContain('Assessed, no risk indicator');
    expect(xml).not.toContain('Why relevant');
    expect(xml).not.toContain('Transactions assessed as not relevant');
  });

  it('lists proposed (unconfirmed) transactions too, none summarised away', () => {
    // The generator stores every flow as 'proposed'; the export must still list it.
    const proposedFacts: AppendixFacts = {
      ...facts,
      transactions: facts.transactions.map((t) => ({ ...t, status: 'proposed' as const })),
    };
    const out = buildMemoAppendicesXml(proposedFacts, rows, skeleton);
    expect(out).toContain('Interest deduction in NL');
    expect(out).toContain('Within same tax group');
    expect(out).not.toContain('No intra-group transactions identified.');
  });

  it('renders Appendix 2 with the unified status labels and no per-section tally', () => {
    expect(xml).toContain('Triggered');
    expect(xml).toContain('Not triggered');
    expect(xml).toContain('Insufficient info'); // short label
    expect(xml).not.toContain('Insufficient information'); // raw status never leaks
    expect(xml).not.toContain('Could not be assessed');
    // The per-section count line is removed; only the section heading remains.
    expect(xml).not.toContain('conditions · ');
    expect(xml).not.toContain('insufficient · ');
  });

  it('applies the standard-document style to every appendix table (handoff 68)', () => {
    // Hairline tables: one light horizontal rule token everywhere, no vertical rules.
    expect(xml).toContain('w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2DED6"');
    expect(xml).not.toContain('E7E5E1'); // the old house-style hair token is gone
    expect(xml).toContain('w:insideV w:val="none"');
    expect(xml).not.toContain('w:color="BFBFBF"'); // the old full grey grid is gone
    // Column headers: normal weight, dark ink, sentence case; no bold, no caps
    // eyebrow, no letter-spacing, no teal. Only the near-black rule separates.
    expect(xml).toContain('<w:color w:val="1A1A1A"/><w:sz w:val="19"/>');
    expect(xml).toContain('<w:bottom w:val="single" w:sz="8" w:space="0" w:color="111111"/>');
    expect(xml).not.toContain('455F5B'); // teal eyebrow gone (headers + underline)
    expect(xml).not.toContain('<w:spacing w:val="24"/>');
    expect(xml).not.toContain('<w:spacing w:val="36"/>');
    expect(xml).not.toContain('<w:b/><w:color w:val="7A756B"/>'); // old grey caps header
    // Group headings carry no shaded band.
    expect(xml).not.toContain('w:fill="FBFAF9"');
    // The transaction group counts sit flush right on a right tab stop.
    expect(xml).toContain('<w:tab w:val="right" w:pos="9518"/>');
    expect(xml).toContain('<w:r><w:tab/></w:r>');
  });

  it('shades the whole Appendix 2 status cell with the tool palette', () => {
    // s1r1 Triggered (risk_if_met default) -> red; s1r2 Not triggered -> green;
    // s3r1 Insufficient information -> amber. Icon + label share the cell ink.
    expect(xml).toContain('w:fill="F7EBE4"'); // red cell (Triggered)
    expect(xml).toContain('w:color w:val="A5392B"');
    expect(xml).toContain('▲');
    expect(xml).toContain('w:fill="EEF0E4"'); // green cell (Not triggered)
    expect(xml).toContain('w:color w:val="55632F"');
    expect(xml).toContain('✓');
    expect(xml).toContain('w:fill="F8F0DA"'); // amber cell (Insufficient info)
    expect(xml).toContain('w:color w:val="8A6A1C"');
    expect(xml).toContain('◷');
    // The old ▪ marker and its terracotta/teal/taupe inks are gone.
    expect(xml).not.toContain('▪');
    expect(xml).not.toContain('C96F53');
    expect(xml).not.toContain('605C55');
    expect(xml).not.toContain('A39E94');
  });

  it('renders an N/A status as a grey shaded cell with a dash-circle', () => {
    const naRows: AppendixRow[] = [condRow('s1r1', 'N/A', 'Scope gate satisfied, not a risk.')];
    const naXml = buildMemoAppendicesXml(null, naRows, skeleton, { includeChecklist: true });
    expect(naXml).toContain('w:fill="F4F2EC"');
    expect(naXml).toContain('w:color w:val="8A857B"');
    expect(naXml).toContain('⊖');
    expect(naXml).toContain('N/A');
  });

  it('labels a satisfied real gate row "Applicable" in green', () => {
    // 1.1 is a real gate id (controlType.GATE_ROWS); N/A there = the gate is
    // satisfied, which the memo prints as a green "Applicable", like the tool.
    const gateSkeleton: SkeletonRow[] = [
      { ...skeleton[0], rowId: '1.1' },
    ];
    const gateXml = buildMemoAppendicesXml(null, [condRow('1.1', 'N/A', 'In scope.')], gateSkeleton, { includeChecklist: true });
    expect(gateXml).toContain('Applicable');
    expect(gateXml).toContain('w:fill="EEF0E4"');
    expect(gateXml).not.toContain('>N/A<');
  });

  it('prefixes the condition name with a small black code, name in ink', () => {
    // All appendix text is black now; the code is set apart by size, not colour.
    expect(xml).toContain('<w:color w:val="1A1A1A"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">B.1.1  </w:t>');
    expect(xml).toContain('The taxpayer is within scope of ATAD2.');
  });

  it('shows jurisdiction as an ISO code and the role on a quiet second line', () => {
    // ISO code, not the expanded country name.
    expect(xml).toContain('<w:t xml:space="preserve">LU</w:t>');
    expect(xml).not.toContain('Luxembourg');
    // The role descriptor sits in a smaller (sz-18) black second-line run.
    expect(xml).toContain('<w:color w:val="1A1A1A"/><w:sz w:val="18"/>');
    expect(xml).toContain('Subsidiary (direct)');
  });

  it('produces balanced table and cell tags', () => {
    const count = (s: string) => (xml.match(new RegExp(s, 'g')) ?? []).length;
    expect(count('<w:tbl>')).toBe(count('</w:tbl>'));
    expect(count('<w:tc>')).toBe(count('</w:tc>'));
    expect(count('<w:tr>')).toBe(count('</w:tr>'));
    expect(count('<w:tbl>')).toBe(4); // entity table + transactions table + one per conditions section (2)
  });

  it('honours the include toggles', () => {
    expect(buildMemoAppendicesXml(facts, rows, skeleton, { includeFacts: false })).not.toContain('Appendix 1');
    expect(buildMemoAppendicesXml(facts, rows, skeleton, { includeChecklist: false })).not.toContain('Appendix 2');
  });

  it('emits a decimal body sectPr (no appendix, no roman) when there is no content', () => {
    const none = buildMemoAppendicesXml(null, [], skeleton);
    expect(none).not.toContain('Appendix');
    expect(none).toContain('<w:sectPr>');
    expect(none).toContain('w:fmt="decimal"');
    expect(none).not.toContain('lowerRoman');
  });

  it('splits into a decimal body section and a lower-roman appendix section restarted at i', () => {
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    // Two sections: the body (decimal) closed by a section-break paragraph, and
    // the appendix (lower-roman, restarted) as the final section.
    expect((xml.match(/<w:sectPr\b/g) ?? []).length).toBe(2);
    expect(xml).toContain('<w:pgNumType w:fmt="decimal"/>');
    expect(xml).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="1"/>');
    // The body sectPr sits inside a paragraph (the section break); the appendix
    // sectPr is the document's final, top-level section.
    expect(xml).toContain('<w:p><w:pPr><w:sectPr>');
    expect(xml.trimEnd().endsWith('</w:sectPr>')).toBe(true);
  });

  it('does not page-break the first appendix heading (the section break already starts a new page)', () => {
    // With Appendix 1 first, its heading must not carry a page break, or the
    // nextPage section break would add a blank page before it.
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    const a1 = xml.indexOf('Appendix 1:');
    const a2 = xml.indexOf('Appendix 2:');
    expect(xml.slice(0, a1)).not.toContain('<w:pageBreakBefore/>');
    // Appendix 2 still opens on its own page.
    expect(xml.slice(a1, a2)).toContain('<w:pageBreakBefore/>');
  });

  it('numbers the A. subsections by what renders, and prefixes Appendix 2 with B.', () => {
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    expect(xml).toContain('A.1 The group and the taxpayer');
    expect(xml).toContain('A.2 Acting together'); // the fixture has an annex-worthy cluster
    expect(xml).toContain('A.3 Intra-group transactions');
    expect(xml).toContain('B.1 Scope and taxpayer status'); // section
    expect(xml).toContain('B.1.1'); // row code, letter-prefixed
  });

  it('states the null result in the acting-together section when the annex is empty', () => {
    const noActing: AppendixFacts = { ...facts, actingTogether: [] };
    const xml = buildMemoAppendicesXml(noActing, rows, skeleton);
    expect(xml).toContain('A.2 Acting together'); // still renders, holds A.2
    expect(xml).toContain(
      'No cooperating group was identified that would make an entity an associated enterprise where it is not one on its own holding.',
    );
    expect(xml).toContain('A.3 Intra-group transactions'); // transactions stay at A.3
  });

  it('drops the acting-together section only when it is excluded from the download', () => {
    const xml = buildMemoAppendicesXml({ ...facts, actingTogether: [], excludedSections: ['actingTogether'] }, rows, skeleton);
    expect(xml).not.toContain('Acting together');
    expect(xml).toContain('A.2 Intra-group transactions'); // transactions move up to A.2
  });
});

describe('buildMemoAppendicesXml — review fixes', () => {
  it('honours whole-section client exclusions (excludedSections)', () => {
    const xml = buildMemoAppendicesXml({ ...facts, excludedSections: ['actingTogether', 'transactions'] }, rows, skeleton);
    expect(xml).toContain('A.1 The group and the taxpayer');
    expect(xml).not.toContain('Acting together');
    expect(xml).not.toContain('Intra-group transactions');
    expect(xml).not.toContain('Co-investors under a shareholders agreement.');
  });

  it('drops the whole A.1 block when register/relatedness/classification are excluded', () => {
    const xml = buildMemoAppendicesXml(
      { ...facts, excludedSections: ['entityRegister', 'relatedness', 'classification'] },
      rows,
      skeleton,
    );
    expect(xml).not.toContain('The group and the taxpayer');
    expect(xml).toContain('A.1 Acting together'); // sibling sections still render, renumbered
  });

  it('strips XML-illegal control characters so the document stays valid', () => {
    const ctrl = String.fromCharCode(0x00, 0x0b, 0x0c, 0x1b);
    const dirty: AppendixFacts = {
      entities: [ent({ id: 'E1', name: `Clean Co${ctrl}`, role: 'Taxpayer', jurisdiction: 'NL' })],
      actingTogether: [], classifications: [], transactions: [],
    };
    const dirtyRows = [condRow('s1r1', 'Triggered', `Resident${ctrl} company.`)];
    const xml = buildMemoAppendicesXml(dirty, dirtyRows, skeleton);
    const hasIllegal = [...xml].some((ch) => {
      const c = ch.charCodeAt(0);
      return (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0xfffe || c === 0xffff;
    });
    expect(hasIllegal).toBe(false);
    expect(xml).toContain('Clean Co');
  });

  it('cleans the model boilerplate opener from Appendix 2 reasoning', () => {
    const r = [condRow('s1r1', 'Triggered', 'Based on the available information, the taxpayer is resident.')];
    const xml = buildMemoAppendicesXml(null, r, skeleton, { includeChecklist: true });
    expect(xml).toContain('The taxpayer is resident.');
    expect(xml).not.toContain('Based on the available information');
  });

  it('replaces em dashes in model text with a middot separator', () => {
    const r = [condRow('s1r1', 'Triggered', 'Resident — within scope.')];
    const xml = buildMemoAppendicesXml(null, r, skeleton, { includeChecklist: true });
    expect(xml).not.toContain('—');
    expect(xml).toContain('Resident · within scope.');
  });

  it('has no Summary block and no explanatory notes under the entity table', () => {
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    // Summary block removed: Appendix 1 starts at the group table.
    expect(xml).not.toContain('Cross-border transactions with related parties');
    expect(xml).not.toContain('Hybrid qualification differences');
    // Under-table notes removed.
    expect(xml).not.toContain('qualify as related parties');
    expect(xml).not.toContain('still to be determined');
    expect(xml).toContain('A.1 The group and the taxpayer');
  });

  it('characterises below-25% group entities instead of a bare "Other" role', () => {
    const fundFacts: AppendixFacts = {
      ...facts,
      entities: [
        ...facts.entities,
        ent({ id: 'E9', name: 'Atlas Participaties Fonds', role: 'Group entity', jurisdiction: 'NL', ownershipPct: 5 }),
      ],
    };
    const xml = buildMemoAppendicesXml(fundFacts, rows, skeleton);
    expect(xml).toContain('Fund');
  });

  it('maps a set-but-unmapped local class into the 4-value vocabulary, like Appendix 1', () => {
    // The classic US hybrid: homeClass "disregarded" cannot be expressed in the
    // 4-value NL vocabulary. The memo mirrors the on-screen appendix exactly, so it
    // maps to "To be determined" rather than inventing a separate raw-class wording.
    const llcFacts: AppendixFacts = {
      ...facts,
      entities: [
        ...facts.entities,
        ent({ id: 'E10', name: 'Delaware Holdings LLC', role: 'Group entity', jurisdiction: 'US', ownershipPct: 10 }),
      ],
      classifications: [
        ...facts.classifications,
        cls({ entityId: 'E10', homeState: 'US', homeClass: 'disregarded', hybrid: true }),
      ],
    };
    const xml = buildMemoAppendicesXml(llcFacts, rows, skeleton);
    expect(xml).toContain('US: To be determined');
    expect(xml).not.toContain('US: Disregarded');
    expect(xml).not.toContain('US qualification not set');
  });
});
