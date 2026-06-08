import { describe, it, expect } from 'vitest';
import { buildAppendixBlock } from '@/lib/appendix/buildAppendixBlock';
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
});
