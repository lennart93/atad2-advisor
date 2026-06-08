import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow, SkeletonRow } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Confirmed rows as a grounded block for the memo prompt. Reference is intentionally omitted. */
export function buildAppendixBlock(rows: AppendixRow[], skeleton: SkeletonRow[] = APPENDIX_SKELETON): string {
  const label = new Map(skeleton.map((r) => [r.rowId, r.legalFramework]));
  const lines = rows.map((r) => {
    const fw = label.get(r.rowId) ?? r.rowId;
    return `- [${r.rowId}] ${esc(fw)} :: ${esc(r.decision ?? '')} :: ${esc(r.reasoning ?? '')}`;
  });
  return `<confirmed_appendix>\n${lines.join('\n')}\n</confirmed_appendix>`;
}
