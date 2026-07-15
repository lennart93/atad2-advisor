import { describe, it, expect } from 'vitest';
import { appendixPrewarmKey, shouldStartAppendix } from '@/lib/appendix/prewarmKey';

describe('appendixPrewarmKey', () => {
  it('fires only on draft-and-later chart statuses', () => {
    expect(appendixPrewarmKey('s1', { status: 'phase_a_ready', answers_fingerprint: null })).toBeNull();
    expect(appendixPrewarmKey('s1', { status: 'extracting:stage1', answers_fingerprint: null })).toBeNull();
    expect(appendixPrewarmKey('s1', null)).toBeNull();
    for (const st of ['draft_ready', 'user_edited', 'finalized']) {
      expect(appendixPrewarmKey('s1', { status: st, answers_fingerprint: 'abc' })).toBe('s1:draft:abc');
    }
  });
  it('a re-refined chart (new fingerprint) yields a new key, a legacy chart a stable one', () => {
    expect(appendixPrewarmKey('s1', { status: 'draft_ready', answers_fingerprint: 'v2' })).toBe('s1:draft:v2');
    expect(appendixPrewarmKey('s1', { status: 'draft_ready', answers_fingerprint: null })).toBe('s1:draft:legacy');
  });
});

describe('shouldStartAppendix', () => {
  it('starts when the chart matches the current answers', () => {
    expect(shouldStartAppendix('fp1', 'fp1')).toBe(true);
  });
  it('skips when the chart belongs to an older answer set (re-refine underway)', () => {
    expect(shouldStartAppendix('fp1', 'fp2')).toBe(false);
  });
  it('grandfathers a legacy chart without fingerprint', () => {
    expect(shouldStartAppendix(null, 'fp2')).toBe(true);
  });
});
