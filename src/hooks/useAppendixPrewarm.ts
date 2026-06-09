import { useEffect, useRef } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startAppendixGeneration } from '@/lib/appendix/client';

/**
 * Fire the appendix/facts generation once, as soon as the structure chart for
 * this session has been drafted - regardless of which assessment step the user is
 * on. Replaces the prewarm that used to live inside StructureChartStep.
 */
export function useAppendixPrewarm(sessionId: string | undefined): void {
  const fired = useRef(false);
  useEffect(() => {
    if (!sessionId || fired.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled || fired.current) return;
      try {
        const c = await loadChart(sessionId);
        const status = c?.chart?.status;
        if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') {
          fired.current = true;
          startAppendixGeneration(sessionId).catch(() => {});
          return;
        }
      } catch { /* keep polling */ }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);
}
