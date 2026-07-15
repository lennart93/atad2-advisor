import { useEffect } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startExtraction } from '@/lib/structure/extraction';
import { currentEffectiveFingerprint } from '@/lib/assessment/effectiveAnswersClient';
import { shouldFireRefine } from '@/lib/assessment/speculativeRefine';

/** Once per session+fingerprint, across all mounts of this hook. */
const firedKeys = new Set<string>();

const POLL_MS = 10_000;

/**
 * Speculative structure refine: as soon as the effective answers (suggestions
 * merged with any recorded answers) exist and the chart does not yet carry
 * their fingerprint, fire a refine pass. The appendix prewarm then follows the
 * refined chart automatically.
 *
 * The hook POLLS and only fires when two consecutive reads yield the same
 * fingerprint: firing while the prefill swarm or the factsheet re-run is still
 * mutating suggestions produced a refine + appendix run on a half-filled set
 * that was thrown away minutes later (measured 15 Jul). `debounce: false`
 * skips that stability wait; the confirmation page uses it because the
 * answers are final there by definition.
 */
export function useSpeculativeRefine(
  sessionId: string | null | undefined,
  active: boolean,
  debounce = true,
): void {
  useEffect(() => {
    if (!sessionId || !active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastFingerprint: string | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const { fingerprint, count } = await currentEffectiveFingerprint(sessionId);
        if (cancelled) return;
        const stable = !debounce || fingerprint === lastFingerprint;
        lastFingerprint = fingerprint;
        const key = `${sessionId}:${fingerprint}`;
        if (count > 0 && stable && !firedKeys.has(key)) {
          const chart = (await loadChart(sessionId))?.chart ?? null;
          if (cancelled) return;
          if (shouldFireRefine({
            chartStatus: chart?.status ?? null,
            chartFingerprint: chart?.answers_fingerprint ?? null,
            fingerprint,
          })) {
            firedKeys.add(key);
            await startExtraction(sessionId, 'refine');
          } else if (chart?.answers_fingerprint === fingerprint) {
            // Chart already carries this exact set; nothing to do for it.
            firedKeys.add(key);
          }
        }
      } catch (err) {
        // 409 = an extraction is already running; a later tick picks it up.
        if ((err as { status?: number })?.status !== 409) {
          console.warn('[useSpeculativeRefine]', err);
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, active, debounce]);
}
