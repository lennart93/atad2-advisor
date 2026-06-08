import { APPENDIX_SKELETON } from './skeleton';
import { buildClientSections } from './clientExport';
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
 * consequence in one). Internal provenance is excluded, advisor-excluded rows are
 * dropped, and the survivors are renumbered contiguously.
 */
export function toAppendixSections(rows: AppendixRow[], skeleton: SkeletonRow[] = APPENDIX_SKELETON): AppendixDocxSection[] {
  return buildClientSections(rows, skeleton).map((cs) => ({
    sectionId: String(cs.displayNum),
    sectionTitle: cs.sectionTitle,
    rows: cs.rows.map((cr) => {
      const status = cr.row.status ?? '';
      const reasoning = cr.row.reasoning ?? '';
      return {
        code: cr.displayCode,
        legalBasis: cr.sk.legalBasis,
        conditionTested: cr.sk.conditionTested,
        status,
        reasoning,
        legalFramework: `${cr.sk.legalBasis}. ${cr.sk.conditionTested}`,
        decision: status,
      };
    }),
  }));
}
