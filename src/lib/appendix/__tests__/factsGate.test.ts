import { describe, it, expect } from 'vitest';
import { decideFactsGate } from '@/lib/appendix/factsGate';

const base = {
  currentFingerprint: 'fp1',
  chartStatus: 'draft_ready' as string | null,
  chartFingerprint: 'fp1' as string | null,
};
const appendix = (over: Partial<{ generation_status: string; review_status: string; answers_fingerprint: string | null; generatingIsFresh: boolean }> = {}) => ({
  generation_status: 'ready', review_status: 'draft', answers_fingerprint: 'fp1', generatingIsFresh: false, ...over,
});

describe('decideFactsGate', () => {
  it('shows a ready appendix whose fingerprint matches the current answers', () => {
    expect(decideFactsGate({ ...base, appendix: appendix() })).toEqual({ kind: 'show' });
  });
  it('grandfathers a confirmed appendix regardless of fingerprint', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ review_status: 'confirmed', answers_fingerprint: null }) }))
      .toEqual({ kind: 'show' });
  });
  it('waits without action while a fresh generation runs', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ generation_status: 'generating', generatingIsFresh: true, answers_fingerprint: null }) }))
      .toEqual({ kind: 'wait', action: 'none' });
  });
  it('starts a refine when the chart does not carry the current fingerprint', () => {
    expect(decideFactsGate({ ...base, chartFingerprint: 'oud', appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'start-refine' });
  });
  it('waits without action while the chart is extracting', () => {
    expect(decideFactsGate({ ...base, chartStatus: 'extracting:refining', chartFingerprint: 'oud', appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'none' });
  });
  it('starts the appendix when the chart is current but the appendix is not', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
    expect(decideFactsGate({ ...base, appendix: null }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
  });
  it('a session without any chart skips the chart requirement', () => {
    expect(decideFactsGate({ ...base, chartStatus: null, chartFingerprint: null, appendix: appendix({ answers_fingerprint: 'oud' }) }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
  });
  it('an errored generation with a current chart restarts the appendix', () => {
    expect(decideFactsGate({ ...base, appendix: appendix({ generation_status: 'error', answers_fingerprint: null }) }))
      .toEqual({ kind: 'wait', action: 'start-appendix' });
  });
});
