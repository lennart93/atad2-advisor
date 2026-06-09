-- Per-page skip flags for the two appendix sub-pages (Facts / Checklist).
-- A skipped page stays generated but is left out of the memo. Additive +
-- idempotent. Apply on the VM as supabase_admin.
ALTER TABLE public.atad2_appendix
  ADD COLUMN IF NOT EXISTS facts_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_skipped boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
