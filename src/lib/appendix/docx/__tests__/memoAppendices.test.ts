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
    // Party to a relevant transaction, local qualification undetermined -> "to be determined".
    ent({ id: 'E6', name: 'Jersey Co Ltd', role: 'Group entity', jurisdiction: 'JE', related: false, nlTaxStatus: 'resident' }),
  ],
  actingTogether: [
    cluster({ id: 'A1', memberEntityIds: ['E2', 'E4'], combinedPct: 90, likelihood: 'likely', reasoning: 'Co-investors under a shareholders agreement.' }),
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

  it('renders both appendix headings', () => {
    expect(xml).toContain('Appendix 1: Facts and relationships');
    expect(xml).toContain('Appendix 2: Condition-by-condition assessment');
  });

  it('groups entities and lists the below-25% group in full', () => {
    expect(xml).toContain('The taxpayer');
    expect(xml).toContain('Related and relevant');
    expect(xml).toContain('Other group entities (below the 25% threshold, no qualification difference)');
    // E5 + E6 are below threshold and must both appear, not be collapsed.
    expect(xml).toContain('Jersey Co Ltd');
  });

  it('escapes XML-special characters in entity names', () => {
    expect(xml).toContain('Acme &amp; Sons &lt;Holding&gt;');
    expect(xml).not.toContain('Acme & Sons <Holding>');
  });

  it('preserves the "to be determined" local qualification verbatim', () => {
    expect(xml).toContain('To be determined (JE)');
    expect(xml).toContain('Transparent (CH)'); // the hybrid mismatch entity
  });

  it('shows the acting-together conclusion and accounts for not-likely groupings', () => {
    expect(xml).toContain('Co-investors under a shareholders agreement.');
    expect(xml).toContain('1 candidate grouping was considered and not assessed as likely');
    expect(xml).not.toContain('No entities that could form an acting-together group.');
  });

  it('splits transactions into relevant and not-relevant', () => {
    expect(xml).toContain('Interest deduction in NL'); // relevant flow
    expect(xml).toContain('Transactions assessed as not relevant');
    expect(xml).toContain('1 transaction not relevant: Within same tax group');
  });

  it('renders Appendix 2 with the unified status labels and no per-section tally', () => {
    expect(xml).toContain('Triggered');
    expect(xml).toContain('Not triggered');
    expect(xml).toContain('Insufficient info'); // short label
    expect(xml).not.toContain('Insufficient information'); // raw status never leaks
    expect(xml).not.toContain('Not met'); // old vocabulary gone
    expect(xml).not.toContain('Could not be assessed');
    // The per-section count line is removed; only the section heading remains.
    expect(xml).not.toContain('conditions · ');
    expect(xml).not.toContain('insufficient · ');
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

  it('uses a single Arabic (decimal) section, no Roman numerals', () => {
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    expect(xml).toContain('<w:pgNumType w:fmt="decimal"/>');
    expect(xml).not.toContain('lowerRoman');
    expect((xml.match(/<w:sectPr\b/g) ?? []).length).toBe(1);
  });

  it('keeps A.1/A.2/A.3 in Appendix 1 and prefixes Appendix 2 with B.', () => {
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    expect(xml).toContain('A.1 The group and the taxpayer');
    expect(xml).toContain('A.2 Acting together');
    expect(xml).toContain('B.1 Scope and taxpayer status'); // section
    expect(xml).toContain('B.1.1'); // row code, letter-prefixed
  });
});

describe('buildMemoAppendicesXml — review fixes', () => {
  it('honours whole-section client exclusions (excludedSections)', () => {
    const xml = buildMemoAppendicesXml({ ...facts, excludedSections: ['actingTogether', 'transactions'] }, rows, skeleton);
    expect(xml).toContain('A.1 The group and the taxpayer');
    expect(xml).not.toContain('A.2 Acting together');
    expect(xml).not.toContain('A.3 Relevant transactions');
    expect(xml).not.toContain('Co-investors under a shareholders agreement.');
  });

  it('drops the whole A.1 block when register/relatedness/classification are excluded', () => {
    const xml = buildMemoAppendicesXml(
      { ...facts, excludedSections: ['entityRegister', 'relatedness', 'classification'] },
      rows,
      skeleton,
    );
    expect(xml).not.toContain('A.1 The group and the taxpayer');
    expect(xml).toContain('A.2 Acting together'); // sibling sections still render
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

  it('has no Summary block and no explanatory notes under the entity table', () => {
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    // Summary block (item 4) removed: Appendix 1 starts at the group table.
    expect(xml).not.toContain('Cross-border transactions with related parties');
    expect(xml).not.toContain('Hybrid qualification differences');
    // Under-table notes (item 5) removed.
    expect(xml).not.toContain('qualify as related parties');
    expect(xml).not.toContain('still to be determined');
    expect(xml).toContain('A.1 The group and the taxpayer');
  });

  it('characterises below-25% group entities instead of a bare "Other"', () => {
    const fundFacts: AppendixFacts = {
      ...facts,
      entities: [
        ...facts.entities,
        ent({ id: 'E9', name: 'Atlas Participaties Fonds', role: 'Group entity', jurisdiction: 'NL', ownershipPct: 5 }),
      ],
    };
    const xml = buildMemoAppendicesXml(fundFacts, rows, skeleton);
    expect(xml).toContain('Investment / participation fund');
  });

  it('drives the status colour from the status alone, with no red', () => {
    const xml = buildMemoAppendicesXml(facts, rows, skeleton);
    expect(xml).toContain('w:fill="FAEEDA"'); // s1r1 Triggered -> amber
    expect(xml).toContain('w:fill="E7F6EE"'); // s1r2 Not triggered -> green
    expect(xml).toContain('w:fill="FFF3CD"'); // s3r1 Insufficient information -> amber
    expect(xml).not.toContain('w:fill="FBE2E2"'); // the old red is gone
  });

  it('renders N/A as a lighter green than Not triggered', () => {
    const naRows: AppendixRow[] = [condRow('s1r1', 'N/A', 'Scope gate satisfied, not a risk.')];
    const naXml = buildMemoAppendicesXml(null, naRows, skeleton, { includeChecklist: true });
    expect(naXml).toContain('w:fill="F1F7EF"'); // N/A -> lighter green
    expect(naXml).toContain('N/A');
  });
});
