-- M4 of the dossier foundation (slice 3, shipped dark):
-- report columns + total_risk numeric + RLS hardening + assessment_log extension.
--
-- Design: docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md
-- (section 2 "Wat wordt opgeslagen" and section 5 "Beveiligingsaanscherping").
--
-- What this does and why:
--   1. atad2_reports grows the two-kind report model: report_kind
--      ('interim'|'final', default 'final' so every historical row and every
--      n8n-inserted row classifies as a final memo, which is what they are).
--      The report row doubles as the generation job (the appendix house
--      pattern: no separate jobs table, no second realtime channel), hence
--      generation_status ('generating'|'ready'|'error', default 'ready' so
--      existing rows read as done) and error_message. Section-wise updating
--      gets its lineage columns (parent_report_id, regenerated_sections,
--      prompt_version) and interim reports get open_questions, a frozen jsonb
--      snapshot of the open-questions register at generation time.
--   2. total_risk becomes numeric: risk sums are fractional in the dossier
--      model; integer silently truncated them.
--   3. RLS hardening (closes the gate hole): the INSERT policy
--      "Service role can insert reports" was created in 20250814181123 with
--      WITH CHECK (true) and NO role restriction, so any logged-in user could
--      insert a row indistinguishable from a gated final memo. It is replaced
--      by a service_role-only variant. The user DELETE policy
--      "Users can delete their own reports" is dropped: archiving replaces
--      deletion (audit trail survives). The admin DELETE policy
--      ("Admins can delete all reports") intentionally stays.
--   4. archive_report(p_report_id) SECURITY DEFINER RPC: atad2_reports has
--      deliberately NO user UPDATE policy (a direct UPDATE grant would also
--      let users rewrite report_md of a delivered memo), so the owner-facing
--      Archive button in ReportDetail.tsx calls this RPC instead. It checks
--      ownership inside (modeled on admin_reset_session) and stamps
--      archived_at = now(), archived_by = auth.uid() server-side.
--   5. atad2_assessment_log.event_type CHECK gains 'interim_generated' and
--      'final_generated'. The report engine writes those events in a later
--      slice; rewiring the 'completed' event to "first ready final memo"
--      happens there too. This migration only widens the constraint so the
--      engine slice needs no DDL.
--
-- Dark delivery: nothing user-visible changes. New columns keep their
-- defaults until the report engine slice; the only behavior change is that
-- raw authenticated inserts/deletes on atad2_reports now fail, which no
-- legitimate code path performs (the only inserter is the n8n-report edge
-- function using SUPABASE_SERVICE_ROLE_KEY; the only user-facing delete was
-- ReportDetail.tsx, converted to Archive in the same slice).
--
-- DEPLOY ORDER (matters for the delete): with the DELETE policy gone, the
-- OLD Delete button's request matches zero rows and PostgREST reports
-- success, so the old UI would show "Report deleted" while the report
-- survives. Ship the ReportDetail.tsx Archive rider in the same frontend
-- deploy as this migration; do not leave a gap.
--
-- Safe to re-run: every statement is guarded (IF NOT EXISTS / DROP IF EXISTS /
-- conditional DO blocks). PIM windows expire mid-run; recovery is to run the
-- whole file again.
-- Runs as supabase_admin (table owner) via az vm run-command + psql.

------------------------------------------------------------------------------
-- 1. New report columns
------------------------------------------------------------------------------

ALTER TABLE public.atad2_reports
  -- Two report kinds out of one engine. Default 'final': history + n8n rows.
  ADD COLUMN IF NOT EXISTS report_kind text NOT NULL DEFAULT 'final'
    CONSTRAINT atad2_reports_report_kind_check
    CHECK (report_kind IN ('interim', 'final')),
  -- The report row IS the generation job. Default 'ready': existing rows are done.
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'ready'
    CONSTRAINT atad2_reports_generation_status_check
    CHECK (generation_status IN ('generating', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS error_message text,
  -- Which prompt version produced this report (audit / regression tracing).
  ADD COLUMN IF NOT EXISTS prompt_version text,
  -- Section-wise update lineage: an updated memo is a NEW row pointing at its
  -- archived parent, listing which sections were regenerated.
  ADD COLUMN IF NOT EXISTS parent_report_id uuid
    REFERENCES public.atad2_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS regenerated_sections text[],
  -- Interim reports freeze the open-questions register at generation time so
  -- the "Information requested from client" section can never drift.
  ADD COLUMN IF NOT EXISTS open_questions jsonb;

------------------------------------------------------------------------------
-- 2. total_risk integer -> numeric (risk sums are fractional)
------------------------------------------------------------------------------

-- LOCK NOTE: the type change takes an ACCESS EXCLUSIVE lock and rewrites the
-- whole table (int -> numeric is not binary-coercible). atad2_reports is
-- tiny (one row per generated memo plus archived copies), so this is
-- sub-second. Guarded: a re-run sees numeric and skips entirely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atad2_reports'
      AND column_name = 'total_risk'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.atad2_reports
      ALTER COLUMN total_risk TYPE numeric USING total_risk::numeric;
  END IF;
END $$;

------------------------------------------------------------------------------
-- 3. RLS hardening
------------------------------------------------------------------------------

-- 3a. INSERT becomes service_role-only. The old policy (20250814181123) was
--     WITH CHECK (true) with no TO clause, i.e. it applied to ALL roles and
--     let any authenticated user insert arbitrary report rows.
DROP POLICY IF EXISTS "Service role can insert reports" ON public.atad2_reports;
CREATE POLICY "Service role can insert reports"
  ON public.atad2_reports
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3b. Users can no longer DELETE reports; archive_report() replaces it.
--     "Admins can delete all reports" (has_role admin) is kept on purpose.
DROP POLICY IF EXISTS "Users can delete their own reports" ON public.atad2_reports;

-- Self-test (manual, documents why an authenticated insert now fails):
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   INSERT INTO public.atad2_reports (session_id, report_md)
--     VALUES ('<any existing session_id>', 'forged');
--   -- expected: ERROR 42501 new row violates row-level security policy
--   -- (no INSERT policy applies to the authenticated role anymore)
--   ROLLBACK;

------------------------------------------------------------------------------
-- 4. archive_report(): owner-facing soft archive via guarded RPC
------------------------------------------------------------------------------

-- There is intentionally NO user UPDATE policy on atad2_reports: granting one
-- would let users rewrite report_md of a delivered memo. Archiving is the only
-- mutation owners need, so it goes through this SECURITY DEFINER function,
-- modeled on admin_reset_session (ownership check inside, audit log, jsonb
-- result). Idempotent: archiving an already-archived report is a no-op that
-- keeps the original archived_at/archived_by.
CREATE OR REPLACE FUNCTION public.archive_report(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_owner UUID;
  v_archived_at TIMESTAMPTZ;
  v_archived_by UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'archive_report: not authenticated'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id, archived_at, archived_by
    INTO v_owner, v_archived_at, v_archived_by
  FROM public.atad2_reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive_report: report % not found', p_report_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_owner IS DISTINCT FROM v_caller
     AND NOT public.has_admin_access(v_caller) THEN
    RAISE EXCEPTION 'archive_report: caller does not own report %', p_report_id
      USING ERRCODE = '42501';
  END IF;

  IF v_archived_at IS NULL THEN
    UPDATE public.atad2_reports
    SET archived_at = NOW(),
        archived_by = v_caller
    WHERE id = p_report_id;

    v_archived_at := NOW();
    v_archived_by := v_caller;

    INSERT INTO public.audit_logs (action, table_name, record_id, user_id, new_values)
    VALUES (
      'report_archived',
      'atad2_reports',
      p_report_id::text,
      v_caller,
      jsonb_build_object('report_id', p_report_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'report_id', p_report_id,
    'archived_at', v_archived_at,
    'archived_by', v_archived_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.archive_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_report(UUID) TO authenticated;

------------------------------------------------------------------------------
-- 5. assessment_log: widen the event_type CHECK
------------------------------------------------------------------------------

-- The constraint was created inline in 20260601240000, so its name should be
-- the Postgres default (atad2_assessment_log_event_type_check). Drop by
-- catalog lookup instead of by name so a deviating name on the VM cannot
-- strand a duplicate or fail the re-run. The drop loop AND the re-add live
-- in ONE DO block (= one transaction): either the old constraint survives
-- or the widened one lands, never a window where event_type is unchecked.
DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.atad2_assessment_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.atad2_assessment_log DROP CONSTRAINT %I',
      v_con.conname
    );
  END LOOP;

  EXECUTE $ddl$
    ALTER TABLE public.atad2_assessment_log
      ADD CONSTRAINT atad2_assessment_log_event_type_check
      CHECK (event_type IN (
        'created', 'completed', 'deleted', 'backfill',
        'interim_generated', 'final_generated'
      ))
  $ddl$;
END $$;

------------------------------------------------------------------------------
-- 6. Verification: fail loudly if anything above did not land
------------------------------------------------------------------------------

DO $$
DECLARE
  v_roles name[];
  v_insert_policies int;
  v_columns int;
BEGIN
  -- 6a. Exactly one INSERT policy on atad2_reports, restricted to service_role.
  SELECT count(*) INTO v_insert_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'atad2_reports'
    AND cmd = 'INSERT';

  IF v_insert_policies <> 1 THEN
    RAISE EXCEPTION 'M4 verification: expected exactly 1 INSERT policy on atad2_reports, found %',
      v_insert_policies;
  END IF;

  SELECT roles INTO v_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'atad2_reports'
    AND policyname = 'Service role can insert reports'
    AND cmd = 'INSERT';

  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'M4 verification: INSERT policy "Service role can insert reports" is missing on atad2_reports';
  END IF;

  IF v_roles <> ARRAY['service_role']::name[] THEN
    RAISE EXCEPTION 'M4 verification: INSERT policy on atad2_reports applies to roles %, expected {service_role}. An authenticated insert would NOT fail.',
      v_roles;
  END IF;

  -- 6b. The user DELETE policy must be gone.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'atad2_reports'
      AND policyname = 'Users can delete their own reports'
  ) THEN
    RAISE EXCEPTION 'M4 verification: policy "Users can delete their own reports" still exists on atad2_reports';
  END IF;

  -- 6c. All seven new columns exist.
  SELECT count(*) INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'atad2_reports'
    AND column_name IN (
      'report_kind', 'generation_status', 'error_message', 'prompt_version',
      'parent_report_id', 'regenerated_sections', 'open_questions'
    );

  IF v_columns <> 7 THEN
    RAISE EXCEPTION 'M4 verification: expected 7 new columns on atad2_reports, found %', v_columns;
  END IF;

  -- 6d. total_risk is numeric.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atad2_reports'
      AND column_name = 'total_risk'
      AND data_type = 'numeric'
  ) THEN
    RAISE EXCEPTION 'M4 verification: atad2_reports.total_risk is not numeric';
  END IF;

  -- 6e. The widened event_type CHECK is in place.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.atad2_assessment_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%interim_generated%'
      AND pg_get_constraintdef(oid) LIKE '%final_generated%'
  ) THEN
    RAISE EXCEPTION 'M4 verification: atad2_assessment_log event_type CHECK was not widened';
  END IF;

  -- 6f. The archive RPC exists.
  IF to_regprocedure('public.archive_report(uuid)') IS NULL THEN
    RAISE EXCEPTION 'M4 verification: function public.archive_report(uuid) is missing';
  END IF;

  RAISE NOTICE 'M4 verification passed: report columns, numeric total_risk, service_role-only INSERT, no user DELETE, archive_report(), widened assessment_log CHECK.';
END $$;
