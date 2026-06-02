import { useEffect } from "react";
import { create } from "zustand";

interface UiBusyState {
  count: number;
  begin: () => void;
  end: () => void;
}

const useUiBusyStore = create<UiBusyState>((set) => ({
  count: 0,
  begin: () => set((s) => ({ count: s.count + 1 })),
  end: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

export function useIsUiBusy(): boolean {
  return useUiBusyStore((s) => s.count > 0);
}

/**
 * Declare this component "busy" while `active` is true. Increments a global
 * counter on mount/when active flips on, decrements on unmount/when active
 * flips off. The top-left AnimatedLogo (AppLayout) spins whenever the
 * counter is > 0, so individual loading surfaces don't need their own logo.
 */
export function useUiBusySignal(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { begin, end } = useUiBusyStore.getState();
    begin();
    return () => end();
  }, [active]);
}
