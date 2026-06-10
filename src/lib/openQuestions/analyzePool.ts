/**
 * Shared worker pool for targeted analyze_one fan-outs ("Re-check with AI",
 * "Prepare client questions"). A handful of analyze_one calls is far cheaper
 * than the full swarm, and the per-call payload is identical, so the
 * full-swarm CPU ceiling (12) does not apply. Fixed at the PDF-safe cap.
 */
export const ANALYZE_POOL_CONCURRENCY = 4;

/**
 * Drains `entries` through at most `concurrency` parallel workers.
 *
 * work() is expected to catch its own errors and collect failures in the
 * caller's closure. If a call still rejects, only that worker stops; the
 * remaining workers keep draining the queue and the pool itself never
 * rejects (Promise.allSettled).
 */
export async function runAnalyzePool<T>(
  entries: T[],
  work: (entry: T) => Promise<void>,
  concurrency = ANALYZE_POOL_CONCURRENCY,
): Promise<void> {
  const queue = [...entries];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) await work(next);
        }
      })(),
    );
  }
  await Promise.allSettled(workers);
}
