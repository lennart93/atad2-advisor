import type { DocumentCategory } from './types';

// First match wins. Order matters: more specific patterns come first.
// All patterns are tested case-insensitively against the filename.
const RULES: Array<{ pattern: RegExp; category: DocumentCategory }> = [
  // ATAD-specific first — beats generic "memo"
  { pattern: /atad2?.*(analyse|analysis|memo|review)/i,                category: 'previous_year_atad2_analysis' },
  { pattern: /previous.year.atad/i,                                    category: 'previous_year_atad2_analysis' },

  // Financial statements
  { pattern: /jaarrekening/i,                                          category: 'financial_statements' },
  { pattern: /annual.report/i,                                         category: 'financial_statements' },
  { pattern: /financial.statement/i,                                   category: 'financial_statements' },

  // Tax returns
  { pattern: /aangifte/i,                                              category: 'tax_returns' },
  { pattern: /\bvpb\b/i,                                               category: 'tax_returns' },
  { pattern: /corporate.tax/i,                                         category: 'tax_returns' },
  { pattern: /tax.(return|filing)/i,                                   category: 'tax_returns' },

  // Structure
  { pattern: /(structure|organogram|org.chart|holding.chart)/i,        category: 'structure_chart' },

  // Transfer pricing
  { pattern: /master.file/i,                                           category: 'master_file' },
  { pattern: /local.file/i,                                            category: 'local_file' },

  // Bookkeeping
  { pattern: /(trial.balance|kolommenbalans)/i,                        category: 'trial_balance' },
  { pattern: /(general.ledger|grootboek)/i,                            category: 'general_ledger' },

  // Memo / correspondence
  { pattern: /comment.letter/i,                                        category: 'comment_letter_to_tax_return' },
  { pattern: /(memo|memorandum)/i,                                     category: 'memo' },
  { pattern: /(email|correspondence|correspondentie)/i,                category: 'client_correspondence' },
  { pattern: /\.(eml|msg)$/i,                                          category: 'client_correspondence' },
];

export function categorizeFromFilename(filename: string): DocumentCategory {
  if (!filename) return 'other';
  for (const { pattern, category } of RULES) {
    if (pattern.test(filename)) return category;
  }
  return 'other';
}
