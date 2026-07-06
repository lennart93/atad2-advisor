-- Factsheet-pipeline, part 1c: widen the prefill draft-length CHECKs and add
-- the two observability/re-run columns.
--
-- WHY: the factsheet gives the swarm real cross-document facts, so drafts get
-- longer and more specific. The old 1000/200 caps knife-edge good output.
--   * suggested_toelichting          1000 -> 4000
--   * suggested_toelichting_unknown  1000 -> 4000
--   * answer_rationale                200 ->  300
--   * client_question stays 450 (unchanged; the letter must stay short).
--
-- COUPLED CHANGES in the SAME PR (see spec section 3.3):
--   * src/lib/openQuestions/worklist.ts  clampToelichting/clampRationale
--   * supabase/functions/prefill-documents/analyze.ts  truncate(...) limits
-- The DB CHECK is the backstop; those two clamps must stay <= these numbers.
--
-- New columns:
--   * factsheet_version int  — which atad2_session_factsheet.version this draft
--     used (null = drafted before any factsheet existed). Drives re-run
--     selection + observability.
--   * evidence jsonb — array of {doc_label, loc, quote} the swarm cites for a
--     negative/positive, carried from the factsheet sources.
--
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.
-- Re-runnable: DROP CONSTRAINT IF EXISTS + ADD, ADD COLUMN IF NOT EXISTS.

-- --- 1) Widen the three length CHECKs. The constraint names are the Postgres
-- auto-generated ones (<table>_<column>_check), confirmed against analyze.ts
-- which references atad2_question_prefills_answer_rationale_check by name.
alter table public.atad2_question_prefills
  drop constraint if exists atad2_question_prefills_suggested_toelichting_check;
alter table public.atad2_question_prefills
  add constraint atad2_question_prefills_suggested_toelichting_check
  check (length(suggested_toelichting) <= 4000);

alter table public.atad2_question_prefills
  drop constraint if exists atad2_question_prefills_suggested_toelichting_unknown_check;
alter table public.atad2_question_prefills
  add constraint atad2_question_prefills_suggested_toelichting_unknown_check
  check (suggested_toelichting_unknown is null or length(suggested_toelichting_unknown) <= 4000);

alter table public.atad2_question_prefills
  drop constraint if exists atad2_question_prefills_answer_rationale_check;
alter table public.atad2_question_prefills
  add constraint atad2_question_prefills_answer_rationale_check
  check (answer_rationale is null or length(answer_rationale) <= 300);

-- --- 2) Re-run / observability columns.
alter table public.atad2_question_prefills
  add column if not exists factsheet_version int;
alter table public.atad2_question_prefills
  add column if not exists evidence jsonb;

-- NOTE: the trigger sync_open_questions_from_prefill (see
-- 20260610220000_prefill_client_question_column.sql) only reads
-- suggested_answer, confidence_pct, contextual_hint and client_question in its
-- early-return guard and only writes those into the register. It does NOT
-- reference factsheet_version or evidence, so an UPDATE touching only these two
-- new columns still early-returns and never churns the open-questions register.
-- No trigger change is required.

notify pgrst, 'reload schema';
