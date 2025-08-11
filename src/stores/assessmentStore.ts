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
  lastVisitedQuestions: Record<string, string>; // sessionId -> questionId
  
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
      lastVisitedQuestions: {},

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
          ...prev,
          lastVisitedQuestions: {
            ...prev.lastVisitedQuestions,
            [sessionId]: questionId,
          },
        }), false, 'setLastVisitedQuestion');
        
        // Also save to localStorage for persistence across refreshes
        try {
          localStorage.setItem(`lastVisitedQuestion_${sessionId}`, questionId);
        } catch (error) {
          console.error('Failed to save last visited question to localStorage:', error);
        }
      },

      getLastVisitedQuestion: (sessionId) => {
        const fromStore = get().lastVisitedQuestions[sessionId];
        if (fromStore) return fromStore;
        
        // Fallback to localStorage
        try {
          return localStorage.getItem(`lastVisitedQuestion_${sessionId}`) || undefined;
        } catch (error) {
          console.error('Failed to read last visited question from localStorage:', error);
          return undefined;
        }
      },

      clearSession: (sessionId) => {
        set((prev) => {
          const newByKey = { ...prev.byKey };
          const newLastVisited = { ...prev.lastVisitedQuestions };
          
          Object.keys(newByKey).forEach(key => {
            if (key.startsWith(`${sessionId}:`)) {
              delete newByKey[key];
            }
          });
          
          delete newLastVisited[sessionId];
          
          // Also clear from localStorage
          try {
            localStorage.removeItem(`lastVisitedQuestion_${sessionId}`);
          } catch (error) {
            console.error('Failed to clear last visited question from localStorage:', error);
          }
          
          return { byKey: newByKey, lastVisitedQuestions: newLastVisited };
        }, false, 'clearSession');
      },
    }),
    { name: 'assessment-store' }
  )
);