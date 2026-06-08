import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow, SkeletonRow } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Confirmed rows as a grounded block for the memo prompt. Internal provenance is
 * intentionally omitted; only the legal basis, condition, status and the clean
 * reasoning are fed in.
 */
export function buildAppendixBlock(rows: AppendixRow[], skeleton: SkeletonRow[] = APPENDIX_SKELETON): string {
  const byId = new Map(skeleton.map((r) => [r.rowId, r]));
  const lines = rows
    .filter((r) => !r.excludedFromClient)
    .map((r) => {
      const sk = byId.get(r.rowId);
      const basis = sk ? `${sk.legalBasis} - ${sk.conditionTested}` : r.rowId;
      return `- [${r.rowId}] ${esc(basis)} :: ${esc(r.status ?? '')} :: ${esc(r.reasoning ?? '')}`;
    });
  return `<confirmed_appendix>\n${lines.join('\n')}\n</confirmed_appendix>`;
}
