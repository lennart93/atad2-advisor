-- Memo review pass: audit + status columns on atad2_reports.
--
-- report_md holds the shown/exported memo (the polished text, or the untouched
-- draft when the review was skipped/off), so everything downstream is unchanged.
-- report_md_raw keeps the pre-review draft for audit and rollback; it is set only
-- when a polish actually shipped. polish_status records the outcome.
--
-- Apply on the VM as supabase_admin (atad2_* tables are owned by supabase_admin,
-- ALTER as postgres fails with "must be owner of table"):
--   docker exec -i $(docker ps --filter name=supabase-db -q) \
--     psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20260703120000_report_review_columns.sql

ALTER TABLE public.atad2_reports
  ADD COLUMN IF NOT EXISTS report_md_raw text,
  ADD COLUMN IF NOT EXISTS polish_status text;

COMMENT ON COLUMN public.atad2_reports.report_md_raw IS
  'Pre-review draft markdown, before the Fable 5 rewrite. NULL when no polish shipped (review off, skipped, or errored).';
COMMENT ON COLUMN public.atad2_reports.polish_status IS
  'Outcome of the memo review pass: polished | skipped | error. NULL when the review pass did not run.';
