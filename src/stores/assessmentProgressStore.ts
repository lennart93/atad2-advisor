import { create } from "zustand";

interface AssessmentProgressState {
  active: boolean;
  answered: number;
  expectedTotal: number;
  setProgress: (next: { answered: number; expectedTotal: number }) => void;
  clearProgress: () => void;
}

export const useAssessmentProgress = create<AssessmentProgressState>((set) => ({
  active: false,
  answered: 0,
  expectedTotal: 0,
  setProgress: ({ answered, expectedTotal }) =>
    set({
      active: expectedTotal > 0,
      answered: Math.max(0, Math.min(answered, expectedTotal)),
      expectedTotal,
    }),
  clearProgress: () => set({ active: false, answered: 0, expectedTotal: 0 }),
}));
