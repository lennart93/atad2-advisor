-- Fix: saving an appendix edit returned HTTP 400 ("Could not save edit").
--
-- The atad2_appendix_edits.field CHECK constraint (from 20260607174300) still
-- listed the ORIGINAL field vocabulary: ('decision','reasoning','reference').
-- The appendix UI was refactored afterwards: EditableField is now
-- 'status' | 'reasoning' (src/lib/appendix/types.ts), and the exclude toggle logs
-- the synthetic field 'excludedFromClient' (src/pages/AssessmentAppendix.tsx).
-- So every status change and every exclude toggle failed the CHECK and the
-- edit-log INSERT in saveRowEdit() returned 400; only reasoning edits survived.
--
-- Widen the constraint to the current vocabulary, keeping the legacy values so
-- any pre-existing audit rows stay valid. The DO block drops the existing field
-- CHECK by whatever name it carries (the original was an unnamed inline check, so
-- Postgres named it atad2_appendix_edits_field_check, but we match by definition
-- to be safe), then re-adds the correct one.
--
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.atad2_appendix_edits'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%field%'
  loop
    execute format('alter table public.atad2_appendix_edits drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.atad2_appendix_edits
  add constraint atad2_appendix_edits_field_check
  check (field in ('status','reasoning','excludedFromClient','decision','reference'));
