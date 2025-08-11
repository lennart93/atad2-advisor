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