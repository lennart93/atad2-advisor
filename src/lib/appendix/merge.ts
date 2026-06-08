import type { AppendixRow, SkeletonRow } from './types';
import { APPENDIX_SKELETON } from './skeleton';

/**
 * Regeneration rule: ai-source rows take the fresh AI values; edited rows keep their
 * current value but get the fresh AI values copied into the ai* shadow so drift is visible.
 */
export function mergeOnRegenerate(existing: AppendixRow[], fresh: AppendixRow[]): AppendixRow[] {
  const existingById = new Map(existing.map((r) => [r.rowId, r]));
  return fresh.map((f) => {
    const prev = existingById.get(f.rowId);
    if (!prev || prev.source === 'ai') {
      return { ...f, source: 'ai' as const };
    }
    // edited row: keep current value, refresh ai shadow
    return {
      ...prev,
      aiStatus: f.aiStatus,
      aiConsequence: f.aiConsequence,
      aiFactualBasis: f.aiFactualBasis,
      aiProvenance: f.aiProvenance,
    };
  });
}

/**
 * Mark rows stale when any of their driving questions appears in changedQuestionIds.
 * Never clears an already-stale flag.
 */
export function computeStaleRows(
  rows: AppendixRow[],
  changedQuestionIds: string[],
  skeleton: SkeletonRow[] = APPENDIX_SKELETON,
): AppendixRow[] {
  const driverMap = new Map(skeleton.map((r) => [r.rowId, r.drivenByQuestionIds]));
  const changed = new Set(changedQuestionIds);
  return rows.map((r) => {
    if (r.stale) return r;
    const drivers = driverMap.get(r.rowId) ?? [];
    const hit = drivers.filter((q) => changed.has(q));
    if (hit.length === 0) return r;
    return { ...r, stale: true, staleReason: `Answer(s) ${hit.join(', ')} changed since this row was generated.` };
  });
}
