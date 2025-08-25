import { useAssessmentStore } from '@/stores/assessmentStore';
import { supabase } from '@/integrations/supabase/client';

export const useHardenedContextLoader = () => {
  const store = useAssessmentStore();

  const loadContextQuestions = async (sessionId: string, questionId: string, answerId: string) => {
    console.debug('[context] params types', { questionId, tQ: typeof questionId, answerId, tA: typeof answerId });
    
    store.setContextLoading(questionId);

    const controller = new AbortController();
    const signal = controller.signal;
    const CURRENT = { questionId, answerId };

    // 6s timeout → abort
    const timeout = setTimeout(() => controller.abort('timeout'), 6000);

    try {
      console.debug('[context] loading', { questionId, answerId, sessionId });
      
      // Always AWAIT on the Supabase-call and RETURN result
      const { data, error } = await supabase
        .from('atad2_context_questions')
        .select('context_question')
        .eq('question_id', questionId)
        .eq('answer_trigger', answerId)
        .abortSignal(signal);

      if (error) throw error;

      const prompts = (data ?? []).map(r => r.context_question).filter(Boolean);
      
      console.debug('[context] loaded', { questionId, answerId, count: prompts.length });

      // Stale-guard: is dit nog steeds de actuele Q/A?
      const currentState = store.getQuestionState(sessionId, questionId);
      const currentAnswer = currentState?.answer;
      
      if (currentAnswer !== CURRENT.answerId) {
        console.warn('[context] stale response dropped', { 
          CURRENT, 
          now: { questionId, currentAnswer } 
        });
        return;
      }

      if (prompts.length > 0) {
        store.setContextReady(questionId, prompts);
      } else {
        store.setContextNone(questionId);
      }
    } catch (e: any) {
      if (signal.aborted) {
        console.error('[context] aborted/timeout', { questionId, answerId, reason: signal.reason });
      } else {
        console.error('[context] load failed', { questionId, answerId, err: e });
      }
      store.setContextError(questionId, String(e?.message ?? e));
    } finally {
      clearTimeout(timeout);
    }
  };

  return { loadContextQuestions };
};