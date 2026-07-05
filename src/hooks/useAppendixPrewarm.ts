import { useEffect } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startAppendixGeneration } from '@/lib/appendix/client';

/**
 * Milestones for which the prewarm has already fired, keyed `${sessionId}:${milestone}`.
 * This hook is mounted on more than one page (upload + Q&A), so we dedup at the
 * module level to keep each milestone to at most one generation run per session.
 */
const prewarmedMilestones = new Set<string>();

/**
 * The chart-status milestone that should trigger an appendix/facts generation:
 *  - 'phaseA'  once the docs-only chart is ready (right after upload), so the
 *              facts pass runs early;
 *  - 'draft'   once Phase B has folded in the questionnaire (draft_ready and
 *              beyond), so the facts pass reruns on the enriched chart. This
 *              second fire is what lets acting-together populate from the fuller
 *              shareholder picture instead of resting on the docs-only pass.
 */
function milestoneOf(status: string | null | undefined): 'phaseA' | 'draft' | null {
  if (status === 'phase_a_ready') return 'phaseA';
  if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') return 'draft';
  return null;
}

/**
 * Fire the appendix/facts generation as soon as the structure chart reaches a
 * milestone, regardless of which assessment step the user is on. Fires once at
 * 'phase_a_ready' (right after upload) and once again when the chart advances to
 * 'draft_ready' (after the questionnaire), so the acting-together assessment gets
 * a fresh run on the enriched chart rather than freezing on the docs-only one.
 */
export function useAppendixPrewarm(sessionId: string | null | undefined): void {
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (cancelled) return;
      try {
        const c = await loadChart(sessionId);
        const milestone = milestoneOf(c?.chart?.status);
        if (milestone) {
          const key = `${sessionId}:${milestone}`;
          if (!prewarmedMilestones.has(key)) {
            prewarmedMilestones.add(key);
            startAppendixGeneration(sessionId).catch(() => {});
          }
          // Stop polling once the enriched chart has fired; earlier milestones
          // keep polling so the later 'draft' fire also happens if the user lingers.
          if (milestone === 'draft') return;
        }
      } catch { /* keep polling */ }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);
}
