/**
 * One appendix generation per refined-chart state. The key includes the
 * chart's answers fingerprint, so a chart that is re-refined on deviating
 * answers automatically fires a fresh generation, while the same chart state
 * never fires twice. Returns null while the chart has not reached the
 * draft milestone (the docs-only phase A never fires the appendix anymore).
 */
export function appendixPrewarmKey(
  sessionId: string,
  chart: { status: string | null; answers_fingerprint: string | null } | null,
): string | null {
  const status = chart?.status;
  if (status !== 'draft_ready' && status !== 'user_edited' && status !== 'finalized') return null;
  return `${sessionId}:draft:${chart?.answers_fingerprint ?? 'legacy'}`;
}
