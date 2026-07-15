import { describe, it, expect } from 'vitest';
import { shouldFireRefine } from '@/lib/assessment/speculativeRefine';

describe('shouldFireRefine', () => {
  const fp = 'abc';
  it('fires when the chart has no or another fingerprint and is not extracting', () => {
    expect(shouldFireRefine({ chartStatus: 'phase_a_ready', chartFingerprint: null, fingerprint: fp })).toBe(true);
    expect(shouldFireRefine({ chartStatus: 'draft_ready', chartFingerprint: 'oud', fingerprint: fp })).toBe(true);
    expect(shouldFireRefine({ chartStatus: null, chartFingerprint: null, fingerprint: fp })).toBe(true);
  });
  it('does not fire when the chart already carries this fingerprint', () => {
    expect(shouldFireRefine({ chartStatus: 'draft_ready', chartFingerprint: fp, fingerprint: fp })).toBe(false);
  });
  it('does not fire while an extraction is running', () => {
    expect(shouldFireRefine({ chartStatus: 'extracting:stage1', chartFingerprint: null, fingerprint: fp })).toBe(false);
    expect(shouldFireRefine({ chartStatus: 'extracting:refining', chartFingerprint: 'oud', fingerprint: fp })).toBe(false);
  });
});
