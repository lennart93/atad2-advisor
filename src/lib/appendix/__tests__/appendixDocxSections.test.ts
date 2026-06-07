import { describe, it, expect } from 'vitest';
import { toAppendixSections } from '@/lib/appendix/appendixDocxSections';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string): AppendixRow => ({
  rowId, aiDecision: 'Not applicable', aiReasoning: 'r', aiReference: 'Q1=Yes',
  decision: 'Not applicable', reasoning: 'r', reference: 'Q1=Yes',
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('toAppendixSections', () => {
  it('groups rows by section and drops the reference field', () => {
    const secs = toAppendixSections([row('1.a'), row('1.b'), row('2.1')]);
    const s1 = secs.find((s) => s.sectionId === '1')!;
    expect(s1.rows.length).toBe(2);
    expect(JSON.stringify(secs)).not.toContain('Q1=Yes'); // reference excluded from export
    expect(s1.rows[0]).toHaveProperty('code');
    expect(s1.rows[0]).toHaveProperty('legalFramework');
    expect(s1.rows[0]).toHaveProperty('decision');
    expect(s1.rows[0]).toHaveProperty('reasoning');
    expect(s1.rows[0]).not.toHaveProperty('reference');
  });
});
