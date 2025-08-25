import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type QAKey = `${string}:${string}`; // `${sessionId}:${questionId}`
export type ContextStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

export interface ContextState {
  status: ContextStatus;
  prompts: string[];
  error?: string;
}

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
  contextByQuestion: Record<string, ContextState>;
  
  // Actions
  setQuestionState: (sessionId: string, questionId: string, state: Partial<QAState>) => void;
  getQuestionState: (sessionId: string, questionId: string) => QAState | undefined;
  updateExplanation: (sessionId: string, questionId: string, explanation: string) => void;
  updateAnswer: (sessionId: string, questionId: string, answer: 'Yes' | 'No' | 'Unknown') => void;
  setContextPrompt: (sessionId: string, questionId: string, prompt: string) => void;
  setShouldShowContext: (sessionId: string, questionId: string, show: boolean) => void;
  clearExplanation: (sessionId: string, questionId: string) => void;
  clearSession: (sessionId: string) => void;
  
  // Context management actions
  setContextLoading: (questionId: string) => void;
  setContextReady: (questionId: string, prompts: string[]) => void;
  setContextNone: (questionId: string) => void;
  setContextError: (questionId: string, error?: string) => void;
  clearContextForQuestion: (questionId: string) => void;
  
  // New methods for Panel Controller
  getExplanations: () => Record<string, string>;
  cancelAutosave?: (questionId: string) => void;
}

const createQAKey = (sessionId: string, questionId: string): QAKey => `${sessionId}:${questionId}`;

export const useAssessmentStore = create<AssessmentStore>()(
  devtools(
    (set, get) => ({
      byKey: {},
      contextByQuestion: {},

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

      clearExplanation: (sessionId, questionId) => {
        const key = createQAKey(sessionId, questionId);
        set((prev) => ({
          byKey: {
            ...prev.byKey,
            [key]: {
              ...prev.byKey[key],
              explanation: '',
              shouldShowContext: false,
              lastSyncedExplanation: '',
              contextPrompt: undefined,
            },
          },
        }), false, 'clearExplanation');
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

      // Context management actions
      setContextLoading: (questionId) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextLoading: empty qid');
          return;
        }
        console.debug('[context] status', { qid: questionId, status: 'loading' });
        set((state) => ({
          contextByQuestion: {
            ...state.contextByQuestion,
            [questionId]: { status: 'loading', prompts: [] }
          }
        }), false, 'setContextLoading');
      },

      setContextReady: (questionId, prompts) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextReady: empty qid');
          return;
        }
        console.debug('[context] status', { qid: questionId, status: 'ready', count: prompts.length });
        set((state) => ({
          contextByQuestion: {
            ...state.contextByQuestion,
            [questionId]: { status: 'ready', prompts }
          }
        }), false, 'setContextReady');
      },

      setContextNone: (questionId) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextNone: empty qid');
          return;
        }
        console.debug('[context] status', { qid: questionId, status: 'none' });
        set((state) => ({
          contextByQuestion: {
            ...state.contextByQuestion,
            [questionId]: { status: 'none', prompts: [] }
          }
        }), false, 'setContextNone');
      },

      setContextError: (questionId, error) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextError: empty qid');
          return;
        }
        console.debug('[context] status', { qid: questionId, status: 'error', error });
        set((state) => ({
          contextByQuestion: {
            ...state.contextByQuestion,
            [questionId]: { status: 'error', prompts: [], error }
          }
        }), false, 'setContextError');
      },

      clearContextForQuestion: (questionId) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped clearContextForQuestion: empty qid');
          return;
        }
        console.debug('[context] cleared', { qid: questionId });
        set((state) => {
          const newContext = { ...state.contextByQuestion };
          delete newContext[questionId];
          return { contextByQuestion: newContext };
        }, false, 'clearContextForQuestion');
      },

      // Implementation of getExplanations for Panel Controller
      getExplanations: () => {
        const state = get();
        const explanations: Record<string, string> = {};
        
        Object.entries(state.byKey).forEach(([key, qaState]) => {
          const questionId = key.split(':')[1];
          if (questionId && qaState.explanation) {
            explanations[questionId] = qaState.explanation;
          }
        });
        
        return explanations;
      },

      // Placeholder for autosave cancellation - will be set by useContextPanel
      cancelAutosave: undefined,
    }),
    {
      name: 'assessment-store',
    }
  )
);