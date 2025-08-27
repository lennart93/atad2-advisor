import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAssessmentStore } from "@/stores/assessmentStore";

export function usePanelController(sessionId: string, questionId?: string, requiresExplanation?: boolean) {
  // Use sentinel value instead of falsy to avoid conditional hooks
  const qId = questionId || '__none__';
  
  const store = useAssessmentStore();

  // Get state directly using the current answer - much simpler approach
  
  // For panel controller, we need to know the current answer to get the right state
  // We'll get this from the Assessment component via props or by checking all possible answers
  const allStates = store.byKey;
  
  // Find the current answer state for this question by checking all possible answers
  let currentAnswer: 'Yes' | 'No' | 'Unknown' | null = null;
  let qState: any = { answer: null, explanation: '', shouldShowContext: false };
  
  // Check each possible answer to find the one that exists in the store
  const possibleAnswers: ('Yes' | 'No' | 'Unknown')[] = ['Yes', 'No', 'Unknown'];
  for (const answer of possibleAnswers) {
    const testState = store.getQuestionState(sessionId, qId, answer);
    if (testState && testState.answer === answer) {
      currentAnswer = answer;
      qState = testState;
      break;
    }
  }
  
  const answer = currentAnswer;
  const shouldShowContext = qState?.shouldShowContext ?? false;
  
  // Create selectedOption object based on answer (simplified)
  const selectedAnswerId = answer ? `${qId}-${answer}` : "";
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

  // Waarde: per-vraag map; maar ALS er nog geen antwoord is -> ALTIJD lege string
  const explanations = store.getExplanations(); // Record<string,string>
  const value = useMemo(() => {
    if (!selectedAnswerId) return "";     // 🔒 nooit "oude" tekst zonder keus
    if (!isValidQuestion) return "";      // 🔒 geen tekst voor ongeldige vragen
    
    // Extra safety: ensure qState answer matches current selectedAnswerId
    const expectedAnswerId = `${qId}-${qState?.answer}`;
    if (selectedAnswerId !== expectedAnswerId) {
      console.log(`🛡️ Safety: Answer mismatch - expected "${expectedAnswerId}", got "${selectedAnswerId}". Returning empty.`);
      return "";
    }
    
    // Get current question's explanation directly from store for this session and answer
    const currentExplanation = qState?.explanation ?? "";
    console.log(`🔍 Panel value calculation for Q${qId}: explanation="${currentExplanation}", selectedAnswer="${selectedAnswerId}"`);
    return currentExplanation;
  }, [qId, selectedAnswerId, qState?.explanation, qState?.answer, isValidQuestion]);
  
  // Context status details
  const hasPrompts = contextPrompts.length > 0;
  
  // Simplified render guard: only check if answer selected and requires explanation
  const shouldRender = !!selectedAnswerId && requiresExplanation === true;
  
  console.log("🎮 PanelController DETAILED DEBUG", {
    questionId,
    selectedAnswerId,
    requiresExplanation: dbRequiresExplanation,
    status: contextStatus,
    hasPrompts,
    shouldRender,
    isValidQuestion,
    ready,
    shouldShowContext,
    answer,
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