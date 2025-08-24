import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAssessmentStore } from "@/stores/assessmentStore";

type Props = {
  sessionId: string;
  questionId?: string;
};

export default function ContextPanel({ sessionId, questionId }: Props) {
  const qId = questionId ?? "";
  const store = useAssessmentStore();

  // 1) ALLES uit de store (geen lokale selectedAnswer)
  const qState = store.getQuestionState(sessionId, qId);
  const answer = qState?.answer;
  const shouldShowContext = qState?.shouldShowContext ?? false;
  
  // Create selectedOption object based on answer (simplified)
  const selectedAnswerId = answer ? `${qId}-${answer}` : "";
  const requiresExplanation = answer === 'Yes'; // Based on your business logic

  // 2) Zero-flash gate - voorkom paint met oude binding
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    setReady(false);
    queueMicrotask(() => setReady(true));
  }, [qId, selectedAnswerId]);

  // 3) Pane key dwingt remount
  const paneKey = `ctx-${qId}-${selectedAnswerId}`;

  // 4) Value uitsluitend per-vraag; ZONDER antwoord altijd ""
  const explanations = store.getExplanations(); // Record<string,string>
  const value = useMemo(() => {
    if (!selectedAnswerId) return "";        // 🔒 geen antwoord = lege value
    return explanations[qId] ?? "";
  }, [qId, selectedAnswerId, explanations]);

  // 5) Strikte render guard — geen paneel zonder antwoord & requirement & ready
  const shouldRender = ready && !!selectedAnswerId && requiresExplanation && shouldShowContext;
  
  // 6) Cancel per-vraag autosave bij wissel
  const prevKeyRef = useRef<string>("");
  useLayoutEffect(() => {
    if (prevKeyRef.current && prevKeyRef.current !== paneKey) {
      const prevQ = prevKeyRef.current.slice(4).split("-")[0];
      store.cancelAutosave?.(prevQ);
    }
    prevKeyRef.current = paneKey;
  }, [paneKey, store]);

  // Instrumentatie tijdelijk aan
  console.log("CTX", {
    qId, 
    selectedAnswerId, 
    requiresExplanation, 
    shouldShowContext,
    ready,
    shouldRender,
    valuePreview: (value ?? "").slice(0, 30)
  });

  if (!shouldRender) return null;

  return (
    <div data-testid="context-panel" className="bg-gray-50 rounded-lg px-4 py-3 mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-700 italic">
          <span className="text-lg mr-2">💡</span>
          <span>Context for Q{qId}</span>
        </div>
      </div>
      <label className="block mb-2 font-medium">Context</label>
      <textarea
        key={paneKey}
        value={value}                         // controlled only
        onChange={(e) => store.updateExplanation(sessionId, qId, e.target.value)}
        className="w-full min-h-24 border rounded p-2"
        placeholder="Your explanation..."
      />
    </div>
  );
}