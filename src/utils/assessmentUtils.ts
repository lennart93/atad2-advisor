import { useEffect, useRef } from 'react';

// Utility functions for assessment functionality

export const createQAKey = (sessionId: string, questionId: string): string => 
  `${sessionId}:${questionId}`;

export const debounceTime = 400; // milliseconds for auto-save

export const shouldShowContextPanel = (
  hasExplanation: boolean,
  triggersContext: boolean
): boolean => {
  return hasExplanation || triggersContext;
};

export const getSavingStatusText = (status: 'idle' | 'saving' | 'saved'): string => {
  switch (status) {
    case 'saving':
      return 'Saving...';
    case 'saved':
      return 'Saved';
    default:
      return '';
  }
};

// Helper hook that skips first render (mount) to prevent loops
export function useUpdateEffect(effect: React.EffectCallback, deps: React.DependencyList) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { 
      mounted.current = true; 
      return; 
    }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}