import { supabase } from '@/integrations/supabase/client';
import {
  mergeEffectiveAnswers, answersFingerprint,
  type PrefillInput, type RealAnswerInput,
} from './effectiveAnswers';

/**
 * Fingerprint of the CURRENT effective answer set (recorded answers win,
 * suggestions fill the gaps). The same computation the edge functions store,
 * so equality means "that run reflects what the answers are right now".
 */
export async function currentEffectiveFingerprint(
  sessionId: string,
): Promise<{ fingerprint: string; count: number }> {
  const [{ data: answers }, { data: prefills }] = await Promise.all([
    supabase.from('atad2_answers')
      .select('question_id, answer, explanation').eq('session_id', sessionId),
    supabase.from('atad2_question_prefills')
      .select('question_id, suggested_answer, suggested_toelichting, contextual_hint, suggested_toelichting_unknown')
      .eq('session_id', sessionId),
  ]);
  const eff = mergeEffectiveAnswers(
    (answers ?? []) as RealAnswerInput[],
    (prefills ?? []) as PrefillInput[],
  );
  return { fingerprint: await answersFingerprint(eff), count: eff.length };
}
