import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow } from './types';

const LABEL = new Map(APPENDIX_SKELETON.map((r) => [r.rowId, r.legalFramework]));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Confirmed rows as a grounded block for the memo prompt. Reference is intentionally omitted. */
export function buildAppendixBlock(rows: AppendixRow[]): string {
  const lines = rows.map((r) => {
    const fw = LABEL.get(r.rowId) ?? r.rowId;
    return `- [${r.rowId}] ${esc(fw)} :: ${esc(r.decision ?? '')} :: ${esc(r.reasoning ?? '')}`;
  });
  return `<confirmed_appendix>\n${lines.join('\n')}\n</confirmed_appendix>`;
}
