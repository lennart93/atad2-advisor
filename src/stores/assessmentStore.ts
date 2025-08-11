import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type QAKey = `${string}:${string}`; // `${sessionId}:${questionId}`

export interface QAState {
  answer: 'Yes' | 'No' | 'Unknown' | null;
  explanation: string;
  contextPrompt?: string; // cached context question
  lastSyncedAt?: string;
  shouldShowContext?: boolean; // whether context panel should be visible
}

interface AssessmentStore {
  byKey: Record<QAKey, QAState>;
  lastVisitedQuestion: Record<string, string>; // sessionId -> questionId
  
  // Actions
  setQuestionState: (sessionId: string, questionId: string, state: Partial<QAState>) => void;
  getQuestionState: (sessionId: string, questionId: string) => QAState | undefined;
  updateExplanation: (sessionId: string, questionId: string, explanation: string) => void;
  updateAnswer: (sessionId: string, questionId: string, answer: 'Yes' | 'No' | 'Unknown') => void;
  setContextPrompt: (sessionId: string, questionId: string, prompt: string) => void;
  setShouldShowContext: (sessionId: string, questionId: string, show: boolean) => void;
  setLastVisitedQuestion: (sessionId: string, questionId: string) => void;
  getLastVisitedQuestion: (sessionId: string) => string | undefined;
  clearSession: (sessionId: string) => void;
}

const createQAKey = (sessionId: string, questionId: string): QAKey => `${sessionId}:${questionId}`;

export const useAssessmentStore = create<AssessmentStore>()(
  devtools(
    (set, get) => ({
      byKey: {},
      lastVisitedQuestion: {},

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

      setLastVisitedQuestion: (sessionId, questionId) => {
        set((prev) => ({
          lastVisitedQuestion: {
            ...prev.lastVisitedQuestion,
            [sessionId]: questionId,
          },
        }), false, 'setLastVisitedQuestion');
        
        // Also save to localStorage for hard refresh recovery
        try {
          localStorage.setItem(`lastVisited_${sessionId}`, questionId);
        } catch (e) {
          console.warn('Could not save to localStorage:', e);
        }
      },

      getLastVisitedQuestion: (sessionId) => {
        const fromStore = get().lastVisitedQuestion[sessionId];
        if (fromStore) return fromStore;
        
        // Fallback to localStorage
        try {
          return localStorage.getItem(`lastVisited_${sessionId}`) || undefined;
        } catch (e) {
          console.warn('Could not read from localStorage:', e);
          return undefined;
        }
      },

      clearSession: (sessionId) => {
        set((prev) => {
          const newByKey = { ...prev.byKey };
          Object.keys(newByKey).forEach(key => {
            if (key.startsWith(`${sessionId}:`)) {
              delete newByKey[key];
            }
          });
          const newLastVisited = { ...prev.lastVisitedQuestion };
          delete newLastVisited[sessionId];
          
          return { 
            byKey: newByKey,
            lastVisitedQuestion: newLastVisited 
          };
        }, false, 'clearSession');
        
        // Also clear from localStorage
        try {
          localStorage.removeItem(`lastVisited_${sessionId}`);
        } catch (e) {
          console.warn('Could not clear localStorage:', e);
        }
      },
    }),
    { name: 'assessment-store' }
  )
);