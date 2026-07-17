// Hard rule 0.1 (sync guard): a memo must never be built from an appendix that is
// not ready and confirmed.
//
// Appendix 1 (facts) is derived from the structure chart; Appendix 2 (conditions)
// from the recorded answers. Before a memo is generated, the appendix must be
// ready and confirmed, and no Appendix-2 condition may be stale against the
// answers it was generated from. Appendix 1 is kept in line with the structure
// chart by a silent background re-sync on the structure step (StructureChartStep),
// so structure-chart drift is NOT gated here.

import type { StoredAppendix } from './types';

export interface MemoSyncResult {
  ok: boolean;
  /** A user-facing explanation when blocked (English, no jargon). */
  reason?: string;
}

/**
 * Decide whether a memo may be generated for this session. A pure check over the
 * stored appendix: it must be present, ready, confirmed, and free of conditions
 * that went stale against the answers.
 */
export function checkAppendixSync(appendix: StoredAppendix | null): MemoSyncResult {
  if (!appendix) {
    return {
      ok: false,
      reason: 'No appendix has been generated yet. Generate and confirm the appendix before generating the memo.',
    };
  }

  // A skipped page is deliberately left out of the memo, so it cannot gate it.
  // With both pages skipped the memo carries no appendix content at all.
  const factsIncluded = !appendix.facts_skipped;
  const checklistIncluded = !appendix.checklist_skipped;
  if (!factsIncluded && !checklistIncluded) return { ok: true };

  // Until the appendix is confirmed, gate on where it is in generation. Once it is
  // confirmed it already has valid content in the DB, so a transient background
  // regeneration must NOT block the memo; genuine drift in the conditions is caught
  // by the per-row staleness check below instead.
  if (appendix.review_status !== 'confirmed') {
    if (appendix.generation_status === 'generating') {
      return {
        ok: false,
        reason: 'The appendix is still being generated. Wait until it is ready, then confirm it.',
      };
    }
    if (appendix.generation_status === 'error') {
      return {
        ok: false,
        reason: 'The appendix failed to generate. Open the appendix step to regenerate it, then confirm it.',
      };
    }
    // Confirmation happens on the checklist page. When that page is skipped there
    // is no confirm step; the memo then carries the facts page only.
    if (checklistIncluded) {
      return {
        ok: false,
        reason: 'The appendix is not confirmed yet. Review and confirm the appendix before generating the memo.',
      };
    }
  }

  // Appendix 2: any row flagged stale because a driving answer changed since it
  // was generated. Only relevant while the checklist page is in the memo.
  if (checklistIncluded) {
    const staleRows = appendix.rows.filter((r) => r.stale && !r.excludedFromClient);
    if (staleRows.length) {
      return {
        ok: false,
        reason: `Appendix 2 (conditions) is out of date with the answers: ${staleRows.length} ${staleRows.length === 1 ? 'condition needs' : 'conditions need'} review. Regenerate the appendix and confirm it again.`,
      };
    }
  }

  return { ok: true };
}
