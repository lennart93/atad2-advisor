import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow } from './types';

export interface AppendixDocxRow { code: string; legalFramework: string; decision: string; reasoning: string; }
export interface AppendixDocxSection { sectionId: string; sectionTitle: string; rows: AppendixDocxRow[]; }

const META = new Map(APPENDIX_SKELETON.map((r) => [r.rowId, r]));

/** Group confirmed rows by section for docxtemplater. The internal Reference is excluded. */
export function toAppendixSections(rows: AppendixRow[]): AppendixDocxSection[] {
  const out: AppendixDocxSection[] = [];
  for (const sk of APPENDIX_SKELETON) {
    const r = rows.find((x) => x.rowId === sk.rowId);
    if (!r) continue;
    let s = out.find((x) => x.sectionId === sk.sectionId);
    if (!s) { s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, rows: [] }; out.push(s); }
    s.rows.push({
      code: sk.rowId,
      legalFramework: META.get(sk.rowId)!.legalFramework,
      decision: r.decision ?? '',
      reasoning: r.reasoning ?? '',
    });
  }
  return out;
}
