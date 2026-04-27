-- Per-document relevance_note: short user explanation of why this document
-- matters for the assessment. Stage 1 prompt incorporates this hint.
-- Also extends the category CHECK constraint with two new options:
-- 'memo' and 'comment_letter_to_tax_return'.

ALTER TABLE atad2_session_documents
  ADD COLUMN IF NOT EXISTS relevance_note text;

ALTER TABLE atad2_session_documents
  DROP CONSTRAINT IF EXISTS atad2_session_documents_category_check;

ALTER TABLE atad2_session_documents
  ADD CONSTRAINT atad2_session_documents_category_check CHECK (category IN (
    'financial_statements',
    'tax_returns',
    'local_file',
    'master_file',
    'previous_year_atad2_analysis',
    'trial_balance',
    'general_ledger',
    'memo',
    'comment_letter_to_tax_return',
    'other'
  ));
