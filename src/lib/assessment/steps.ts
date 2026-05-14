// src/lib/assessment/steps.ts

export interface AssessmentStep {
  key: 'intake' | 'documents' | 'questions' | 'structure' | 'report';
  label: string;
  /** Wide steps use max-w-7xl instead of max-w-4xl in the shell body. */
  wide: boolean;
  /** Full-bleed steps render directly into the flex-1 body with no
   *  centered/scroll wrapper — the structure-chart canvas needs the whole area. */
  fullBleed: boolean;
}

export const ASSESSMENT_STEPS: readonly AssessmentStep[] = [
  { key: 'intake',    label: 'Intake',    wide: false, fullBleed: false },
  { key: 'documents', label: 'Documents', wide: false, fullBleed: false },
  { key: 'questions', label: 'Questions', wide: true,  fullBleed: false },
  { key: 'structure', label: 'Structure', wide: true,  fullBleed: true  },
  { key: 'report',    label: 'Report',    wide: false, fullBleed: false },
] as const;

/**
 * Maps a router pathname to a 0-based assessment step index, or -1 if the
 * path is not part of the assessment flow.
 *
 * `/assessment` is ambiguous: it is the intake form before a session exists
 * and the decision tree once a session is active. The caller passes
 * `hasSession` (derived from the `?session=` query param) to disambiguate.
 */
export function stepIndexForPath(
  pathname: string,
  opts: { hasSession?: boolean } = {},
): number {
  if (pathname === '/assessment') {
    return opts.hasSession ? 2 : 0;
  }
  if (pathname.startsWith('/assessment/upload')) return 1;
  if (pathname.startsWith('/assessment/structure/')) return 3;
  if (pathname.startsWith('/assessment-confirmation/')) return 4;
  if (pathname.startsWith('/assessment-report/')) return 4;
  return -1;
}
