/**
 * Pure decision for the speculative structure refine: fire when the chart does
 * not yet carry the fingerprint of the current effective answers and no
 * extraction is running. Kept dependency-free so it is directly testable.
 */
export function shouldFireRefine(input: {
  chartStatus: string | null;
  chartFingerprint: string | null;
  fingerprint: string;
}): boolean {
  if (input.chartStatus?.startsWith('extracting')) return false;
  return input.chartFingerprint !== input.fingerprint;
}
