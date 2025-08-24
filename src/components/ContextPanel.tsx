import React, { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { useAssessmentStore } from "@/stores/assessmentStore";

type Props = {
  sessionId: string;
  questionId?: string;
};

export default function ContextPanel({ sessionId, questionId }: Props) {
  // ✅ ALL HOOKS AT TOP LEVEL - NO CONDITIONAL CALLS
  const qId = questionId ?? "";
  const store = useAssessmentStore();
  
  const qState = store.getQuestionState(sessionId, qId);
  const answer = qState?.answer;
  const selectedAnswerId = answer ? `${qId}-${answer}` : "";
  const requiresExplanation = answer === 'Yes';

  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    setReady(false);
    queueMicrotask(() => setReady(true));
  }, [qId, selectedAnswerId]);

  const explanations = store.getExplanations();
  const value = useMemo(() => {
    if (!selectedAnswerId) return "";
    return explanations[qId] ?? "";
  }, [qId, selectedAnswerId, explanations]);

  const paneToken = `ctx-${qId}-${selectedAnswerId}`;
  
  useLayoutEffect(() => {
    store.setActivePaneToken(paneToken);
  }, [paneToken, store]);

  const prevKeyRef = useRef<string>("");
  useEffect(() => {
    if (prevKeyRef.current && prevKeyRef.current !== paneToken) {
      const prevQ = prevKeyRef.current.slice(4).split("-")[0];
      store.cancelAutosave?.(prevQ);
    }
    prevKeyRef.current = paneToken;
  }, [paneToken, store]);

  // 🔒 GUARDS AFTER ALL HOOKS - SAFE TO RETURN NULL
  if (!sessionId) {
    return null;
  }

  const shouldRender = ready && !!selectedAnswerId && requiresExplanation;
  if (!shouldRender) {
    return null;
  }

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
        key={paneToken}
        value={value}
        onChange={(e) => store.updateExplanation(sessionId, qId, e.target.value, paneToken)}
        className="w-full min-h-24 border rounded p-2"
        placeholder="Your explanation..."
      />
    </div>
  );
}