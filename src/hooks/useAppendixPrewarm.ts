import { useEffect, useRef } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startAppendixGeneration } from '@/lib/appendix/client';

/**
 * Sessions for which the prewarm has already fired. This hook is mounted on more
 * than one page (upload + Q&A), so we dedup at the module level to keep the
 * prewarm to at most one generation run per session across all mounts.
 */
const prewarmedSessions = new Set<string>();

/**
 * Fire the appendix/facts generation once, as soon as the structure chart for
 * this session is ready - regardless of which assessment step the user is on.
 * Fires as early as 'phase_a_ready' (right after upload) so the facts pass is
 * usually done by the time the user reaches the appendix step. Replaces the
 * prewarm that used to live inside StructureChartStep.
 */
export function useAppendixPrewarm(sessionId: string | null | undefined): void {
  const fired = useRef(false);
  useEffect(() => {
    if (!sessionId) return;
    fired.current = false; // new session: allow exactly one prewarm
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled || fired.current || prewarmedSessions.has(sessionId)) return;
      try {
        const c = await loadChart(sessionId);
        const status = c?.chart?.status;
        if (status === 'phase_a_ready' || status === 'draft_ready' || status === 'user_edited' || status === 'finalized') {
          fired.current = true;
          prewarmedSessions.add(sessionId);
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
