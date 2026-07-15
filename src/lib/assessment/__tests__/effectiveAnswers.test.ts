import { describe, it, expect } from 'vitest';
import {
  mergeEffectiveAnswers, canonicalAnswersString, answersFingerprint,
} from '@/lib/assessment/effectiveAnswers';

const pf = (over: Partial<Parameters<typeof mergeEffectiveAnswers>[1][number]> = {}) => ({
  question_id: 'Q1', suggested_answer: 'yes' as const, suggested_toelichting: 'Because X.',
  contextual_hint: null, suggested_toelichting_unknown: null, ...over,
});

describe('mergeEffectiveAnswers', () => {
  it('real answer wins over the suggestion for the same question', () => {
    const out = mergeEffectiveAnswers(
      [{ question_id: 'Q1', answer: 'No', explanation: 'Edited.' }],
      [pf()],
    );
    expect(out).toEqual([{ question_id: 'Q1', answer: 'No', explanation: 'Edited.', question_text: null, source: 'answer' }]);
  });
  it('unanswered question falls back to yes/no suggestion with its toelichting', () => {
    const out = mergeEffectiveAnswers([], [pf()]);
    expect(out).toEqual([{ question_id: 'Q1', answer: 'yes', explanation: 'Because X.', question_text: null, source: 'suggestion' }]);
  });
  it('Route B unknown-companion becomes an unknown answer with the unknown toelichting', () => {
    const out = mergeEffectiveAnswers([], [pf({
      suggested_answer: null, suggested_toelichting: null,
      contextual_hint: 'hint', suggested_toelichting_unknown: 'It is unknown whether Y.',
    })]);
    expect(out).toEqual([{ question_id: 'Q1', answer: 'unknown', explanation: 'It is unknown whether Y.', question_text: null, source: 'suggestion' }]);
  });
  it('unknown suggestion without any toelichting is omitted', () => {
    expect(mergeEffectiveAnswers([], [pf({ suggested_answer: 'unknown', suggested_toelichting: null })])).toEqual([]);
    expect(mergeEffectiveAnswers([], [pf({ suggested_answer: null, suggested_toelichting: null })])).toEqual([]);
  });
  it('explicit unknown suggestion with toelichting is included', () => {
    const out = mergeEffectiveAnswers([], [pf({ suggested_answer: 'unknown', suggested_toelichting: null, suggested_toelichting_unknown: 'Unknown Z.' })]);
    expect(out[0]).toMatchObject({ answer: 'unknown', explanation: 'Unknown Z.' });
  });
  it('output is sorted by question_id and carries question_text when given', () => {
    const out = mergeEffectiveAnswers(
      [{ question_id: 'Q9', answer: 'Yes', explanation: null, question_text: 'Nine?' }],
      [pf({ question_id: 'Q2' })],
    );
    expect(out.map((a) => a.question_id)).toEqual(['Q2', 'Q9']);
    expect(out[1].question_text).toBe('Nine?');
  });
});

describe('canonicalAnswersString', () => {
  it('lowercases the answer, trims the explanation, sorts by question_id', () => {
    const s = canonicalAnswersString([
      { question_id: 'Q2', answer: 'Yes', explanation: '  Because X. ' },
      { question_id: 'Q1', answer: 'no', explanation: null },
    ]);
    expect(s).toBe('Q1=no|\nQ2=yes|Because X.');
  });
});

describe('answersFingerprint', () => {
  it('is stable and case/whitespace-normalized', async () => {
    const a = await answersFingerprint([{ question_id: 'Q1', answer: 'Yes', explanation: ' t ' }]);
    const b = await answersFingerprint([{ question_id: 'Q1', answer: 'yes', explanation: 't' }]);
    const c = await answersFingerprint([{ question_id: 'Q1', answer: 'no', explanation: 't' }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
