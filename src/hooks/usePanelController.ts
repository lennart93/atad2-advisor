import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAssessmentStore } from "@/stores/assessmentStore";

export function usePanelController(sessionId: string, questionId?: string, requiresExplanation?: boolean) {
  // Use sentinel value instead of falsy to avoid conditional hooks
  const qId = questionId || '__none__';
  
  const store = useAssessmentStore();

  // Haal ALLES uit store (nooit lokale selectedAnswer)
  const qState = store.getQuestionState(sessionId, qId);
  const answer = qState?.answer;
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

  // Waarde: per-vraag map; maar ALS er nog geen antwoord is -> ALTIJD lege string
  const explanations = store.getExplanations(); // Record<string,string>
  const value = useMemo(() => {
    if (!selectedAnswerId) return "";     // 🔒 nooit "oude" tekst zonder keus
    return explanations[qId] ?? "";
  }, [qId, selectedAnswerId, explanations]);

  // Guard against sentinel value and ensure real questionId
  const isValidQuestion = questionId && questionId !== '__none__';
  
  // Context status details
  const hasPrompts = contextPrompts.length > 0;
  
  // Fixed render guard using DB-based requiresExplanation
  const shouldRender = !!selectedAnswerId && dbRequiresExplanation;
  
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