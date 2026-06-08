import { describe, it, expect } from 'vitest';
import { toAppendixSections } from '@/lib/appendix/appendixDocxSections';
import type { AppendixRow } from '@/lib/appendix/types';

const row = (rowId: string, excluded = false): AppendixRow => ({
  rowId,
  aiStatus: 'Not triggered', aiReasoning: 'No adjustment.', aiProvenance: 'Q1 answer: Yes',
  status: 'Not triggered', reasoning: 'No adjustment.', provenance: 'Q1 answer: Yes',
  excludedFromClient: excluded,
  source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('toAppendixSections', () => {
  it('groups rows by section, renumbers contiguously, and drops internal provenance', () => {
    const secs = toAppendixSections([row('3.1'), row('3.2'), row('4.1')]);
    expect(secs.map((s) => s.sectionId)).toEqual(['1', '2']);       // sections renumbered 1..K
    expect(secs[0].rows.map((r) => r.code)).toEqual(['1.1', '1.2']); // rows renumbered within
    expect(secs[1].rows[0].code).toBe('2.1');
    expect(JSON.stringify(secs)).not.toContain('Q1 answer: Yes');   // provenance excluded
    expect(secs[0].rows[0]).toHaveProperty('reasoning');
    expect(secs[0].rows[0]).not.toHaveProperty('provenance');
  });

  it('drops excluded rows and renumbers the survivors', () => {
    const secs = toAppendixSections([row('3.1', true), row('3.2'), row('4.1')]);
    // section 3 now has only 3.2, which becomes the first section, code 1.1
    expect(secs[0].rows.map((r) => r.code)).toEqual(['1.1']);
    expect(secs[1].rows.map((r) => r.code)).toEqual(['2.1']);
  });
});
