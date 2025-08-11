import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAssessmentStore } from '@/stores/assessmentStore';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

interface UseContextPanelProps {
  sessionId: string;
  questionId: string;
  selectedAnswer: 'Yes' | 'No' | 'Unknown' | '';
}

export const useContextPanel = ({ sessionId, questionId, selectedAnswer }: UseContextPanelProps) => {
  const store = useAssessmentStore();
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  // Get current state from store
  const currentState = store.getQuestionState(sessionId, questionId);
  const explanation = currentState?.explanation || '';
  const contextPrompt = currentState?.contextPrompt || '';
  
  // Debounced values for auto-saving
  const debouncedExplanation = useDebounce(explanation, 400);
  const debouncedAnswer = useDebounce(selectedAnswer, 400);
  
  // Check if context panel should be shown
  const shouldShowContext = useMemo(() => {
    // Show if there's existing explanation
    if (explanation.trim().length > 0) {
      return true;
    }
    
    // Show if current answer would trigger context (handled by parent component)
    return currentState?.shouldShowContext || false;
  }, [explanation, currentState?.shouldShowContext]);

  // Load initial data from Supabase when component mounts
  useEffect(() => {
    const loadInitialData = async () => {
      if (!sessionId || !questionId) return;
      
      // Check if we already have data in store
      if (currentState?.lastSyncedAt) {
        return; // Already loaded
      }

      try {
        // Load existing answer from database
        const { data: existingAnswer } = await supabase
          .from('atad2_answers')
          .select('answer, explanation')
          .eq('session_id', sessionId)
          .eq('question_id', questionId)
          .maybeSingle();

        if (existingAnswer) {
          store.setQuestionState(sessionId, questionId, {
            answer: existingAnswer.answer as 'Yes' | 'No' | 'Unknown',
            explanation: existingAnswer.explanation || '',
            lastSyncedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Error loading initial question data:', error);
      }
    };

    loadInitialData();
  }, [sessionId, questionId, currentState?.lastSyncedAt, store]);

  // Auto-save answer and explanation when debounced values change
  useEffect(() => {
    const saveData = async () => {
      // Only save if we have valid data and something has actually changed
      if (!sessionId || !questionId || !debouncedAnswer) {
        return;
      }

      // Check if we need to save (either answer or explanation changed)
      const needsAnswerUpdate = debouncedAnswer !== (currentState?.answer || '');
      const needsExplanationUpdate = debouncedExplanation !== (currentState?.explanation || '');
      
      if (!needsAnswerUpdate && !needsExplanationUpdate) {
        return;
      }

      setSavingStatus('saving');
      
      try {
        // Upsert to atad2_answers with all the data we have
        const { error } = await supabase
          .from('atad2_answers')
          .upsert({
            session_id: sessionId,
            question_id: questionId,
            answer: debouncedAnswer,
            explanation: debouncedExplanation || '',
            question_text: '', // This will be filled by navigation logic if needed
            risk_points: 0, // This will be filled by navigation logic if needed
          }, {
            onConflict: 'session_id,question_id',
          });

        if (error) throw error;

        // Update store with the saved data
        store.setQuestionState(sessionId, questionId, {
          answer: debouncedAnswer as 'Yes' | 'No' | 'Unknown',
          explanation: debouncedExplanation || '',
          lastSyncedAt: new Date().toISOString(),
        });

        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
      } catch (error) {
        console.error('Error auto-saving data:', error);
        setSavingStatus('idle');
      }
    };

    saveData();
  }, [debouncedAnswer, debouncedExplanation, sessionId, questionId, currentState, store]);

  // Load context questions when answer changes
  const loadContextQuestions = useCallback(async (answer: string) => {
    if (!sessionId || !questionId || !answer) return null;

    try {
      const { data: contextQuestions, error } = await supabase
        .from('atad2_context_questions')
        .select('context_question')
        .eq('question_id', questionId)
        .eq('answer_trigger', answer);

      if (error) {
        console.error('Error loading context questions:', error);
        return null;
      }

      if (contextQuestions && contextQuestions.length > 0) {
        // Cache a random context question in store
        const existingPrompt = store.getQuestionState(sessionId, questionId)?.contextPrompt;
        let selectedPrompt = existingPrompt;
        
        if (!selectedPrompt) {
          selectedPrompt = contextQuestions[Math.floor(Math.random() * contextQuestions.length)].context_question;
          store.setContextPrompt(sessionId, questionId, selectedPrompt);
        }
        
        store.setShouldShowContext(sessionId, questionId, true);
        return selectedPrompt;
      }
      
      store.setShouldShowContext(sessionId, questionId, false);
      return null;
    } catch (error) {
      console.error('Error loading context questions:', error);
      return null;
    }
  }, [sessionId, questionId, store]);

  // Update explanation in store
  const updateExplanation = useCallback((newExplanation: string) => {
    store.updateExplanation(sessionId, questionId, newExplanation);
  }, [sessionId, questionId, store]);

  // Update answer in store (immediate update for UI responsiveness)
  const updateAnswer = useCallback((answer: 'Yes' | 'No' | 'Unknown') => {
    store.updateAnswer(sessionId, questionId, answer);
    // Track last visited question
    store.setLastVisitedQuestion(sessionId, questionId);
  }, [sessionId, questionId, store]);

  // Clear context panel
  const clearContext = useCallback(() => {
    store.setQuestionState(sessionId, questionId, {
      explanation: '',
      shouldShowContext: false,
    });
  }, [sessionId, questionId, store]);

  return {
    explanation,
    contextPrompt,
    shouldShowContext,
    savingStatus,
    updateExplanation,
    updateAnswer,
    loadContextQuestions,
    clearContext,
    currentAnswer: currentState?.answer || null,
  };
};