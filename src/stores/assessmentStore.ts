import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type QAKey = `${string}:${string}`; // `${sessionId}:${questionId}`

export interface QAState {
  answer: 'Yes' | 'No' | 'Unknown' | null;
  explanation: string;
  contextPrompt?: string; // cached context question
  lastSyncedAt?: string;
  lastSyncedExplanation?: string; // last explanation that was saved to DB
  shouldShowContext?: boolean; // whether context panel should be visible
}

interface AssessmentStore {
  byKey: Record<QAKey, QAState>;
  
  // Actions
  setQuestionState: (sessionId: string, questionId: string, state: Partial<QAState>) => void;
  getQuestionState: (sessionId: string, questionId: string) => QAState | undefined;
  updateExplanation: (sessionId: string, questionId: string, explanation: string) => void;
  updateAnswer: (sessionId: string, questionId: string, answer: 'Yes' | 'No' | 'Unknown') => void;
  setContextPrompt: (sessionId: string, questionId: string, prompt: string) => void;
  setShouldShowContext: (sessionId: string, questionId: string, show: boolean) => void;
  clearSession: (sessionId: string) => void;
}

const createQAKey = (sessionId: string, questionId: string): QAKey => `${sessionId}:${questionId}`;

export const useAssessmentStore = create<AssessmentStore>()(
  devtools(
    (set, get) => ({
      byKey: {},

      setQuestionState: (sessionId, questionId, state) => {
        const key = createQAKey(sessionId, questionId);
        set((prev) => ({
          byKey: {
            ...prev.byKey,
            [key]: {
              ...prev.byKey[key],
              ...state,
            },
          },
        }), false, 'setQuestionState');
      },

      getQuestionState: (sessionId, questionId) => {
        const key = createQAKey(sessionId, questionId);
        return get().byKey[key];
      },

      updateExplanation: (sessionId, questionId, explanation) => {
        const key = createQAKey(sessionId, questionId);
        set((prev) => ({
          byKey: {
            ...prev.byKey,
            [key]: {
              ...prev.byKey[key],
              explanation,
            },
          },
        }), false, 'updateExplanation');
      },

      updateAnswer: (sessionId, questionId, answer) => {
        const key = createQAKey(sessionId, questionId);
        set((prev) => ({
          byKey: {
            ...prev.byKey,
            [key]: {
              ...prev.byKey[key],
              answer,
            },
          },
        }), false, 'updateAnswer');
      },

      setContextPrompt: (sessionId, questionId, prompt) => {
        const key = createQAKey(sessionId, questionId);
        set((prev) => ({
          byKey: {
            ...prev.byKey,
            [key]: {
              ...prev.byKey[key],
              contextPrompt: prompt,
            },
          },
        }), false, 'setContextPrompt');
      },

      setShouldShowContext: (sessionId, questionId, show) => {
        const key = createQAKey(sessionId, questionId);
        set((prev) => ({
          byKey: {
            ...prev.byKey,
            [key]: {
              ...prev.byKey[key],
              shouldShowContext: show,
            },
          },
        }), false, 'setShouldShowContext');
      },

      clearSession: (sessionId) => {
        set((prev) => {
          const newByKey = { ...prev.byKey };
          Object.keys(newByKey).forEach(key => {
            if (key.startsWith(`${sessionId}:`)) {
              delete newByKey[key];
            }
          });
          return { byKey: newByKey };
        }, false, 'clearSession');
      },
    }),
    { name: 'assessment-store' }
  )
);