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
      return "";
    }
    
    // Get explanation from UI-specific store for this session/question
    // Extract sessionId from URL only once and memoize it
    const pathParts = window.location.pathname.split('/');
    const sessionId = pathParts.length > 2 ? pathParts[2] : 'unknown';
    const currentExplanation = store.getExplanationForQuestion(sessionId, qId);
    return currentExplanation;
  }, [qId, selectedAnswerId, selectedAnswer, isValidQuestion, store]);
  
  // Context status details
  const hasPrompts = contextPrompts.length > 0;
  
  // Simplified render guard: only check if answer selected and requires explanation
  const shouldRender = !!selectedAnswerId && requiresExplanation === true;
  
  // Reduce excessive logging - only log when values actually change
  const prevDebugRef = useRef<string>("");
  const currentDebugKey = `${questionId}-${selectedAnswer}-${requiresExplanation}-${shouldRender}`;
  
  if (prevDebugRef.current !== currentDebugKey) {
    console.log("🎮 PanelController", {
      questionId: questionId || 'empty',
      selectedAnswer,
      requiresExplanation: dbRequiresExplanation,
      shouldRender,
      contextStatus
    });
    prevDebugRef.current = currentDebugKey;
  }

  // Add logging for answer selection only when it changes
  const prevAnswerRef = useRef<string>("");
  const currentAnswerKey = `${qId}-${selectedAnswerId}`;
  if (prevAnswerRef.current !== currentAnswerKey) {
    console.debug('[answer]', { 
      qid: qId, 
      answerId: selectedAnswerId, 
      requiresExplanation: dbRequiresExplanation 
    });
    prevAnswerRef.current = currentAnswerKey;
  }

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

  // Reduce context status logging - only when status changes
  const prevContextRef = useRef<string>("");
  const currentContextKey = `${qId}-${contextStatus}`;
  if (prevContextRef.current !== currentContextKey) {
    console.log("🔍 Context Status", {
      qId,
      contextStatus,
      prompts: contextPrompts.length
    });
    prevContextRef.current = currentContextKey;
  }

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