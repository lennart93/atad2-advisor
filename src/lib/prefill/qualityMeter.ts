import type { DocumentCategory, SessionDocument } from './types';

export type QualityTier = 'empty' | 'good' | 'strong' | 'excellent';

export interface QualityResult {
  tier: QualityTier;
  segments: 0 | 2 | 3 | 4;
  distinctCategories: DocumentCategory[];
  hint: string;
  missingTypes: DocumentCategory[];
}

// Categories we actively suggest the user add (ordered by perceived value).
// 'other' is never suggested; bookkeeping categories are not surfaced as
// suggestions because they're rarely what tips a borderline analysis.
const SUGGESTED_TYPES: DocumentCategory[] = [
  'financial_statements',
  'tax_returns',
  'structure_chart',
  'previous_year_atad2_analysis',
  'client_correspondence',
  'master_file',
  'local_file',
];

const LABELS: Record<DocumentCategory, string> = {
  financial_statements: 'financial statements',
  tax_returns: 'a corporate tax return',
  structure_chart: 'a structure chart',
  previous_year_atad2_analysis: 'a prior ATAD2 analysis',
  client_correspondence: 'client correspondence',
  master_file: 'a master file',
  local_file: 'a local file',
  trial_balance: 'a trial balance',
  general_ledger: 'a general ledger',
  memo: 'an internal memo',
  comment_letter_to_tax_return: 'a comment letter',
  other: 'a document',
};

export function computeQuality(docs: SessionDocument[]): QualityResult {
  const qualifying = docs.filter(
    (d) => d.category !== 'other' && !d.is_thin
  );
  const distinct = Array.from(new Set(qualifying.map((d) => d.category))) as DocumentCategory[];
  const missingTypes = SUGGESTED_TYPES.filter((t) => !distinct.includes(t));

  if (distinct.length === 0) {
    return {
      tier: 'empty',
      segments: 0,
      distinctCategories: distinct,
      hint: 'Add a document to start.',
      missingTypes,
    };
  }
  if (distinct.length === 1) {
    const next = missingTypes.slice(0, 1).map((t) => LABELS[t]).join('');
    return {
      tier: 'good',
      segments: 2,
      distinctCategories: distinct,
      hint: next
        ? `Good start — add another type (${next}) for more context.`
        : 'Good start — add another type for more context.',
      missingTypes,
    };
  }
  if (distinct.length === 2) {
    const next = missingTypes.slice(0, 1).map((t) => LABELS[t]).join('');
    return {
      tier: 'strong',
      segments: 3,
      distinctCategories: distinct,
      hint: next
        ? `Strong — one more type (${next}) would round it out.`
        : 'Strong — one more type would round it out.',
      missingTypes,
    };
  }
  return {
    tier: 'excellent',
    segments: 4,
    distinctCategories: distinct,
    hint: 'Excellent — comprehensive set of documents.',
    missingTypes,
  };
}
