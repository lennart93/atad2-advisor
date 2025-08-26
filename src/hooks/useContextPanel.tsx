import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssessmentStore } from '@/stores/assessmentStore';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { useUpdateEffect } from '@/utils/assessmentUtils';
import { validateSessionId, validateQuestionId } from '@/utils/inputValidation';

interface UseContextPanelProps {
  sessionId: string;
  questionId: string;
  selectedAnswer: 'Yes' | 'No' | 'Unknown' | '';
  requiresExplanation?: boolean;
}

export const useContextPanel = ({ sessionId, questionId, selectedAnswer, requiresExplanation }: UseContextPanelProps) => {
  // Use sentinel value to avoid conditional hooks
  const safeQuestionId = questionId || '__none__';

  const store = useAssessmentStore();
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  // Get current state from store (using safe questionId)
  const currentState = store.getQuestionState(sessionId, safeQuestionId);
  const explanation = currentState?.explanation || '';
  const contextPrompt = currentState?.contextPrompt || '';
  
  // Debug: Log explanation changes per question
  console.log(`🔍 useContextPanel for Q${questionId}: explanation="${explanation.substring(0, 30)}...", shouldShow=${currentState?.shouldShowContext}`);
  
  // Safety check: verify we're getting the right explanation for the right question
  if (explanation && questionId) {
    console.log(`✅ Context state for Q${questionId}: has explanation (${explanation.length} chars)`);
  }
  
  // Debounced explanation for auto-saving (increased delay) with cancellation
  const [debouncedExplanation, cancelDebounce] = useDebounce(explanation, 1500);
  
  // Check if context panel should be shown - only based on explicit flag, NOT explanation content
  const shouldShowContext = useMemo(() => {
    // Only show if explicitly flagged by context requirement check
    const showFromStore = currentState?.shouldShowContext || false;
    console.log(`🔍 Context check for Q${questionId}: shouldShowContext=${showFromStore}`);
    return showFromStore;
  }, [currentState?.shouldShowContext, questionId]);

  // Load initial data from Supabase when component mounts
  useEffect(() => {
    const loadInitialData = async () => {
      // Guard against sentinel values
      if (!sessionId || !questionId || questionId === '__none__') return;
      
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
      // Guard against sentinel values and empty content
      if (!sessionId || !questionId || questionId === '__none__' || !debouncedExplanation.trim()) {
        return;
      }

      // Check if the debounced value is actually different from what we last saved
      const lastSyncedExplanation = currentState?.lastSyncedExplanation;
      if (debouncedExplanation === lastSyncedExplanation) {
        return;
      }

      // Auto-save protection: verify current answer still requires context before saving
      const currentAnswer = selectedAnswer || currentState?.answer;
      if (currentAnswer) {
        try {
          const { data: contextQuestions } = await supabase
            .from('atad2_context_questions')
            .select('context_question')
            .eq('question_id', questionId)
            .eq('answer_trigger', currentAnswer);

          const stillRequiresContext = contextQuestions && contextQuestions.length > 0;
          if (!stillRequiresContext) {
            console.log(`🚫 Auto-save cancelled for Q${questionId} - answer ${currentAnswer} no longer requires context`);
            return;
          }
        } catch (error) {
          console.error('Error verifying context requirement:', error);
          return;
        }
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

  // Track what actions we've taken to prevent loops - previous state tracking
  const lastRef = useRef<{q?: string; a?: string; requires?: boolean}>({});

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

      // Add required logging for context fetch
      console.debug('[context:fetch]', { qid: questionId, trigger: answer, rows: contextQuestions?.length ?? 0 });

      if (error) {
        console.error('Error loading context questions:', error);
        store.setContextError(questionId, error.message);
        return null;
      }

      console.log(`📋 Found ${contextQuestions?.length || 0} context questions for Q${questionId}, answer: ${answer}`);

      if (contextQuestions && contextQuestions.length > 0) {
        // Set loading first
        store.setContextLoading(questionId);
        console.log(`⏳ Set loading status for Q${questionId}`);

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
        
        console.log(`🔧 Setting shouldShowContext=true in store for Q${questionId}`);
        store.setShouldShowContext(sessionId, questionId, true);

        // Set context ready with prompts
        const prompts = contextQuestions.map(q => q.context_question);
        store.setContextReady(questionId, prompts);
        console.log(`✅ Set context READY with ${prompts.length} prompts for Q${questionId}`);
        
        // Verify store state was updated
        const verifyState = store.getQuestionState(sessionId, questionId);
        const verifyContext = store.contextByQuestion[questionId];
        console.log(`🔍 Store verification for Q${questionId}:`, {
          shouldShowContext: verifyState?.shouldShowContext,
          hasContextPrompt: !!verifyState?.contextPrompt,
          promptLength: verifyState?.contextPrompt?.length || 0,
          contextStatus: verifyContext?.status,
          contextPromptsCount: verifyContext?.prompts?.length || 0
        });
        
        return selectedPrompt;
      } else {
        store.setContextNone(questionId);
        console.log(`❌ No context triggers found, set status to 'none' for Q${questionId}`);
      }
      
      store.setShouldShowContext(sessionId, questionId, false);
      return null;
    } catch (error) {
      console.error('Error loading context questions:', error);
      store.setContextError(questionId, 'Failed to load context');
      return null;
    }
  }, [sessionId, questionId, store]);

  // Get context state from store
  const clearCtx = useAssessmentStore(s => s.clearContextForQuestion);
  const ctx = useAssessmentStore(s => s.contextByQuestion[questionId ?? '__none__']);
  const status = ctx?.status ?? 'idle';

  // Effect to handle context loading/clearing - skips first render, only acts on transitions
  useUpdateEffect(() => {
    // Guard: skip if in init phase
    if (!questionId || questionId === '__none__') return;

    const prev = lastRef.current;
    const changedQ = prev.q !== questionId;
    const changedA = prev.a !== selectedAnswer;
    // Use DB-based requiresExplanation from props instead of hardcoded logic
    const dbRequiresExplanation = requiresExplanation ?? false;
    const changedReq = prev.requires !== dbRequiresExplanation;

    console.debug('[panel] transition check', { 
      questionId, 
      selectedAnswer, 
      requiresExplanation: dbRequiresExplanation, 
      changedQ, 
      changedA, 
      changedReq, 
      status,
      action: 'checking' 
    });

    // 1) Switch to no explanation (or no selection) → only clear if we had something
    if (!selectedAnswer || !dbRequiresExplanation) {
      // Prevent proactive clearing when explanation is required
      if (dbRequiresExplanation) return;
      // Clear only if we have something to clear OR we just transitioned from requiring → not requiring
      if (status === 'loading' || status === 'ready' || status === 'error' || (prev.requires && !dbRequiresExplanation)) {
        console.debug('[panel] act', { q: questionId, a: selectedAnswer, requiresExplanation: dbRequiresExplanation, status, action: 'clear' });
        clearCtx(questionId);
      }
      lastRef.current = { q: questionId, a: selectedAnswer, requires: dbRequiresExplanation };
      return;
    }

    // 2) Explanation required → only load if (Q/A changed) and status not already ready/none/loading
    if ((changedQ || changedA || changedReq) && !(status === 'ready' || status === 'none' || status === 'loading')) {
      console.debug('[panel] act', { q: questionId, a: selectedAnswer, requiresExplanation: dbRequiresExplanation, status, action: 'load' });
      loadContextQuestions(selectedAnswer);
    }

    lastRef.current = { q: questionId, a: selectedAnswer, requires: dbRequiresExplanation };
  }, [questionId, selectedAnswer, status, clearCtx, loadContextQuestions]);

  // Update explanation in store - no validation during typing
  const updateExplanation = useCallback((newExplanation: string) => {
    // Store raw value without validation to preserve spaces during typing
    store.updateExplanation(sessionId, questionId, newExplanation);
  }, [sessionId, questionId, store]);

  // Update answer in store
  const updateAnswer = useCallback((answer: 'Yes' | 'No' | 'Unknown') => {
    store.updateAnswer(sessionId, questionId, answer);
  }, [sessionId, questionId, store]);

  // Clear context panel - now uses store clearExplanation for consistency
  const clearContext = useCallback(async () => {
    console.log(`🧹 Clearing context for Q${questionId}`);
    
    // Use store's clearExplanation function for consistent state management
    store.clearExplanation(sessionId, questionId);

    // Also clear from database to ensure consistency (only if we have an existing answer record)
    try {
      // First check if there's an existing answer to update
      const { data: existingAnswer } = await supabase
        .from('atad2_answers')
        .select('id, question_text, risk_points')
        .eq('session_id', sessionId)
        .eq('question_id', questionId)
        .single();

      if (existingAnswer) {
        const { error } = await supabase
          .from('atad2_answers')
          .update({
            explanation: '', // Clear explanation
          })
          .eq('session_id', sessionId)
          .eq('question_id', questionId);

        if (error) {
          console.error('Error clearing context in database:', error);
        } else {
          console.log(`✅ Context cleared in database for Q${questionId}`);
        }
      }
    } catch (error) {
      console.error('Error clearing context in database:', error);
    }
  }, [sessionId, questionId, store]);

  // Cancel autosave function
  const cancelAutosave = useCallback(() => {
    console.log(`🚫 Cancelling autosave for Q${questionId}`);
    cancelDebounce();
    setSavingStatus('idle');
  }, [questionId, cancelDebounce]);

  return {
    // Note: explanation removed - components should get it directly from store
    // to ensure strict per-question binding without any potential stale state
    contextPrompt,
    shouldShowContext,
    savingStatus,
    updateExplanation,
    updateAnswer,
    loadContextQuestions,
    clearContext,
    cancelAutosave,
  };
};