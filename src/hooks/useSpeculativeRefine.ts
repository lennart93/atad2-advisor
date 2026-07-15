import { useEffect } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startExtraction } from '@/lib/structure/extraction';
import { currentEffectiveFingerprint } from '@/lib/assessment/effectiveAnswersClient';
import { shouldFireRefine } from '@/lib/assessment/speculativeRefine';

/** Once per session+fingerprint, across all mounts of this hook. */
const firedKeys = new Set<string>();

/**
 * Speculative structure refine: as soon as the effective answers (suggestions
 * merged with any recorded answers) exist and the chart does not yet carry
 * their fingerprint, fire a refine pass. The appendix prewarm then follows the
 * refined chart automatically. Mounted on the upload page (active once the
 * factsheet pipeline is settled), the questionnaire and the confirmation page.
 */
export function useSpeculativeRefine(sessionId: string | null | undefined, active: boolean): void {
  useEffect(() => {
    if (!sessionId || !active) return;
    let cancelled = false;
    (async () => {
      try {
        const { fingerprint, count } = await currentEffectiveFingerprint(sessionId);
        if (cancelled || count === 0) return;
        const key = `${sessionId}:${fingerprint}`;
        if (firedKeys.has(key)) return;
        const chart = (await loadChart(sessionId))?.chart ?? null;
        if (cancelled) return;
        if (!shouldFireRefine({
          chartStatus: chart?.status ?? null,
          chartFingerprint: chart?.answers_fingerprint ?? null,
          fingerprint,
        })) return;
        firedKeys.add(key);
        await startExtraction(sessionId, 'refine');
      } catch (err) {
        // 409 = an extraction is already running; the self-chain or a later
        // mount picks it up. Anything else is best-effort background work.
        if ((err as { status?: number })?.status !== 409) {
          console.warn('[useSpeculativeRefine]', err);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, active]);
}
