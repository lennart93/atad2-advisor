import { useEffect, useCallback, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAssessmentStore } from '@/stores/assessmentStore';
import { useDebounce } from './useDebounce';

interface UseContextPanelProps {
  sessionId: string;
  questionId: string;
  selectedAnswer: 'Yes' | 'No' | 'Unknown' | null;
  onAnswerChange: (answer: 'Yes' | 'No' | 'Unknown') => void;
}

export function useContextPanel({ sessionId, questionId, selectedAnswer, onAnswerChange }: UseContextPanelProps) {
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  const { 
    getQuestionState, 
    setQuestionState, 
    updateExplanation: updateExplanationInStore,
    updateAnswer: updateAnswerInStore,
    setShouldShowContext,
    setContextPrompt,
    setLastVisitedQuestion
  } = useAssessmentStore();

  const currentState = getQuestionState(sessionId, questionId);
  const explanation = currentState?.explanation || '';
  const contextPrompt = currentState?.contextPrompt || '';
  const storedAnswer = currentState?.answer;
  
  // Debounce explanation for auto-saving
  const debouncedExplanation = useDebounce(explanation, 400);
  
  // Determine if context should be shown
  const shouldShowContext = useMemo(() => {
    return explanation.trim().length > 0 || currentState?.shouldShowContext || false;
  }, [explanation, currentState?.shouldShowContext]);

  // Load existing data when component mounts or question changes
  useEffect(() => {
    const loadExistingData = async () => {
      // Mark this question as visited
      setLastVisitedQuestion(sessionId, questionId);
      
      // Check if we already have data in store
      if (currentState?.lastSyncedAt) {
        return; // Already loaded and synced
      }

      try {
        const { data, error } = await supabase
          .from('atad2_answers')
          .select('answer, explanation')
          .eq('session_id', sessionId)
          .eq('question_id', questionId)
          .maybeSingle();

        if (error) {
          console.error('Error loading existing answer:', error);
          return;
        }

        if (data) {
          // Update store with fetched data
          setQuestionState(sessionId, questionId, {
            answer: data.answer as 'Yes' | 'No' | 'Unknown',
            explanation: data.explanation || '',
            lastSyncedAt: new Date().toISOString(),
          });
        } else {
          // No existing data, initialize empty state
          setQuestionState(sessionId, questionId, {
            answer: null,
            explanation: '',
            lastSyncedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Error loading existing data:', error);
      }
    };

    loadExistingData();
  }, [sessionId, questionId, currentState?.lastSyncedAt, setQuestionState, setLastVisitedQuestion]);

  // Debounced upsert function
  const debouncedUpsert = useCallback(async (answer: 'Yes' | 'No' | 'Unknown', explanation: string) => {
    setSavingStatus('saving');
    
    try {
      const { error } = await supabase
        .from('atad2_answers')
        .upsert({
          session_id: sessionId,
          question_id: questionId,
          answer,
          explanation,
          // Keep other fields as they are
          question_text: '', // This should be populated elsewhere
          risk_points: 0, // This should be populated elsewhere
        }, {
          onConflict: 'session_id,question_id'
        });

      if (error) {
        console.error('Error saving to Supabase:', error);
        setSavingStatus('idle');
        return;
      }

      // Update last synced timestamp
      setQuestionState(sessionId, questionId, {
        lastSyncedAt: new Date().toISOString(),
      });
      
      setSavingStatus('saved');
      setTimeout(() => setSavingStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving to Supabase:', error);
      setSavingStatus('idle');
    }
  }, [sessionId, questionId, setQuestionState]);

  // Auto-save explanation when it changes (debounced)
  useEffect(() => {
    if (!debouncedExplanation && debouncedExplanation !== '') return;
    if (!currentState?.lastSyncedAt) return; // Don't save until initial load is complete
    if (!storedAnswer) return; // Don't save without an answer

    debouncedUpsert(storedAnswer, debouncedExplanation);
  }, [debouncedExplanation, storedAnswer, currentState?.lastSyncedAt, debouncedUpsert]);

  // Load context questions based on question and answer
  const loadContextQuestions = useCallback(async (questionId: string, answer: string) => {
    try {
      const { data: contextQuestions, error } = await supabase
        .from('atad2_context_questions')
        .select('context_question')
        .eq('question_id', questionId)
        .eq('answer_trigger', answer);

      if (error) {
        console.error('Error loading context questions:', error);
        return;
      }

      if (contextQuestions && contextQuestions.length > 0) {
        // Randomly select a context question
        const randomQuestion = contextQuestions[Math.floor(Math.random() * contextQuestions.length)];
        setContextPrompt(sessionId, questionId, randomQuestion.context_question);
        setShouldShowContext(sessionId, questionId, true);
      } else {
        setShouldShowContext(sessionId, questionId, false);
      }
    } catch (error) {
      console.error('Error loading context questions:', error);
    }
  }, [sessionId, questionId, setContextPrompt, setShouldShowContext]);

  const updateExplanation = useCallback((explanation: string) => {
    updateExplanationInStore(sessionId, questionId, explanation);
  }, [sessionId, questionId, updateExplanationInStore]);

  const updateAnswer = useCallback((answer: 'Yes' | 'No' | 'Unknown') => {
    // Immediate update to store
    updateAnswerInStore(sessionId, questionId, answer);
    setLastVisitedQuestion(sessionId, questionId);
    
    // Trigger parent component update
    onAnswerChange(answer);
    
    // Debounced save to Supabase
    debouncedUpsert(answer, explanation);
  }, [sessionId, questionId, updateAnswerInStore, setLastVisitedQuestion, onAnswerChange, debouncedUpsert, explanation]);

  const clearContext = useCallback(() => {
    updateExplanationInStore(sessionId, questionId, '');
    setShouldShowContext(sessionId, questionId, false);
  }, [sessionId, questionId, updateExplanationInStore, setShouldShowContext]);

  return {
    explanation,
    contextPrompt,
    shouldShowContext,
    savingStatus,
    selectedAnswer: storedAnswer,
    updateExplanation,
    updateAnswer,
    loadContextQuestions,
    clearContext,
  };
}
