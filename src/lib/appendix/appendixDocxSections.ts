import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow, SkeletonRow } from './types';

export interface AppendixDocxRow { code: string; legalFramework: string; decision: string; reasoning: string; }
export interface AppendixDocxSection { sectionId: string; sectionTitle: string; rows: AppendixDocxRow[]; }

/** Group confirmed rows by section for docxtemplater. The internal Reference is excluded. */
export function toAppendixSections(rows: AppendixRow[], skeleton: SkeletonRow[] = APPENDIX_SKELETON): AppendixDocxSection[] {
  const out: AppendixDocxSection[] = [];
  for (const sk of skeleton) {
    const r = rows.find((x) => x.rowId === sk.rowId);
    if (!r) continue;
    let s = out.find((x) => x.sectionId === sk.sectionId);
    if (!s) { s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, rows: [] }; out.push(s); }
    s.rows.push({
      code: sk.rowId,
      legalFramework: sk.legalFramework,
      decision: r.decision ?? '',
      reasoning: r.reasoning ?? '',
    });
  }
  return out;
}
