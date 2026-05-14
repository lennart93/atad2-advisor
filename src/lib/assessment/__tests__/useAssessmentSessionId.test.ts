// src/lib/assessment/__tests__/useAssessmentSessionId.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSessionId } from '../useAssessmentSessionId';

describe('resolveSessionId', () => {
  it('prefers the path param when present', () => {
    expect(resolveSessionId('path-id', new URLSearchParams('session=query-id')))
      .toBe('path-id');
  });
  it('falls back to the ?session= query param', () => {
    expect(resolveSessionId(undefined, new URLSearchParams('session=query-id')))
      .toBe('query-id');
  });
  it('returns null when neither is present', () => {
    expect(resolveSessionId(undefined, new URLSearchParams(''))).toBeNull();
  });
  it('treats an empty path param as absent', () => {
    expect(resolveSessionId('', new URLSearchParams('session=query-id')))
      .toBe('query-id');
  });
});
