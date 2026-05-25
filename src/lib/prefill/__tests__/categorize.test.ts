import { describe, it, expect } from 'vitest';
import { categorizeFromFilename } from '../categorize';

describe('categorizeFromFilename', () => {
  it.each([
    ['jaarrekening-2024.pdf',          'financial_statements'],
    ['Annual Report 2023.pdf',         'financial_statements'],
    ['Financial Statements.docx',      'financial_statements'],
    ['aangifte-vpb-2024.pdf',          'tax_returns'],
    ['VPB Return 2023.pdf',            'tax_returns'],
    ['corporate_tax_filing.pdf',       'tax_returns'],
    ['holding-structure.png',          'structure_chart'],
    ['Organogram.pdf',                 'structure_chart'],
    ['org-chart-2025.pdf',             'structure_chart'],
    ['ATAD2 analyse 2023.docx',        'previous_year_atad2_analysis'],
    ['previous-year-atad-memo.pdf',    'previous_year_atad2_analysis'],
    ['Master File 2024.pdf',           'master_file'],
    ['Local File NL.pdf',              'local_file'],
    ['Trial Balance Q4.xlsx',          'trial_balance'],
    ['kolommenbalans 2024.xlsx',       'trial_balance'],
    ['general ledger.xlsx',            'general_ledger'],
    ['grootboek 2024.csv',             'general_ledger'],
    ['Memo on transfer pricing.docx',  'memo'],
    ['comment letter to FTA.pdf',      'comment_letter_to_tax_return'],
    ['email_thread.eml',               'client_correspondence'],
    ['Outlook message.msg',            'client_correspondence'],
    ['correspondentie-cliënt.pdf',     'client_correspondence'],
    ['random-document.pdf',            'other'],
    ['IMG_1234.png',                   'other'],
    ['',                               'other'],
  ])('"%s" → %s', (filename, expected) => {
    expect(categorizeFromFilename(filename)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(categorizeFromFilename('JAARREKENING.PDF')).toBe('financial_statements');
  });

  it('returns first matching category when multiple patterns apply', () => {
    // "atad2-memo" matches both `memo` and `previous_year_atad2_analysis`;
    // the ATAD pattern is listed first so it wins.
    expect(categorizeFromFilename('atad2-memo.pdf')).toBe('previous_year_atad2_analysis');
  });
});
