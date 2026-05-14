import { useCallback, useRef, useState } from 'react';
import type { FlowWaypoint } from '@/lib/structure/types';

/** A single undoable snapshot of one flow's editable state. */
export interface FlowEditSnapshot {
  bundleId: string;
  waypoints: FlowWaypoint[];
  labelPosition: FlowWaypoint | null;
}

interface HistoryState {
  past: FlowEditSnapshot[][];
  future: FlowEditSnapshot[][];
}

/**
 * Session-scoped undo/redo for payment-flow edits. Each `push` records the
 * snapshot list as it was BEFORE the edit; `undo` returns that prior state.
 */
export function useFlowEditHistory() {
  const [, force] = useState(0);
  const ref = useRef<HistoryState>({ past: [], future: [] });

  const push = useCallback((before: FlowEditSnapshot[]) => {
    ref.current.past.push(before.map((s) => ({ ...s })));
    ref.current.future = [];
    force((n) => n + 1);
  }, []);

  const undo = useCallback((current: FlowEditSnapshot[]): FlowEditSnapshot[] | null => {
    const prev = ref.current.past.pop();
    if (!prev) return null;
    ref.current.future.push(current.map((s) => ({ ...s })));
    force((n) => n + 1);
    return prev;
  }, []);

  const redo = useCallback((current: FlowEditSnapshot[]): FlowEditSnapshot[] | null => {
    const nextSnap = ref.current.future.pop();
    if (!nextSnap) return null;
    ref.current.past.push(current.map((s) => ({ ...s })));
    force((n) => n + 1);
    return nextSnap;
  }, []);

  const clear = useCallback(() => {
    ref.current = { past: [], future: [] };
    force((n) => n + 1);
  }, []);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: ref.current.past.length > 0,
    canRedo: ref.current.future.length > 0,
  };
}
