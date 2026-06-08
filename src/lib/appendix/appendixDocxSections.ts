import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow, SkeletonRow } from './types';

export interface AppendixDocxRow {
  code: string;
  legalBasis: string;
  conditionTested: string;
  status: string;
  reasoning: string;
  // Legacy aliases so the current 3-column .docx template (legalFramework /
  // decision / reasoning) keeps rendering until it is updated to the new columns.
  legalFramework: string;
  decision: string;
}
export interface AppendixDocxSection { sectionId: string; sectionTitle: string; rows: AppendixDocxRow[]; }

/**
 * Group confirmed rows by section for docxtemplater. This is the clean dossier
 * version: legal basis, condition, status and the reasoning (fact + legal
 * consequence in one). Internal provenance is excluded.
 */
export function toAppendixSections(rows: AppendixRow[], skeleton: SkeletonRow[] = APPENDIX_SKELETON): AppendixDocxSection[] {
  const out: AppendixDocxSection[] = [];
  for (const sk of skeleton) {
    const r = rows.find((x) => x.rowId === sk.rowId);
    if (!r) continue;
    let s = out.find((x) => x.sectionId === sk.sectionId);
    if (!s) { s = { sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, rows: [] }; out.push(s); }
    const status = r.status ?? '';
    const reasoning = r.reasoning ?? '';
    s.rows.push({
      code: sk.rowId,
      legalBasis: sk.legalBasis,
      conditionTested: sk.conditionTested,
      status,
      reasoning,
      legalFramework: `${sk.legalBasis}. ${sk.conditionTested}`,
      decision: status,
    });
  }
  return out;
}
