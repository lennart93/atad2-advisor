import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAssessmentStore } from "@/stores/assessmentStore";

export function usePanelController(sessionId: string, questionId?: string, selectedAnswer?: string, requiresExplanation?: boolean) {
  // Use sentinel value instead of falsy to avoid conditional hooks
  const qId = questionId || '__none__';
  
  const store = useAssessmentStore();

  // Only get state if we have a selected answer - no more iteration through possibilities
  const qState = selectedAnswer 
    ? store.getQuestionState(sessionId, qId, selectedAnswer as 'Yes' | 'No' | 'Unknown')
    : undefined;
    
  const shouldShowContext = qState?.shouldShowContext ?? false;
  
  // Create selectedOption object based on selectedAnswer prop
  const selectedAnswerId = selectedAnswer ? `${qId}-${selectedAnswer}` : "";
  // Use DB-based requiresExplanation passed from parent instead of hardcoded logic
  const dbRequiresExplanation = requiresExplanation ?? false;

  // Zero‑flash gate: vóór paint niet renderen met oude binding
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    setReady(false);
    queueMicrotask(() => setReady(true));
  }, [qId, selectedAnswerId]);

  // Direct context status from store
  const contextState = store.contextByQuestion[qId];
  const contextStatus = contextState?.status ?? 'idle';
  const contextPrompts = contextState?.prompts ?? [];

  // Pane key dwingt remount bij vraag/antwoord‑wissel
  const paneKey = `ctx-${qId}-${selectedAnswerId}`;

  // Guard against sentinel value and ensure real questionId
  const isValidQuestion = questionId && questionId !== '__none__';

  // Use UI-specific explanation store instead of QA state to prevent bleed-through
  const value = useMemo(() => {
    if (!selectedAnswerId) return "";     // 🔒 no text without answer selection
    if (!isValidQuestion) return "";      // 🔒 no text for invalid questions
    if (!selectedAnswer) return "";       // 🔒 no text without selected answer
    
    // 🔒 CRITICAL: Ensure selectedAnswer belongs to current questionId
    // Prevent carry-over from previous questions during navigation
    const answerId = selectedAnswerId.split('-')[0]; // Extract question ID from selectedAnswerId
    if (answerId !== qId) {
      console.log(`🚫 Answer mismatch! Selected answer ${selectedAnswerId} doesn't belong to current question ${qId}`);
      return "";
    }
    
    // Get explanation from UI-specific store for this session/question
    const sessionId = window.location.pathname.split('/')[2] || 'unknown'; // Extract from URL
    const currentExplanation = store.getExplanationForQuestion(sessionId, qId);
    console.log(`🔍 Panel value calculation for Q${qId}: explanation="${currentExplanation.substring(0, 30)}...", selectedAnswer="${selectedAnswerId}", answerBelongsToQuestion=${answerId === qId}`);
    return currentExplanation;
  }, [qId, selectedAnswerId, selectedAnswer, isValidQuestion, store]);
  
  // Context status details
  const hasPrompts = contextPrompts.length > 0;
  
  // Simplified render guard: only check if answer selected and requires explanation
  const shouldRender = !!selectedAnswerId && requiresExplanation === true;
  
  console.log("🎮 PanelController DETAILED DEBUG", {
    questionId,
    selectedAnswer,
    selectedAnswerId,
    requiresExplanation: dbRequiresExplanation,
    status: contextStatus,
    hasPrompts,
    shouldRender,
    isValidQuestion,
    ready,
    shouldShowContext,
    contextPrompts: contextPrompts.length,
    contextState: contextState ? 'exists' : 'missing'
  });

  // Add logging for answer selection
  console.debug('[answer]', { 
    qid: qId, 
    answerId: selectedAnswerId, 
    requiresExplanation: dbRequiresExplanation 
  });

  // Autosave cancel op wissel (per vraag)
  const prevKey = useRef<string>("");
  useLayoutEffect(() => {
    if (prevKey.current && prevKey.current !== paneKey) {
      const prevQId = prevKey.current.slice(4).split("-")[0];
      if (store.cancelAutosave) {
        store.cancelAutosave(prevQId);
      }
    }
    prevKey.current = paneKey;
  }, [paneKey, store]);

  // Additional debugging for context loading verification
  console.log("🔍 Context Status Check", {
    qId,
    contextStatus,
    contextState,
    prompts: contextPrompts,
    shouldShowContext,
    storeContextByQuestion: store.contextByQuestion
  });

  return { 
    shouldRender, 
    paneKey, 
    value, 
    selectedAnswerId, 
    requiresExplanation: dbRequiresExplanation,
    contextPrompt: qState?.contextPrompt || '',
    contextStatus,
    contextPrompts
  };
}