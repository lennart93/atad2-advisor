import { describe, it, expect } from 'vitest';
import { toAppendixSections } from '@/lib/appendix/appendixDocxSections';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string): AppendixRow => ({
  rowId,
  aiStatus: 'Not triggered', aiReasoning: 'No adjustment.', aiProvenance: 'Q1 answer: Yes',
  status: 'Not triggered', reasoning: 'No adjustment.', provenance: 'Q1 answer: Yes',
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('toAppendixSections', () => {
  it('groups rows by section and drops the internal provenance', () => {
    const secs = toAppendixSections([row('3.1'), row('3.2'), row('4.1')]);
    const s3 = secs.find((s) => s.sectionId === '3')!;
    expect(s3.rows.length).toBe(2);
    expect(JSON.stringify(secs)).not.toContain('Q1 answer: Yes'); // provenance excluded from export
    expect(s3.rows[0]).toHaveProperty('code');
    expect(s3.rows[0]).toHaveProperty('legalBasis');
    expect(s3.rows[0]).toHaveProperty('conditionTested');
    expect(s3.rows[0]).toHaveProperty('status');
    expect(s3.rows[0]).toHaveProperty('reasoning');
    expect(s3.rows[0]).not.toHaveProperty('provenance');
    expect(s3.rows[0]).not.toHaveProperty('factualBasis');
  });
});
