import type { FactEntity } from '@/lib/appendix/types';

// The chart-derived part of the register, canonicalised. AI and advisor fields
// (nlTaxStatus, position, edits, hidden, ...) are deliberately ignored: those do
// not come from the chart, so they must not count as "the structure changed".
//
// `related` is ignored for the same reason. The chart builder seeds it, but the
// facts step refines it: an entity the documents place in the taxpayer's fiscal
// unity is stored with related=false (it is part of the taxpayer, not a separate
// related party), while a pure chart rebuild re-derives related=true. Comparing it
// would mark every such appendix out of date forever, with no real chart change. It
// also adds no signal: for chart data, related is fully determined by role +
// ownershipPct (>25%) + relatedVia, all of which ARE compared, so any genuine
// structural change that flips relatedness already shows up in those fields.
const baseKey = (e: FactEntity): string =>
  [
    e.id, e.chartEntityId, e.name, e.jurisdiction ?? '', e.entityType ?? '', e.role,
    e.ownershipPct ?? '', e.relatedVia ?? '', e.relatedViaPct ?? '',
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
