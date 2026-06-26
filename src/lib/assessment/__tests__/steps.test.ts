// src/lib/assessment/__tests__/steps.test.ts
import { describe, it, expect } from 'vitest';
import { ASSESSMENT_STEPS, stepIndexForPath, stepUrlForKey } from '../steps';

describe('assessment steps', () => {
  it('exposes the seven ordered steps (confirmation gates appendix; structure before report)', () => {
    expect(ASSESSMENT_STEPS.map((s) => s.key)).toEqual([
      'intake', 'documents', 'questions', 'confirmation', 'appendix', 'structure', 'report',
    ]);
  });

  it('marks questions and structure as wide; structure as fullBleed', () => {
    const byKey = Object.fromEntries(ASSESSMENT_STEPS.map((s) => [s.key, s]));
    expect(byKey.questions.wide).toBe(true);
    expect(byKey.structure.wide).toBe(true);
    expect(byKey.structure.fullBleed).toBe(true);
    expect(byKey.intake.wide).toBe(false);
    expect(byKey.intake.fullBleed).toBe(false);
    expect(byKey.documents.fullBleed).toBe(false);
    expect(byKey.confirmation.wide).toBe(false);
    expect(byKey.confirmation.fullBleed).toBe(false);
    expect(byKey.report.fullBleed).toBe(false);
    expect(byKey.appendix.wide).toBe(true);
    expect(byKey.appendix.fullBleed).toBe(false);
  });

  it('maps the intake route to step 0', () => {
    expect(stepIndexForPath('/assessment')).toBe(0);
  });

  it('maps the upload route to step 1', () => {
    expect(stepIndexForPath('/assessment/upload')).toBe(1);
  });

  it('treats /assessment with an active session as the questions step', () => {
    expect(stepIndexForPath('/assessment', { hasSession: true })).toBe(2);
  });

  it('maps the confirmation route to step 3', () => {
    expect(stepIndexForPath('/assessment-confirmation/abc-123')).toBe(3);
  });

  it('maps the appendix route to step 4', () => {
    expect(stepIndexForPath('/assessment-appendix/abc-123')).toBe(4);
  });

  it('maps the structure route to step 5', () => {
    expect(stepIndexForPath('/assessment/structure/abc-123')).toBe(5);
  });

  it('maps the report route to step 6', () => {
    expect(stepIndexForPath('/assessment-report/abc-123')).toBe(6);
  });

  it('returns -1 for non-assessment routes', () => {
    expect(stepIndexForPath('/admin')).toBe(-1);
  });
});

describe('stepUrlForKey', () => {
  const SESSION = 'sess-123';

  it('maps each per-session step to its route', () => {
    expect(stepUrlForKey('documents', SESSION)).toBe(
      `/assessment/upload?session=${SESSION}`,
    );
    expect(stepUrlForKey('questions', SESSION)).toBe(
      `/assessment?session=${SESSION}`,
    );
    expect(stepUrlForKey('confirmation', SESSION)).toBe(
      `/assessment-confirmation/${SESSION}`,
    );
    expect(stepUrlForKey('appendix', SESSION)).toBe(
      `/assessment-appendix/${SESSION}`,
    );
    expect(stepUrlForKey('structure', SESSION)).toBe(
      `/assessment/structure/${SESSION}`,
    );
    expect(stepUrlForKey('report', SESSION)).toBe(
      `/assessment-report/${SESSION}`,
    );
  });

  it('returns null for intake (no per-session route)', () => {
    expect(stepUrlForKey('intake', SESSION)).toBeNull();
  });

  it('round-trips through stepIndexForPath for every per-session step', () => {
    for (const step of ASSESSMENT_STEPS) {
      const url = stepUrlForKey(step.key, SESSION);
      if (url === null) continue; // intake has no per-session route
      const [pathname, query = ''] = url.split('?');
      const hasSession = new URLSearchParams(query).has('session');
      const expectedIndex = ASSESSMENT_STEPS.findIndex((s) => s.key === step.key);
      expect(stepIndexForPath(pathname, { hasSession })).toBe(expectedIndex);
    }
  });
});
