import { describe, it, expect } from 'vitest';
import { isStaleExtracting, STALE_THRESHOLD_MS } from '../../../../supabase/functions/extract-structure/staleness';

describe('isStaleExtracting', () => {
  const now = new Date('2026-05-24T12:00:00Z');

  it('returns false when status is not in an extracting state', () => {
    expect(isStaleExtracting('draft_ready', '2026-05-24T11:00:00Z', now)).toBe(false);
    expect(isStaleExtracting('phase_a_ready', '2026-05-24T11:00:00Z', now)).toBe(false);
    expect(isStaleExtracting('extraction_failed', '2026-05-24T11:00:00Z', now)).toBe(false);
  });

  it('returns false when status is extracting but heartbeat is fresh', () => {
    const fresh = new Date(now.getTime() - 10_000).toISOString();
    expect(isStaleExtracting('extracting:stage1', fresh, now)).toBe(false);
    expect(isStaleExtracting('extracting:stage2', fresh, now)).toBe(false);
    expect(isStaleExtracting('extracting:refining', fresh, now)).toBe(false);
  });

  it('returns true when status is extracting and heartbeat is older than threshold', () => {
    const stale = new Date(now.getTime() - STALE_THRESHOLD_MS - 1_000).toISOString();
    expect(isStaleExtracting('extracting:stage1', stale, now)).toBe(true);
    expect(isStaleExtracting('extracting:stage2', stale, now)).toBe(true);
    expect(isStaleExtracting('extracting:refining', stale, now)).toBe(true);
  });

  it('returns true when status is extracting and heartbeat is null (legacy rows pre-migration)', () => {
    expect(isStaleExtracting('extracting:stage1', null, now)).toBe(true);
  });

  it('uses 90 seconds as the threshold', () => {
    expect(STALE_THRESHOLD_MS).toBe(90_000);
  });

  it('boundary: exactly at threshold counts as stale', () => {
    const atBoundary = new Date(now.getTime() - STALE_THRESHOLD_MS).toISOString();
    expect(isStaleExtracting('extracting:stage1', atBoundary, now)).toBe(true);
  });
});
