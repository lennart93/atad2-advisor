// src/lib/assessment/__tests__/lastStep.test.ts
import { describe, it, expect } from 'vitest';
import { isAssessmentStepKey, parseStoredStep } from '../lastStep';

describe('isAssessmentStepKey', () => {
  it('accepts every known step key', () => {
    for (const key of [
      'intake',
      'documents',
      'questions',
      'confirmation',
      'appendix',
      'structure',
      'report',
    ]) {
      expect(isAssessmentStepKey(key)).toBe(true);
    }
  });

  it('rejects unknown or non-string values', () => {
    expect(isAssessmentStepKey('overview')).toBe(false);
    expect(isAssessmentStepKey('')).toBe(false);
    expect(isAssessmentStepKey(null)).toBe(false);
    expect(isAssessmentStepKey(undefined)).toBe(false);
    expect(isAssessmentStepKey(3)).toBe(false);
  });
});

describe('parseStoredStep', () => {
  it('returns the key for a valid stored value', () => {
    expect(parseStoredStep('structure')).toBe('structure');
  });

  it('returns null for a missing value', () => {
    expect(parseStoredStep(null)).toBeNull();
  });

  it('returns null for a stale/invalid value', () => {
    expect(parseStoredStep('legacy-step')).toBeNull();
    expect(parseStoredStep('')).toBeNull();
  });
});
