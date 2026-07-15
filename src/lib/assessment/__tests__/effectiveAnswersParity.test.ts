import { describe, it, expect } from 'vitest';
import * as fe from '@/lib/assessment/effectiveAnswers';
// Relative cross-import into the Deno file: it must stay dependency-free.
import * as deno from '../../../../supabase/functions/_shared/effectiveAnswers';

describe('effectiveAnswers frontend/Deno parity', () => {
  const real = [{ question_id: 'Q2', answer: 'Yes', explanation: ' t ' }];
  const prefills = [{
    question_id: 'Q1', suggested_answer: 'no' as const, suggested_toelichting: 'S.',
    contextual_hint: null, suggested_toelichting_unknown: null,
  }];
  it('same merge result', () => {
    expect(deno.mergeEffectiveAnswers(real, prefills)).toEqual(fe.mergeEffectiveAnswers(real, prefills));
  });
  it('same canonical string and fingerprint', async () => {
    const eff = fe.mergeEffectiveAnswers(real, prefills);
    expect(deno.canonicalAnswersString(eff)).toBe(fe.canonicalAnswersString(eff));
    expect(await deno.answersFingerprint(eff)).toBe(await fe.answersFingerprint(eff));
  });
});
