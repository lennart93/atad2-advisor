// src/components/assessment/AssessmentShellContext.tsx
import { createContext, useContext } from 'react';

export interface AssessmentSessionMeta {
  sessionId: string | null;
  taxpayerName: string | null;
  status: string | null;
  /** Opens the document-upload step from anywhere later in the flow. */
  openDocuments: () => void;
}

export interface AssessmentShellContextValue {
  /** The shell's footer DOM node — pages portal their Back/Next into it. */
  footerEl: HTMLElement | null;
  meta: AssessmentSessionMeta;
}

export const AssessmentShellContext =
  createContext<AssessmentShellContextValue | null>(null);

export function useAssessmentShell(): AssessmentShellContextValue {
  const ctx = useContext(AssessmentShellContext);
  if (!ctx) {
    return {
      footerEl: null,
      meta: {
        sessionId: null,
        taxpayerName: null,
        status: null,
        openDocuments: () => {},
      },
    };
  }
  return ctx;
}

export function useAssessmentSessionMeta(): AssessmentSessionMeta {
  return useAssessmentShell().meta;
}
