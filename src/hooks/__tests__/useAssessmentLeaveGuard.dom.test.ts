import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAssessmentLeaveGuard } from '../useAssessmentLeaveGuard';

// The guard should only arm while assessment work is actually running.
// Regression for the blanket warning that fired on every /assessment* page
// (even read-only and 404 views) and trained users to click through it.

function fireBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('useAssessmentLeaveGuard', () => {
  it('does not warn while disabled (idle assessment page)', () => {
    const { unmount } = renderHook(() => useAssessmentLeaveGuard(false));
    expect(fireBeforeUnload()).toBe(false);
    unmount();
  });

  it('warns while enabled (work running)', () => {
    const { unmount } = renderHook(() => useAssessmentLeaveGuard(true));
    expect(fireBeforeUnload()).toBe(true);
    unmount();
  });

  it('stops warning once enabled flips back to false', () => {
    const { rerender, unmount } = renderHook(
      ({ on }: { on: boolean }) => useAssessmentLeaveGuard(on),
      { initialProps: { on: true } },
    );
    rerender({ on: false });
    expect(fireBeforeUnload()).toBe(false);
    unmount();
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useAssessmentLeaveGuard(true));
    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });
});
