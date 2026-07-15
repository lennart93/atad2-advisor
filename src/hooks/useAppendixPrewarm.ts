import { useEffect } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startAppendixGeneration } from '@/lib/appendix/client';
import { appendixPrewarmKey, shouldStartAppendix } from '@/lib/appendix/prewarmKey';
import { currentEffectiveFingerprint } from '@/lib/assessment/effectiveAnswersClient';

/** Keys that already fired, shared across mounts (upload, Q&A, confirmation). */
const prewarmedKeys = new Set<string>();

/**
 * Fire the appendix/facts generation as soon as the structure chart carries a
 * refined (draft_ready or later) state the appendix has not been generated
 * for yet. The dedup key includes the chart's answers fingerprint: a chart
 * that is re-refined on deviating answers fires a fresh generation, the same
 * chart state never fires twice. The docs-only (phase A) prewarm is gone: its
 * output was never shown as definitive and only cost a duplicate set of model
 * calls while blocking the definitive run via the fresh-run guard.
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
        const chart = c?.chart ?? null;
        const key = appendixPrewarmKey(sessionId, chart ? {
          status: chart.status ?? null,
          answers_fingerprint: chart.answers_fingerprint ?? null,
        } : null);
        if (key && !prewarmedKeys.has(key)) {
          // Second gate: skip (without consuming the key) when the chart no
          // longer matches the current effective answers; the re-refine that
          // is underway produces a new key and this generation would be waste.
          const { fingerprint } = await currentEffectiveFingerprint(sessionId);
          if (shouldStartAppendix(chart?.answers_fingerprint ?? null, fingerprint)) {
            prewarmedKeys.add(key);
            startAppendixGeneration(sessionId).catch(() => {});
          }
        }
      } catch { /* keep polling */ }
      // Keep polling while mounted: a re-refine (deviating answers) produces a
      // new fingerprint and must fire again.
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);
}
