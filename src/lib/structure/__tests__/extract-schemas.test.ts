import { describe, it, expect } from 'vitest';
import { Stage1Output, Stage2Output } from '../../../../supabase/functions/extract-structure/schemas';
import { formatQaBlock, type QaAnswerRow } from '../../../../supabase/functions/extract-structure/formatters';

describe('Stage1Output', () => {
  it('accepts a minimal valid payload', () => {
    const ok = Stage1Output.parse({
      entities: [
        { temp_id: 'ent_1', name: 'Holding NL', jurisdiction_iso: 'NL', entity_type: 'corporation', is_taxpayer: true },
      ],
    });
    expect(ok.entities.length).toBe(1);
  });

  it('rejects unknown entity_type', () => {
    expect(() => Stage1Output.parse({
      entities: [
        { temp_id: 'ent_1', name: 'X', jurisdiction_iso: 'NL', entity_type: 'corp', is_taxpayer: false },
      ],
    })).toThrow();
  });

  it('rejects malformed temp_id', () => {
    expect(() => Stage1Output.parse({
      entities: [
        { temp_id: 'foo_1', name: 'X', jurisdiction_iso: 'NL', entity_type: 'corporation', is_taxpayer: false },
      ],
    })).toThrow();
  });
});

describe('Stage2Output', () => {
  it('accepts valid ownership edges', () => {
    const ok = Stage2Output.parse({
      ownership_edges: [
        { from_temp_id: 'ent_1', to_temp_id: 'ent_2', ownership_pct: 100 },
      ],
    });
    expect(ok.ownership_edges[0].ownership_pct).toBe(100);
  });

  it('rejects ownership_pct outside [0, 100]', () => {
    expect(() => Stage2Output.parse({
      ownership_edges: [
        { from_temp_id: 'ent_1', to_temp_id: 'ent_2', ownership_pct: 150 },
      ],
    })).toThrow();
  });
});

describe('formatQaBlock', () => {
  it('includes explanation on its own line when present', () => {
    const rows: QaAnswerRow[] = [
      { question_id: '1', question_text: 'Resident?', answer: 'Yes', explanation: 'Incorporated in Amsterdam.' },
    ];
    const out = formatQaBlock(rows);
    expect(out).toContain('Q 1 (Resident?)');
    expect(out).toContain('Answer: Yes');
    expect(out).toContain('Explanation: Incorporated in Amsterdam.');
  });

  it('omits explanation line when explanation is blank or null', () => {
    const rows: QaAnswerRow[] = [
      { question_id: '2', question_text: 'PE?',       answer: 'No',  explanation: '' },
      { question_id: '3', question_text: 'Loans?',    answer: 'Yes', explanation: null },
      { question_id: '4', question_text: 'Royalties?', answer: 'Unknown', explanation: '   ' },
    ];
    const out = formatQaBlock(rows);
    expect(out).not.toContain('Explanation:');
    expect(out.split('\n\n').length).toBe(3);
  });

  it('returns empty string for zero rows', () => {
    expect(formatQaBlock([])).toBe('');
  });
});
