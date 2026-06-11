import { describe, it, expect } from 'vitest';
import { buildAppendixBlock, appendixMemoBlock } from '@/lib/appendix/buildAppendixBlock';
import type { AppendixRow, AppendixFacts } from '@/lib/appendix/types';

const row = (rowId: string, status: AppendixRow['status'], reasoning: string, excluded = false): AppendixRow => ({
  rowId,
  aiStatus: status, aiReasoning: reasoning, aiProvenance: 'Q1 answer: Yes',
  status, reasoning, provenance: 'Q1 answer: Yes',
  excludedFromClient: excluded,
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('buildAppendixBlock', () => {
  it('emits one line per row with rowId, status and reasoning, and never the provenance', () => {
    const out = buildAppendixBlock([row('3.2', 'Not triggered', 'No hybrid entity is involved, the BV pays a third-party bank.')]);
    expect(out).toContain('3.2');
    expect(out).toContain('Not triggered');
    expect(out).toContain('No hybrid entity is involved');
    expect(out).not.toContain('Q1 answer: Yes');
  });

  it('drops rows excluded from the client export', () => {
    const out = buildAppendixBlock([
      row('3.1', 'Triggered', 'Kept reasoning.'),
      row('3.2', 'Triggered', 'Excluded reasoning.', true),
    ]);
    expect(out).toContain('Kept reasoning.');
    expect(out).not.toContain('Excluded reasoning.');
  });

  it('wraps in a labelled block for the n8n payload', () => {
    const out = buildAppendixBlock([row('3.2', 'Not triggered', 'x')]);
    expect(out.startsWith('<confirmed_appendix>')).toBe(true);
    expect(out.trim().endsWith('</confirmed_appendix>')).toBe(true);
  });

  it('prepends a clean <facts> block from confirmed facts only', () => {
    const facts: AppendixFacts = {
      entities: [{ id: 'E1', chartEntityId: 'c1', name: 'Acme BV', jurisdiction: 'NL', entityType: 'BV', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: null }],
      actingTogether: [],
      classifications: [
        { entityId: 'E1', homeState: 'NL', homeClass: 'opaque', sourceState: 'US', sourceClass: 'transparent', hybrid: true, status: 'confirmed', excludedFromClient: false, source: 'ai' },
        { entityId: 'E9', homeState: 'NL', homeClass: 'x', sourceState: null, sourceClass: null, hybrid: false, status: 'proposed', excludedFromClient: false, source: 'ai' },
      ],
      transactions: [],
    };
    const out = buildAppendixBlock([row('3.2', 'Triggered', 'x')], undefined, facts);
    expect(out).toContain('<facts>');
    expect(out).toContain('Acme BV');
    expect(out).toContain('hybrid mismatch');
    expect(out).toContain('<confirmed_appendix>');
    expect(out).not.toContain('E9');
  });

  it('feeds the memo only relevant flows plus an accounted count, and the conclusion flags', () => {
    const facts = {
      entities: [
        { id: 'E1', chartEntityId: 'c1', name: 'Tax BV', jurisdiction: 'NL', entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' },
        { id: 'E2', chartEntityId: 'c2', name: 'US Inc', jurisdiction: 'US', entityType: 'corporation', role: 'Group entity', ownershipPct: null, related: true, nlTaxStatus: 'outside_cit' },
      ],
      classifications: [], actingTogether: [],
      transactions: [
        { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai', relevant: true, relevanceReason: 'Cross-border related' },
        { id: 'T2', fromEntityId: 'E1', toEntityId: 'E2', kind: 'service', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai', relevant: false, relevanceReason: 'Within the fiscal unity' },
      ],
    } as never;
    const block = buildAppendixBlock([], undefined, facts);
    expect(block).toContain('loan');
    expect(block).not.toContain('service');
    expect(block).toContain('1 transaction assessed as not relevant (Within the fiscal unity)');
    expect(block).toContain('Cross-border transactions with related parties: 1');
  });
});

const row2 = (rowId: string): AppendixRow => ({
  rowId, aiStatus: 'Triggered', aiReasoning: 'r', aiProvenance: '',
  status: 'Triggered', reasoning: 'r', provenance: '',
  excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('appendixMemoBlock skip handling', () => {
  const base = {
    rows: [row2('3.1')],
    facts: { entities: [{ id: 'E1', chartEntityId: 'c1', name: 'Acme BV', jurisdiction: 'NL', entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' }], actingTogether: [], classifications: [], transactions: [] },
    facts_skipped: false, checklist_skipped: false,
  } as never;

  it('includes both blocks when nothing is skipped', () => {
    const out = appendixMemoBlock(base, [])!;
    expect(out).toContain('<facts>');
    expect(out).toContain('<confirmed_appendix>');
  });
  it('drops the facts block when facts is skipped', () => {
    const out = appendixMemoBlock({ ...base, facts_skipped: true } as never, [])!;
    expect(out).not.toContain('<facts>');
    expect(out).toContain('<confirmed_appendix>');
  });
  it('drops the confirmed_appendix block when the checklist is skipped', () => {
    const out = appendixMemoBlock({ ...base, checklist_skipped: true } as never, [])!;
    expect(out).toContain('<facts>');
    expect(out).not.toContain('<confirmed_appendix>');
  });
  it('returns null when both are skipped', () => {
    expect(appendixMemoBlock({ ...base, facts_skipped: true, checklist_skipped: true } as never, [])).toBeNull();
  });
});

describe('buildAppendixBlock empty rows', () => {
  it('omits the confirmed_appendix block when there are no rows', () => {
    expect(buildAppendixBlock([], [])).not.toContain('<confirmed_appendix>');
  });
});
