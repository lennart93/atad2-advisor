import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAssessmentStore } from '@/stores/assessmentStore';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { validateSessionId, validateQuestionId } from '@/utils/inputValidation';

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
  
  // Debug: Log explanation changes per question
  console.log(`🔍 useContextPanel for Q${questionId}: explanation="${explanation.substring(0, 30)}...", shouldShow=${currentState?.shouldShowContext}`);
  
  // Safety check: verify we're getting the right explanation for the right question
  if (explanation && questionId) {
    console.log(`✅ Context state for Q${questionId}: has explanation (${explanation.length} chars)`);
  }
  
  // Debounced explanation for auto-saving (increased delay)
  const debouncedExplanation = useDebounce(explanation, 1500);
  
  // Check if context panel should be shown - compute on every render based on current state
  const shouldShowContext = useMemo(() => {
    // Show if there's existing explanation
    if (explanation.trim().length > 0) {
      console.log(`📝 Context showing for Q${questionId}: has explanation`);
      return true;
    }
    
    // Show if current answer would trigger context
    const showFromStore = currentState?.shouldShowContext || false;
    console.log(`🔍 Context check for Q${questionId}: shouldShowContext=${showFromStore}, explanation="${explanation}"`);
    return showFromStore;
  }, [explanation, currentState?.shouldShowContext, questionId]);

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
            lastSyncedExplanation: existingAnswer.explanation || '',
          });
        }
      } catch (error) {
        console.error('Error loading initial question data:', error);
      }
    };

    loadInitialData();
  }, [sessionId, questionId, currentState?.lastSyncedAt, store]);

  // Auto-save explanation when debounced value changes
  useEffect(() => {
    const saveExplanation = async () => {
      // Only save if we have meaningful content and it's actually different
      if (!sessionId || !questionId || !debouncedExplanation.trim()) {
        return;
      }

      // Check if the debounced value is actually different from what we last saved
      const lastSyncedExplanation = currentState?.lastSyncedExplanation;
      if (debouncedExplanation === lastSyncedExplanation) {
        return;
      }

      setSavingStatus('saving');
      
      try {
        // Save raw explanation without any validation during auto-save to preserve spaces
        // Validation will happen only at final submit/report generation
        
        // Upsert to atad2_answers
        const { error } = await supabase
          .from('atad2_answers')
          .upsert({
            session_id: sessionId,
            question_id: questionId,
            answer: selectedAnswer || currentState?.answer || 'Unknown',
            explanation: debouncedExplanation, // Raw value, no validation
            question_text: '', // This will be filled by the main submit
            risk_points: 0, // This will be filled by the main submit
          }, {
            onConflict: 'session_id,question_id',
          });

        if (error) throw error;

        // Update store with sync timestamp and the raw explanation we just saved
        store.setQuestionState(sessionId, questionId, {
          lastSyncedAt: new Date().toISOString(),
          lastSyncedExplanation: debouncedExplanation, // Raw value, no validation
        });

        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
      } catch (error) {
        console.error('Error auto-saving explanation:', error);
        setSavingStatus('idle');
      }
    };

    saveExplanation();
  }, [debouncedExplanation, sessionId, questionId, selectedAnswer, currentState?.answer, currentState?.lastSyncedExplanation, store]);

  // Load context questions when answer changes
  const loadContextQuestions = useCallback(async (answer: string) => {
    if (!sessionId || !questionId || !answer) return null;

    console.log(`🔍 Loading context questions for Q${questionId}, answer: ${answer}`);

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

      console.log(`📋 Found ${contextQuestions?.length || 0} context questions for Q${questionId}, answer: ${answer}`);

      if (contextQuestions && contextQuestions.length > 0) {
        // Cache a random context question in store
        const existingPrompt = store.getQuestionState(sessionId, questionId)?.contextPrompt;
        let selectedPrompt = existingPrompt;
        
        if (!selectedPrompt) {
          selectedPrompt = contextQuestions[Math.floor(Math.random() * contextQuestions.length)].context_question;
          store.setContextPrompt(sessionId, questionId, selectedPrompt);
          console.log(`💡 Set new context prompt for Q${questionId}: ${selectedPrompt.substring(0, 50)}...`);
        } else {
          console.log(`📝 Using existing context prompt for Q${questionId}`);
        }
        
        store.setShouldShowContext(sessionId, questionId, true);
        console.log(`✅ Context panel should show for Q${questionId}`);
        return selectedPrompt;
      }
      
      store.setShouldShowContext(sessionId, questionId, false);
      console.log(`❌ No context triggers found, hiding panel for Q${questionId}`);
      return null;
    } catch (error) {
      console.error('Error loading context questions:', error);
      return null;
    }
  }, [sessionId, questionId, store]);

  // Update explanation in store - no validation during typing
  const updateExplanation = useCallback((newExplanation: string) => {
    // Store raw value without validation to preserve spaces during typing
    store.updateExplanation(sessionId, questionId, newExplanation);
  }, [sessionId, questionId, store]);

  // Update answer in store
  const updateAnswer = useCallback((answer: 'Yes' | 'No' | 'Unknown') => {
    store.updateAnswer(sessionId, questionId, answer);
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
  };
};