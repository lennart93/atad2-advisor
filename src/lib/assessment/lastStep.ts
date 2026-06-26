import { ASSESSMENT_STEPS, type AssessmentStep } from './steps';

export type AssessmentStepKey = AssessmentStep['key'];

const STORAGE_PREFIX = 'atad2:lastStep:';

const VALID_KEYS = new Set<string>(ASSESSMENT_STEPS.map((step) => step.key));

/** True when `value` is a known assessment step key. */
export function isAssessmentStepKey(value: unknown): value is AssessmentStepKey {
  return typeof value === 'string' && VALID_KEYS.has(value);
}

/** Validates a raw stored value; returns the step key or null when unusable. */
export function parseStoredStep(raw: string | null): AssessmentStepKey | null {
  return isAssessmentStepKey(raw) ? raw : null;
}

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

/**
 * Remember the step a session is currently on, so resuming from the dashboard
 * returns the user there instead of a fixed default. Stored per browser in
 * localStorage; a no-op when storage is unavailable.
 */
export function writeLastStep(
  sessionId: string,
  stepKey: AssessmentStepKey,
): void {
  if (!sessionId || !isAssessmentStepKey(stepKey)) return;
  try {
    window.localStorage.setItem(storageKey(sessionId), stepKey);
  } catch {
    // Storage unavailable: resume falls back to the data-derived step.
  }
}

/** The remembered step for a session, or null if none/invalid is stored. */
export function readLastStep(sessionId: string): AssessmentStepKey | null {
  if (!sessionId) return null;
  try {
    return parseStoredStep(window.localStorage.getItem(storageKey(sessionId)));
  } catch {
    return null;
  }
}
