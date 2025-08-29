import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type QAKey = `${string}:${string}:${string}`; // `${sessionId}:${questionId}:${answer}`
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
  setQuestionState: (sessionId: string, questionId: string, answer: string | null, state: Partial<QAState>) => void;
  getQuestionState: (sessionId: string, questionId: string, answer?: string | null) => QAState | undefined;
  updateExplanation: (sessionId: string, questionId: string, answer: string, explanation: string) => void;
  updateAnswer: (sessionId: string, questionId: string, answer: 'Yes' | 'No' | 'Unknown') => void;
  setContextPrompt: (sessionId: string, questionId: string, answer: string, prompt: string) => void;
  setShouldShowContext: (sessionId: string, questionId: string, answer: string, show: boolean) => void;
  clearSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  
  // Context management actions
  setContextLoading: (questionId: string) => void;
  setContextReady: (questionId: string, prompts: string[]) => void;
  setContextNone: (questionId: string) => void;
  setContextError: (questionId: string, error?: string) => void;
  clearContextForQuestion: (questionId: string) => void;
  
  // New methods for Panel Controller
  getExplanations: () => Record<string, string>;
  clearExplanationForNewQuestion: (sessionId: string, questionId: string) => void;
  cancelAutosave?: (questionId: string) => void;
}

const createQAKey = (sessionId: string, questionId: string, answer: string | null): QAKey => 
  `${sessionId}:${questionId}:${answer || 'none'}`;

export const useAssessmentStore = create<AssessmentStore>()(
  devtools(
    (set, get) => ({
      byKey: {},
      contextByQuestion: {},

      setQuestionState: (sessionId, questionId, answer, state) => {
        const key = createQAKey(sessionId, questionId, answer);
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

      getQuestionState: (sessionId, questionId, answer) => {
        const key = createQAKey(sessionId, questionId, answer);
        return get().byKey[key]; // Return undefined if key doesn't exist
      },

      updateExplanation: (sessionId, questionId, answer, explanation) => {
        const key = createQAKey(sessionId, questionId, answer);
        set((prev) => ({
          byKey: {
            ...prev.byKey,
            [key]: {
              ...prev.byKey[key],
              answer: answer as 'Yes' | 'No' | 'Unknown',
              explanation,
            },
          },
        }), false, 'updateExplanation');
      },

      updateAnswer: (sessionId, questionId, answer) => {
        // When answer changes, we start with a fresh state for the new answer
        // CRITICAL: Clear explanations for other answers on the same question
        const currentKey = createQAKey(sessionId, questionId, answer);
        
        set((prev) => {
          const newByKey = { ...prev.byKey };
          
          // Clear explanations for ALL other answer combinations for this question
          Object.keys(newByKey).forEach(key => {
            const [keySessionId, keyQuestionId] = key.split(':');
            if (keySessionId === sessionId && keyQuestionId === questionId && key !== currentKey) {
              // Clear explanation for other answers to prevent cross-contamination
              newByKey[key] = {
                ...newByKey[key],
                explanation: '',
                lastSyncedAt: undefined,
                lastSyncedExplanation: '',
              };
            }
          });
          
          // Set the new answer with empty explanation to start fresh
          newByKey[currentKey] = {
            ...newByKey[currentKey],
            answer,
            explanation: '', // Always start with empty explanation for new answer selection
            lastSyncedAt: undefined, // Mark as unsaved
          };
          
          return { byKey: newByKey };
        }, false, 'updateAnswer');
      },

      setContextPrompt: (sessionId, questionId, answer, prompt) => {
        const key = createQAKey(sessionId, questionId, answer);
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

      setShouldShowContext: (sessionId, questionId, answer, show) => {
        const key = createQAKey(sessionId, questionId, answer);
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

      clearAllSessions: () => {
        console.log('🧹 Clearing ALL sessions from store');
        set(() => ({
          byKey: {},
          contextByQuestion: {}
        }), false, 'clearAllSessions');
      },

      // Context management actions
      setContextLoading: (questionId) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextLoading: empty qid');
          return;
        }
        set((state) => {
          const prev = state.contextByQuestion[questionId];
          // No-op if already loading - return undefined to prevent re-render
          if (prev?.status === 'loading') {
            console.debug('[context] no-op setContextLoading: already loading', { qid: questionId });
            return undefined;
          }
          console.debug('[context] status', { qid: questionId, status: 'loading' });
          return {
            contextByQuestion: {
              ...state.contextByQuestion,
              [questionId]: { status: 'loading', prompts: [] }
            }
          };
        }, false, 'setContextLoading');
      },

      setContextReady: (questionId, prompts) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextReady: empty qid');
          return;
        }
        set((state) => {
          const prev = state.contextByQuestion[questionId];
          // No-op if already ready with same prompts - return undefined to prevent re-render
          if (prev?.status === 'ready' && JSON.stringify(prev.prompts) === JSON.stringify(prompts)) {
            console.debug('[context] no-op setContextReady: already ready', { qid: questionId });
            return undefined;
          }
          console.debug('[context] status', { qid: questionId, status: 'ready', count: prompts.length });
          return {
            contextByQuestion: {
              ...state.contextByQuestion,
              [questionId]: { status: 'ready', prompts }
            }
          };
        }, false, 'setContextReady');
      },

      setContextNone: (questionId) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextNone: empty qid');
          return;
        }
        set((state) => {
          const prev = state.contextByQuestion[questionId];
          // No-op if status is already 'none' - return undefined to prevent re-render
          if (prev?.status === 'none') {
            console.debug('[context] no-op setContextNone: already none', { qid: questionId });
            return undefined;
          }
          console.debug('[context] status', { qid: questionId, status: 'none' });
          return {
            contextByQuestion: {
              ...state.contextByQuestion,
              [questionId]: { status: 'none', prompts: [] }
            }
          };
        }, false, 'setContextNone');
      },

      setContextError: (questionId, error) => {
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped setContextError: empty qid');
          return;
        }
        set((state) => {
          const prev = state.contextByQuestion[questionId];
          // No-op if already error with same message - return undefined to prevent re-render
          if (prev?.status === 'error' && prev.error === error) {
            console.debug('[context] no-op setContextError: already error', { qid: questionId });
            return undefined;
          }
          console.debug('[context] status', { qid: questionId, status: 'error', error });
          return {
            contextByQuestion: {
              ...state.contextByQuestion,
              [questionId]: { status: 'error', prompts: [], error }
            }
          };
        }, false, 'setContextError');
      },

      clearContextForQuestion: (questionId) => {
        console.debug('[store] clearContextForQuestion CALLED', { qid: questionId });
        if (!questionId || questionId === '__none__') {
          console.debug('[context] skipped clearContextForQuestion: empty qid');
          return;
        }
        set((state) => {
          // No-op if there's nothing to clear - return undefined to prevent re-render
          if (!(questionId in state.contextByQuestion)) {
            console.debug('[context] no-op clearContextForQuestion: nothing to clear', { qid: questionId });
            return undefined;
          }
          console.debug('[context] cleared', { qid: questionId });
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
          const [, questionId, answer] = key.split(':');
          // Only include explanations for states that have the actual answer matching the key
          if (questionId && answer && qaState.explanation && qaState.answer === answer) {
            // For each question, only return the explanation for the current answer
            explanations[questionId] = qaState.explanation;
          }
        });
        
        return explanations;
      },

      // Clear explanation UI for new question navigation (keeps database data)
      clearExplanationForNewQuestion: (sessionId, questionId) => {
        console.log(`🧹 Clearing explanation UI for Q${questionId} on navigation`);
        set((prev) => {
          const newByKey = { ...prev.byKey };
          // Clear explanations for all answer states of this question
          Object.keys(newByKey).forEach(key => {
            const [keySessionId, keyQuestionId] = key.split(':');
            if (keySessionId === sessionId && keyQuestionId === questionId) {
              newByKey[key] = {
                ...newByKey[key],
                explanation: '', // Clear the visual explanation
              };
            }
          });
          return { byKey: newByKey };
        }, false, 'clearExplanationForNewQuestion');
      },

      // Placeholder for autosave cancellation - will be set by useContextPanel
      cancelAutosave: undefined,
    }),
    {
      name: 'assessment-store',
    }
  )
);