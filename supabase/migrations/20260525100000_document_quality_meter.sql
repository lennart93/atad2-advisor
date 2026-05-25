-- Quality meter additions on atad2_session_documents:
--   * is_thin BOOLEAN: set by classify-document edge function when a doc
--     is below ~200 words / has no extractable content. Thin docs don't
--     count toward the quality tier.
--   * category_source TEXT: tracks whether the current category came from
--     the client-side filename heuristic, the AI classifier, or a user
--     override. The classifier skips rows where this is 'user'.
-- Also extends the category CHECK with two new values:
--   * structure_chart — uploaded organograms / group charts
--   * client_correspondence — emails, letters, scope chats

ALTER TABLE atad2_session_documents
  ADD COLUMN IF NOT EXISTS is_thin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE atad2_session_documents
  ADD COLUMN IF NOT EXISTS category_source TEXT NOT NULL DEFAULT 'filename';

ALTER TABLE atad2_session_documents
  DROP CONSTRAINT IF EXISTS atad2_session_documents_category_source_check;

ALTER TABLE atad2_session_documents
  ADD CONSTRAINT atad2_session_documents_category_source_check
    CHECK (category_source IN ('filename', 'ai', 'user'));

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
    'structure_chart',
    'client_correspondence',
    'other'
  ));
