-- Prefill job heartbeat (integral dossier platform, slice 3, migration M2).
-- Spec: docs/superpowers/specs/2026-06-10-integral-dossier-platform-design.md, section 2.
--
-- WHY: the document-analysis swarm is orchestrated by the BROWSER
-- (useStartAnalyze in src/hooks/usePrefill.ts). The user's tab inserts the
-- job row, fans out one edge-function call per question, and finalizes the
-- row itself. If the tab closes mid-run, the row is stuck in
-- 'stage2_running' forever and nothing can tell "still running" apart from
-- "abandoned". heartbeat_at fixes that: the browser loop bumps it every
-- ~20 SECONDS while the swarm is alive, copying the chart-extraction
-- heartbeat (atad2_structure_charts.heartbeat_at, migration
-- 20260524120000_chart_heartbeat.sql, ticked every ~15s by the
-- extract-structure edge function).
--
-- STALENESS THRESHOLD (named design constant, spec section 2): readers treat
-- a job in a running status ('queued','stage1_running','stage2_running')
-- whose heartbeat_at is older than 2 MINUTES (or NULL, for rows created
-- before this migration) as dead. The threshold lives in the readers (the
-- atad2_dossier_blocks view in M5 and the frontend), never in DDL, and it
-- never blocks the user: a stale job only surfaces as "attention" with a
-- Resume action.
--
-- ALSO IN THIS FILE:
--   1. A session-owner UPDATE policy on atad2_prefill_jobs, created only if
--      the table has no UPDATE policy yet. The original schema
--      (20260423100000_document_prefill_schema.sql) defined SELECT + INSERT
--      policies only, yet the browser already issues UPDATEs against this
--      table (the swarm finalize step in useStartAnalyze), and the heartbeat
--      tick is another browser-side UPDATE. Without an UPDATE policy, RLS
--      silently matches 0 rows and every such write is a no-op. The DO block
--      below is tolerant of the VM having gained a policy out-of-band: if any
--      UPDATE (or ALL) policy already exists on the table, it does nothing.
--   2. A one-time repair of the legacy jobs that no-op'd finalize left frozen
--      in a running status (see section 3 below). Without this, the M5
--      status oracle would flag every existing dossier's Questions block as
--      'attention' and its Documents block could never reach 'ready'.
--
-- Dark infrastructure: no user-visible behavior change in this slice.
-- Safe to re-run (PIM windows expire mid-run; documented recovery is
-- "run it again").

------------------------------------------------------------------------------
-- 1. The heartbeat column
------------------------------------------------------------------------------

ALTER TABLE public.atad2_prefill_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

COMMENT ON COLUMN public.atad2_prefill_jobs.heartbeat_at IS
  'Last sign of life from the browser-orchestrated analysis swarm (useStartAnalyze ticks this every ~20s). Readers compare against now() with a 2-minute staleness threshold to tell a live run from an abandoned one (closed tab). NULL on rows from before this column existed.';

------------------------------------------------------------------------------
-- 2. Session-owner UPDATE policy
------------------------------------------------------------------------------

-- The browser swarm must be able to write heartbeat_at and to finalize its
-- own job row. Mirrors the existing SELECT/INSERT policies on this table
-- (session-owner pattern from 20260423100000). Guarded so a re-run, or a VM
-- that already has an UPDATE/ALL policy under any name, is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'atad2_prefill_jobs'
      AND cmd IN ('UPDATE', 'ALL')
  ) THEN
    CREATE POLICY "Users can update their prefill job"
      ON public.atad2_prefill_jobs FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.atad2_sessions
        WHERE atad2_sessions.session_id = atad2_prefill_jobs.session_id
          AND atad2_sessions.user_id = auth.uid()
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.atad2_sessions
        WHERE atad2_sessions.session_id = atad2_prefill_jobs.session_id
          AND atad2_sessions.user_id = auth.uid()
      ));
  END IF;
END
$$;

------------------------------------------------------------------------------
-- 3. One-time repair of legacy stuck jobs
------------------------------------------------------------------------------

-- Before this migration, the browser's own job-finalize UPDATE (useStartAnalyze
-- step 6) was a silent RLS no-op, so every historical analysis run left its
-- job frozen in 'stage2_running' even though the swarm finished and wrote its
-- prefill rows. Mark those jobs completed so the M5 status oracle does not
-- paint every existing dossier 'attention'. Guards keep this re-run safe and
-- away from live runs:
--   * heartbeat_at IS NULL: no new-frontend run ever ticked it (legacy row);
--   * older than 1 HOUR: no legitimate in-flight run lasts that long
--     (a full swarm is minutes), so a run happening during the apply is safe;
--   * at least one prefill row: the swarm demonstrably produced output.
-- Jobs stuck running WITHOUT any prefill rows are left alone on purpose:
-- 'attention' with a Resume action is the honest state for those, and Resume
-- is idempotent. Re-run safe: repaired rows are 'completed' and never match
-- again.
UPDATE public.atad2_prefill_jobs j
SET status = 'completed',
    stage2_finished_at = COALESCE(
      j.stage2_finished_at,
      (SELECT max(p.created_at)
       FROM public.atad2_question_prefills p
       WHERE p.session_id = j.session_id)
    )
WHERE j.status IN ('queued', 'stage1_running', 'stage2_running')
  AND j.heartbeat_at IS NULL
  AND COALESCE(j.started_at, j.created_at) < now() - interval '1 hour'
  AND EXISTS (
    SELECT 1 FROM public.atad2_question_prefills p
    WHERE p.session_id = j.session_id
  );

------------------------------------------------------------------------------
-- Verification (read-only, run any time):
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'atad2_prefill_jobs'
--   ORDER BY cmd;
--   -- expected: one INSERT and exactly one UPDATE policy; for SELECT, the
--   -- owner policy plus, after migration 20260610190500, the additional
--   -- staff SELECT policy.
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'atad2_prefill_jobs'
--     AND column_name = 'heartbeat_at';
--   -- expected: one row.
--
--   SELECT count(*) FROM public.atad2_prefill_jobs
--   WHERE status IN ('queued','stage1_running','stage2_running')
--     AND heartbeat_at IS NULL
--     AND created_at < now() - interval '1 hour';
--   -- expected: only jobs with zero prefill rows (deliberately left alone).
------------------------------------------------------------------------------
