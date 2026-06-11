import type { FactEntity } from '@/lib/appendix/types';

// The chart-derived part of the register, canonicalised. AI and advisor fields
// (nlTaxStatus, position, edits, hidden, ...) are deliberately ignored: those do
// not come from the chart, so they must not count as "the structure changed".
const baseKey = (e: FactEntity): string =>
  [
    e.id, e.chartEntityId, e.name, e.jurisdiction ?? '', e.entityType ?? '', e.role,
    e.ownershipPct ?? '', e.related, e.relatedVia ?? '', e.relatedViaPct ?? '',
    e.directLink ?? '', e.isFiscalUnity ?? '', (e.memberEntityIds ?? []).join(','),
    e.memberOfUnityId ?? '',
  ].join('|');

/**
 * True when the stored appendix register still matches the register that the
 * current structure chart produces. Both sides come from the same deterministic
 * builder (frontend mirror = Deno builder), so a mismatch means the chart data
 * changed materially after the appendix was generated. Position-only chart
 * edits do not affect the register and therefore do not count.
 */
export function registerMatchesChart(stored: FactEntity[], fromChart: FactEntity[]): boolean {
  if (stored.length !== fromChart.length) return false;
  const a = stored.map(baseKey).sort();
  const b = fromChart.map(baseKey).sort();
  return a.every((v, i) => v === b[i]);
}
