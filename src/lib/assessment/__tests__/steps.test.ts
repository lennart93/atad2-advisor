// src/lib/assessment/__tests__/steps.test.ts
import { describe, it, expect } from 'vitest';
import { ASSESSMENT_STEPS, stepIndexForPath } from '../steps';

describe('assessment steps', () => {
  it('exposes the seven ordered steps (confirmation gates structure; appendix before report)', () => {
    expect(ASSESSMENT_STEPS.map((s) => s.key)).toEqual([
      'intake', 'documents', 'questions', 'confirmation', 'structure', 'appendix', 'report',
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

  it('maps the structure route to step 4', () => {
    expect(stepIndexForPath('/assessment/structure/abc-123')).toBe(4);
  });

  it('maps the appendix route to step 5', () => {
    expect(stepIndexForPath('/assessment-appendix/abc-123')).toBe(5);
  });

  it('maps the report route to step 6', () => {
    expect(stepIndexForPath('/assessment-report/abc-123')).toBe(6);
  });

  it('returns -1 for non-assessment routes', () => {
    expect(stepIndexForPath('/admin')).toBe(-1);
  });
});
