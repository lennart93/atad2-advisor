// Pure helper to decide whether a chart row stuck in an "extracting:*" status
// is actually still alive, based on the recency of its heartbeat. Kept in its
// own file so it can be unit-tested from the Vitest side without pulling in
// any Deno-specific imports.

/** Heartbeat older than this counts as a dead pipeline. */
export const STALE_THRESHOLD_MS = 90_000;

export function isStaleExtracting(
  status: string | null | undefined,
  heartbeatAt: string | null | undefined,
  now: Date,
): boolean {
  if (!status || !status.startsWith('extracting:')) return false;
  if (!heartbeatAt) return true;
  const age = now.getTime() - new Date(heartbeatAt).getTime();
  return age >= STALE_THRESHOLD_MS;
}
