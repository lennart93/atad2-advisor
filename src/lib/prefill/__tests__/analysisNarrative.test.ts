import { describe, it, expect } from 'vitest';
import {
  truncateForTicker,
  narrativeLineFor,
  buildNarrativeLines,
  nowReadingLine,
  type NarrativePrefill,
} from '../analysisNarrative';

function prefill(overrides: Partial<NarrativePrefill> = {}): NarrativePrefill {
  return {
    question_id: 'Q1',
    created_at: '2026-06-11T10:00:00Z',
    suggested_toelichting: null,
    contextual_hint: null,
    client_question: null,
    suggested_answer: null,
    ...overrides,
  };
}

describe('truncateForTicker', () => {
  it('returns trimmed text unchanged when at or under the limit', () => {
    expect(truncateForTicker('  short text  ')).toBe('short text');
    expect(truncateForTicker('x'.repeat(80))).toBe('x'.repeat(80));
  });

  it('cuts at max minus 3 and appends three ASCII dots when over the limit', () => {
    const long = 'a'.repeat(100);
    const out = truncateForTicker(long);
    expect(out).toBe('a'.repeat(77) + '...');
    expect(out.length).toBe(80);
  });

  it('respects a custom max', () => {
    expect(truncateForTicker('abcdefghij', 8)).toBe('abcde...');
    expect(truncateForTicker('abcdefgh', 8)).toBe('abcdefgh');
  });
});

describe('narrativeLineFor', () => {
  it('Route B uses client_question when present', () => {
    const p = prefill({
      question_id: 'Q7',
      contextual_hint: 'docs do not say',
      client_question: 'We understand that the BV holds 100%. Could you please confirm?',
    });
    expect(narrativeLineFor(p, 'Official text')).toBe(
      'Question Q7 needs the client: We understand that the BV holds 100%. Could you please confirm?',
    );
  });

  it('Route B falls back to the official question text', () => {
    const p = prefill({ question_id: 'Q7', contextual_hint: 'docs do not say' });
    expect(narrativeLineFor(p, 'Is the entity a reverse hybrid?')).toBe(
      'Question Q7 needs the client: Is the entity a reverse hybrid?',
    );
  });

  it('Route B truncates long question text to about 80 chars', () => {
    const p = prefill({
      question_id: 'Q7',
      contextual_hint: 'hint',
      client_question: 'b'.repeat(120),
    });
    expect(narrativeLineFor(p, undefined)).toBe(
      'Question Q7 needs the client: ' + 'b'.repeat(77) + '...',
    );
  });

  it('Route B without any text drops the colon tail', () => {
    const p = prefill({ question_id: 'Q7', contextual_hint: 'hint' });
    expect(narrativeLineFor(p, undefined)).toBe('Question Q7 needs the client');
  });

  it('Route A via suggested_toelichting', () => {
    const p = prefill({ question_id: 'Q3', suggested_toelichting: 'Found in the FS.' });
    expect(narrativeLineFor(p, undefined)).toBe(
      'Looked into question Q3: enough in the documents',
    );
  });

  it('Route A via suggested_answer when toelichting is null', () => {
    const p = prefill({ question_id: 'Q3', suggested_answer: 'yes' });
    expect(narrativeLineFor(p, undefined)).toBe(
      'Looked into question Q3: enough in the documents',
    );
  });

  it('returns null when neither route is populated', () => {
    expect(narrativeLineFor(prefill(), 'Official text')).toBeNull();
  });
});

describe('buildNarrativeLines', () => {
  it('sorts by created_at ascending and returns only the last 5 of 7', () => {
    const prefills: NarrativePrefill[] = [7, 3, 5, 1, 6, 2, 4].map((n) =>
      prefill({
        question_id: `Q${n}`,
        created_at: `2026-06-11T10:0${n}:00Z`,
        suggested_answer: 'yes',
      }),
    );
    const lines = buildNarrativeLines(prefills, new Map());
    expect(lines).toEqual([
      'Looked into question Q3: enough in the documents',
      'Looked into question Q4: enough in the documents',
      'Looked into question Q5: enough in the documents',
      'Looked into question Q6: enough in the documents',
      'Looked into question Q7: enough in the documents',
    ]);
  });

  it('drops rows without a narrative line and uses official text from the map', () => {
    const prefills: NarrativePrefill[] = [
      prefill({ question_id: 'Q1', created_at: '2026-06-11T10:01:00Z' }),
      prefill({
        question_id: 'Q2',
        created_at: '2026-06-11T10:02:00Z',
        contextual_hint: 'hint',
      }),
    ];
    const lines = buildNarrativeLines(
      prefills,
      new Map([['Q2', 'Official wording of Q2']]),
    );
    expect(lines).toEqual(['Question Q2 needs the client: Official wording of Q2']);
  });
});

describe('nowReadingLine', () => {
  it('returns null for an empty list', () => {
    expect(nowReadingLine([], 0)).toBeNull();
  });

  it('maps known category values to their labels', () => {
    expect(nowReadingLine(['financial_statements'], 0)).toBe(
      'Now reading: Financial statements...',
    );
    expect(nowReadingLine(['trial_balance'], 0)).toBe('Now reading: Trial balance...');
  });

  it('falls back to Documents for unknown values', () => {
    expect(nowReadingLine(['something_else'], 0)).toBe('Now reading: Documents...');
  });

  it('dedupes categories preserving first-seen order and rotates by tick', () => {
    const cats = ['tax_returns', 'financial_statements', 'tax_returns', 'memo'];
    expect(nowReadingLine(cats, 0)).toBe('Now reading: Tax returns...');
    expect(nowReadingLine(cats, 1)).toBe('Now reading: Financial statements...');
    expect(nowReadingLine(cats, 2)).toBe('Now reading: Memo...');
    // 3 unique categories: tick wraps back to the first label.
    expect(nowReadingLine(cats, 3)).toBe(nowReadingLine(cats, 0));
  });
});
