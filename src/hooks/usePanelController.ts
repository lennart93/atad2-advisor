import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAssessmentStore } from "@/stores/assessmentStore";

export function usePanelController(sessionId: string, questionId?: string) {
  const qId = questionId ?? "";
  const store = useAssessmentStore();

  // Haal ALLES uit store (nooit lokale selectedAnswer)
  const qState = store.getQuestionState(sessionId, qId);
  const answer = qState?.answer;
  const shouldShowContext = qState?.shouldShowContext ?? false;
  
  // Create selectedOption object based on answer (simplified)
  const selectedAnswerId = answer ? `${qId}-${answer}` : "";
  const requiresExplanation = answer === 'Yes'; // Based on your business logic

  // Zero‑flash gate: vóór paint niet renderen met oude binding
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    setReady(false);
    queueMicrotask(() => setReady(true));
  }, [qId, selectedAnswerId]);

  // Pane key dwingt remount bij vraag/antwoord‑wissel
  const paneKey = `ctx-${qId}-${selectedAnswerId}`;

  // Waarde: per-vraag map; maar ALS er nog geen antwoord is -> ALTIJD lege string
  const explanations = store.getExplanations(); // Record<string,string>
  const value = useMemo(() => {
    if (!selectedAnswerId) return "";     // 🔒 nooit "oude" tekst zonder keus
    return explanations[qId] ?? "";
  }, [qId, selectedAnswerId, explanations]);

  // Hard render‑guard
  const shouldRender =
    ready && !!selectedAnswerId && requiresExplanation && shouldShowContext;

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

  // Debug logging
  console.log("🎮 PanelController", {
    qId,
    selectedAnswerId,
    requiresExplanation,
    shouldShowContext,
    ready,
    shouldRender,
    value: value.slice(0, 20) + "...",
    paneKey
  });

  return { 
    shouldRender, 
    paneKey, 
    value, 
    selectedAnswerId, 
    requiresExplanation,
    contextPrompt: qState?.contextPrompt || ''
  };
}