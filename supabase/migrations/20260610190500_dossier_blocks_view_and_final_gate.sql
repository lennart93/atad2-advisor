-- Dossier foundation M5 (slice 3, last migration of the set): the status
-- oracle + the final-memo gate. Ships dark: no user-visible behavior change.
--
--   1. View public.atad2_dossier_blocks (security_invoker): one row per
--      session with the five derived block statuses (documents / questions /
--      structure / appendix / report) in the shared six-status vocabulary
--      (empty | generating | in_progress | attention | ready | confirmed),
--      plus the raw facts the hub, the client list and the admin screens
--      will read. This view REPLACES the previously planned
--      atad2_session_summaries: there is exactly one status oracle.
--   2. Function public.final_report_gate(p_session_id): the single gate that
--      every writer (the UI, the future generate-report edge function, and
--      the existing n8n report route during the transition) calls before a
--      FINAL memorandum may be generated. Interim reports are never gated.
--   3. Staff SELECT policies on atad2_question_prefills, atad2_prefill_jobs
--      and atad2_structure_charts (verified owner-only until now), so admin
--      screens see truthful statuses through the view.
--
-- !!!! REPO HYGIENE WARNING, READ BEFORE LINTING OR REPLAYING LOCALLY !!!!
-- ----------------------------------------------------------------------------
-- This migration references public.atad2_appendix. That table EXISTS ON THE
-- VM (applied there on 2026-06-07) but its CREATE TABLE migration
-- (20260607174300_appendix_tables.sql) lives on the feat/technical-appendix
-- branch, NOT in this checkout. Consequences:
--   * This file applies cleanly on the VM, but it CANNOT be validated against
--     this repo's migration set alone: a fresh database built from only this
--     branch's migrations fails here with
--     'relation "public.atad2_appendix" does not exist'.
--   * Columns relied on (SUBSET; the VM table meanwhile has more columns,
--     e.g. facts / facts_skipped / checklist_skipped / facts_input_hash from
--     later branch migrations), verified against the branch on 2026-06-10:
--       atad2_appendix.id                uuid PK
--       atad2_appendix.session_id        text, unique per session
--       atad2_appendix.generation_status text in ('generating','ready','error')
--       atad2_appendix.review_status     text in ('draft','confirmed')
--       atad2_appendix.updated_at        timestamptz
--   * This warning becomes obsolete when feat/technical-appendix merges.
-- ----------------------------------------------------------------------------
--
-- Depends on earlier migrations of this slice (apply M1..M4 first):
--   M1: atad2_answers.unknown_confirmed_at + updated_at
--   M2: atad2_prefill_jobs.heartbeat_at
--   M4: atad2_reports.report_kind + generation_status
--   (archived_at/archived_by already exist since 20260603130000)
-- If M1-M4 have not run, CREATE VIEW fails atomically on the missing columns
-- (views DO validate column references) and only section 1 below (the staff
-- policies, idempotent and harmless) lands; apply M1-M4, then re-run this
-- whole file.
--
-- Re-run contract: the view is DROP IF EXISTS + CREATE (not CREATE OR
-- REPLACE). Future migrations must not create objects that depend on
-- atad2_dossier_blocks without also owning its recreation, or this file
-- stops being re-runnable.
--
-- Tuning constants (estimates; revisit after the first real dossiers):
--   HEARTBEAT_STALE_MINUTES  = 2   -> interval '2 minutes' below. A "running"
--       prefill job or an "extracting:*" chart whose pulse is older than this
--       derives to 'attention' (stalled; Resume is already idempotent).
--   GENERATION_FRESH_MINUTES = 10  -> interval '10 minutes' below. A report
--       or appendix row stuck in 'generating' longer than this derives to
--       'attention' (the generation task died).
-- The confidence >= 60 reopen threshold lives in M3, not here.
--
-- Known staff-visibility limits of the security_invoker view (accepted for
-- this dark slice; spec scopes M5's policies to prefills/jobs/charts only):
--   * atad2_session_documents has NO staff SELECT policy, so staff see
--     docs_count = 0 / documents_status 'empty' for sessions they do not own.
--   * atad2_appendix's staff policy (on the branch) uses has_role('admin'),
--     so moderators see the appendix block as 'empty' for foreign sessions.
--
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.
-- Safe to re-run end to end: DROP IF EXISTS / CREATE OR REPLACE throughout
-- (PIM windows expire mid-run; recovery is "run it again").
-- Requires Postgres 15+ (security_invoker view option).

-- ============================================================================
-- 0) Preflight: fail loudly on PostgreSQL < 15 (security_invoker views
--    require Postgres 15+; see header).
-- ============================================================================

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'This migration requires PostgreSQL 15+ (security_invoker views); server reports %', current_setting('server_version');
  END IF;
END $$;

-- ============================================================================
-- 1) Staff SELECT policies (mirror "Staff can view all answers" from
--    20260422_admin_light_access.sql). Owner SELECT policies stay in place.
-- ============================================================================

DROP POLICY IF EXISTS "Staff can view all question prefills" ON public.atad2_question_prefills;
CREATE POLICY "Staff can view all question prefills"
ON public.atad2_question_prefills
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_question_prefills.session_id AND s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Staff can view all prefill jobs" ON public.atad2_prefill_jobs;
CREATE POLICY "Staff can view all prefill jobs"
ON public.atad2_prefill_jobs
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_prefill_jobs.session_id AND s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Staff can view all structure charts" ON public.atad2_structure_charts;
CREATE POLICY "Staff can view all structure charts"
ON public.atad2_structure_charts
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  )
);

-- ============================================================================
-- 2) The status oracle: atad2_dossier_blocks
--    security_invoker: callers only see sessions their own RLS allows.
--    All six-status derivation rules live HERE and nowhere else; the UI maps
--    labels but never invents a seventh status. There is no TypeScript mirror
--    of these rules (the one documented exception: per-section memo staleness
--    is computed client-side in sectionDependencies.ts; this view only
--    supplies the coarse inputs_changed_after_final flag).
-- ============================================================================

DROP VIEW IF EXISTS public.atad2_dossier_blocks;

CREATE VIEW public.atad2_dossier_blocks
WITH (security_invoker = true)
AS
SELECT
  s.session_id,

  -- ----- Block: Documents ---------------------------------------------------
  -- Never gates the memo: a dossier answered from advisor knowledge is
  -- legitimate. ready = the last COMPLETED analysis started at or after the
  -- newest upload (so it covered every document on file).
  -- LOAD-BEARING: this relies on the M2 frontend rider re-claiming the job
  -- row on re-analysis (started_at = now() when the insert hits the
  -- duplicate), otherwise started_at stays frozen at the first run and the
  -- block can never reach 'ready' again after a later upload.
  CASE
    WHEN COALESCE(docs.docs_count, 0) = 0 THEN 'empty'
    WHEN j.status = 'completed'
         AND COALESCE(j.started_at, j.created_at) >= docs.last_doc_at THEN 'ready'
    ELSE 'in_progress'
  END AS documents_status,

  -- ----- Block: Questions ---------------------------------------------------
  -- The outcome confirmation deliberately does NOT belong to this block (it
  -- belongs to Report), otherwise the Questions card could never be finished
  -- without visiting another page.
  CASE
    -- AI works right now: running job with a fresh pulse.
    -- HEARTBEAT_STALE_MINUTES = 2. heartbeat_at (M2) is ticked by the browser
    -- swarm loop every ~20s; started_at/created_at are the grace fallback for
    -- a job too young to have ticked yet.
    WHEN j.status IN ('queued', 'stage1_running', 'stage2_running')
         AND COALESCE(j.heartbeat_at, j.started_at, j.created_at)
             > now() - interval '2 minutes' THEN 'generating'
    -- The advisor finished the questionnaire: swarm history (including a
    -- dead historic job) no longer matters. completed = true guarantees an
    -- answer row for every asked question (the gate predicate is path-free
    -- and answer-based). These branches sit ABOVE the stale-running
    -- attention branch on purpose: a finished questionnaire must never be
    -- painted red by an abandoned legacy job (M2 also repairs those).
    WHEN COALESCE(s.completed, false)
         AND COALESCE(ans.answers_count, 0) > 0
         AND COALESCE(ans.open_unknown_count, 0) = 0 THEN 'confirmed'
    WHEN COALESCE(s.completed, false)
         AND COALESCE(ans.answers_count, 0) > 0 THEN 'in_progress' -- unconfirmed Unknowns remain
    -- Still "running" on paper but the pulse went silent: stalled.
    -- Surfaces as attention with a Resume action (resuming is idempotent).
    WHEN j.status IN ('queued', 'stage1_running', 'stage2_running') THEN 'attention'
    WHEN j.status = 'failed' THEN 'attention'
    -- Partially failed swarm, derived from counts: the job claims completed
    -- but produced fewer prefill rows than there are distinct questions.
    WHEN j.status = 'completed'
         AND COALESCE(pf.prefill_count, 0) < qt.questions_total THEN 'attention'
    WHEN COALESCE(ans.answers_count, 0) = 0
         AND COALESCE(pf.prefill_count, 0) = 0
         AND (j.id IS NULL OR j.status = 'cancelled') THEN 'empty'
    ELSE 'in_progress'
  END AS questions_status,

  -- ----- Block: Structure ---------------------------------------------------
  -- Pure mapping of the existing chart status machine. The edge function's
  -- own restart logic uses 90s; for dossier display we use the shared
  -- HEARTBEAT_STALE_MINUTES = 2 so all blocks judge staleness the same way.
  CASE
    WHEN c.id IS NULL THEN 'empty'
    WHEN c.status LIKE 'extracting:%'
         AND COALESCE(c.heartbeat_at, c.updated_at)
             > now() - interval '2 minutes' THEN 'generating'
    WHEN c.status LIKE 'extracting:%' THEN 'attention' -- stale extraction
    -- 'extraction_failed' is the real failure value in the chart state
    -- machine (src/lib/structure/types.ts ChartStatus); 'failed'/'stale'
    -- are kept only as harmless forward-compat. Staleness itself is never
    -- a stored status (it is derived from heartbeat_at, handled above).
    WHEN c.status IN ('extraction_failed', 'failed', 'stale') THEN 'attention'
    WHEN c.status = 'finalized' THEN 'confirmed'
    -- phase_a_ready (waiting for the frontend to auto-trigger Phase B),
    -- draft_ready and user_edited all derive to 'in_progress' on purpose.
    ELSE 'in_progress'
  END AS structure_status,

  -- ----- Block: Technical appendix -------------------------------------------
  -- Mapping of the two-axis house pattern (generation_status + review_status).
  -- confirmed = review_status 'confirmed'. There is deliberately NO whole-
  -- appendix 'skipped' review status; per-page Skip followed by Confirm is
  -- the escape hatch. GENERATION_FRESH_MINUTES = 10 (no heartbeat column on
  -- the appendix; updated_at is touched per generated section).
  CASE
    WHEN ap.id IS NULL THEN 'empty'
    WHEN ap.generation_status = 'generating'
         AND ap.updated_at > now() - interval '10 minutes' THEN 'generating'
    WHEN ap.generation_status = 'generating' THEN 'attention' -- generation died
    WHEN ap.generation_status = 'error' THEN 'attention'
    WHEN ap.review_status = 'confirmed' THEN 'confirmed'
    ELSE 'ready' -- generated, waiting for the advisor's sign-off
  END AS appendix_status,

  -- ----- Block: Report --------------------------------------------------------
  -- The report row doubles as the generation task (M4). 'Needs update' is a
  -- LABEL the UI shows when report_status = 'ready' AND
  -- inputs_changed_after_final; it is not a seventh status.
  -- GENERATION_FRESH_MINUTES = 10.
  CASE
    WHEN rlatest.generation_status IS NULL THEN 'empty'
    WHEN rlatest.generation_status = 'generating'
         AND rlatest.updated_at > now() - interval '10 minutes' THEN 'generating'
    WHEN rlatest.generation_status = 'generating' THEN 'attention' -- generation died
    WHEN rlatest.generation_status = 'error' THEN 'attention'
    WHEN rep.has_final_report THEN 'ready'          -- a current final memo exists
    WHEN rep.has_interim_report THEN 'in_progress'  -- only an interim snapshot
    ELSE 'empty'
  END AS report_status,

  -- ----- Raw facts -----------------------------------------------------------
  COALESCE(docs.docs_count, 0)::int        AS docs_count,
  docs.last_doc_at                         AS last_doc_at,
  j.status                                 AS prefill_job_status,
  COALESCE(pf.prefill_count, 0)::int       AS prefill_count,
  COALESCE(ans.open_unknown_count, 0)::int AS open_unknown_count,
  COALESCE(ans.answers_count, 0)::int      AS answers_count,
  COALESCE(s.completed, false)             AS completed,
  COALESCE(s.outcome_confirmed, false)     AS outcome_confirmed,
  c.status                                 AS chart_status,
  c.finalized_at                           AS finalized_at,
  ap.generation_status                     AS appendix_generation_status,
  ap.review_status                         AS appendix_review_status,
  COALESCE(rep.has_interim_report, false)  AS has_interim_report,
  COALESCE(rep.has_final_report, false)    AS has_final_report,
  rlatest.generation_status                AS report_generation_status,

  -- Coarse drift flag: did ANY memo input change after the newest active
  -- final memo was generated? Inputs mirror the six input sources of
  -- sectionDependencies.ts: answers (max updated_at, M1), documents (newest
  -- upload), structure (chart updated_at), appendix (updated_at) and outcome
  -- (sessions.confirmed_at). sessions.updated_at is deliberately excluded:
  -- it is touched by too many non-input writes (e.g. docx download marks).
  -- Postgres GREATEST ignores NULL arguments; if everything is NULL the
  -- comparison is NULL and COALESCE lands on false.
  COALESCE(
    rep.last_final_generated_at IS NOT NULL
    AND GREATEST(
          ans.answers_last_changed_at,
          docs.last_doc_at,
          c.updated_at,
          ap.updated_at,
          s.confirmed_at
        ) > rep.last_final_generated_at,
    false
  ) AS inputs_changed_after_final

FROM public.atad2_sessions s
LEFT JOIN public.atad2_prefill_jobs j     ON j.session_id  = s.session_id
LEFT JOIN public.atad2_structure_charts c ON c.session_id  = s.session_id
LEFT JOIN public.atad2_appendix ap        ON ap.session_id = s.session_id  -- VM-only table, see header
LEFT JOIN LATERAL (
  SELECT count(*) AS docs_count,
         max(d.created_at) AS last_doc_at
  FROM public.atad2_session_documents d
  WHERE d.session_id = s.session_id
) docs ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS answers_count,
         count(*) FILTER (WHERE a.answer = 'Unknown'
                            AND a.unknown_confirmed_at IS NULL) AS open_unknown_count,
         max(COALESCE(a.updated_at, a.answered_at, a.created_at)) AS answers_last_changed_at
  FROM public.atad2_answers a
  WHERE a.session_id = s.session_id
) ans ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS prefill_count
  FROM public.atad2_question_prefills p
  WHERE p.session_id = s.session_id
) pf ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE r.report_kind = 'final'
                            AND r.generation_status = 'ready') > 0 AS has_final_report,
         count(*) FILTER (WHERE r.report_kind = 'interim'
                            AND r.generation_status = 'ready') > 0 AS has_interim_report,
         max(r.generated_at) FILTER (WHERE r.report_kind = 'final'
                            AND r.generation_status = 'ready') AS last_final_generated_at
  FROM public.atad2_reports r
  WHERE r.session_id = s.session_id
    AND r.archived_at IS NULL
) rep ON true
LEFT JOIN LATERAL (
  SELECT r.generation_status, r.updated_at
  FROM public.atad2_reports r
  WHERE r.session_id = s.session_id
    AND r.archived_at IS NULL
  ORDER BY r.generated_at DESC
  LIMIT 1
) rlatest ON true
CROSS JOIN LATERAL (
  -- atad2_questions is world-readable ("Questions are viewable by everyone"),
  -- so this count is identical for every caller.
  SELECT count(DISTINCT q.question_id) AS questions_total
  FROM public.atad2_questions q
) qt;

COMMENT ON VIEW public.atad2_dossier_blocks IS
  'The single status oracle for the dossier hub, client list and admin screens. One row per session; five derived block statuses in the six-status vocabulary (empty|generating|in_progress|attention|ready|confirmed) plus raw facts. security_invoker: RLS of the underlying tables applies to the caller. References atad2_appendix, whose migration lives on feat/technical-appendix (table exists on the VM).';

GRANT SELECT ON public.atad2_dossier_blocks TO authenticated, service_role;

-- ============================================================================
-- 3) The gate: final_report_gate(p_session_id)
--    Modeled on admin_reset_session (20260603130000): SECURITY DEFINER,
--    ownership check inside, jsonb result. Called by the UI (button +
--    checklist popover), by the future generate-report edge function, and by
--    the existing n8n report route, so a stale tab or a raw API call can
--    never produce an ungated final memo. The predicate is deliberately
--    path-free and answer-based: completed = true guarantees an answer row
--    for every asked question, so AI gaps outside the question path can
--    never block, and the open-questions register (M3) never gates by itself.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.final_report_gate(p_session_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  -- PostgREST puts the JWT role claim in request.jwt.claims. Edge functions
  -- calling with the service key carry role 'service_role' and always pass
  -- the ownership check (the spec explicitly allows the service role).
  v_jwt_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  v_session RECORD;
  v_open_unknowns INT;
  v_appendix RECORD;
  v_blockers JSONB := '[]'::jsonb;
BEGIN
  SELECT id,
         user_id,
         COALESCE(completed, false)         AS completed,
         COALESCE(outcome_confirmed, false) AS outcome_confirmed
  INTO v_session
  FROM public.atad2_sessions
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'final_report_gate: session % not found', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Ownership check inside the function (admin_reset_session model):
  -- session owner, staff (admin/moderator), or the service role.
  IF v_jwt_role <> 'service_role'
     AND v_session.user_id IS DISTINCT FROM v_caller
     AND NOT public.has_admin_access(v_caller) THEN
    RAISE EXCEPTION 'final_report_gate: caller may not gate session %', p_session_id
      USING ERRCODE = '42501';
  END IF;

  -- Blocker 1: the question path has not been walked to the end.
  IF NOT v_session.completed THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'questions_not_finished', 'count', 1);
  END IF;

  -- Blocker 2: Unknown answers that nobody has consciously confirmed.
  -- unknown_confirmed_at comes from M1; an answer edit clears it via trigger,
  -- so a stale sign-off can never satisfy this check.
  SELECT count(*)
  INTO v_open_unknowns
  FROM public.atad2_answers a
  WHERE a.session_id = p_session_id
    AND a.answer = 'Unknown'
    AND a.unknown_confirmed_at IS NULL;

  IF v_open_unknowns > 0 THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'open_unknown_answers', 'count', v_open_unknowns);
  END IF;

  -- Blocker 3: the preliminary outcome has not been confirmed (or overridden
  -- with a confirmation) by the advisor.
  IF NOT v_session.outcome_confirmed THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'outcome_not_confirmed', 'count', 1);
  END IF;

  -- Blocker 4: the structure chart has not been finalized.
  IF NOT EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    WHERE c.session_id = p_session_id
      AND c.status = 'finalized'
  ) THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'structure_not_finalized', 'count', 1);
  END IF;

  -- Blockers 5/6: the technical appendix is missing or not confirmed.
  -- atad2_appendix is the VM-only table documented in the header. There is
  -- deliberately no whole-appendix 'skipped' status: a dossier without
  -- appendix content uses per-page Skip followed by Confirm (on name).
  SELECT review_status, generation_status
  INTO v_appendix
  FROM public.atad2_appendix
  WHERE session_id = p_session_id;

  IF NOT FOUND THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'appendix_missing', 'count', 1);
  ELSIF v_appendix.review_status <> 'confirmed' THEN
    v_blockers := v_blockers
      || jsonb_build_object('code', 'appendix_not_confirmed', 'count', 1);
  END IF;

  RETURN jsonb_build_object(
    'allowed', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers
  );
END;
$$;

COMMENT ON FUNCTION public.final_report_gate(TEXT) IS
  'The single gate for generating a FINAL memorandum. Returns {allowed boolean, blockers [{code, count}]}. Blocker codes: questions_not_finished, open_unknown_answers, outcome_not_confirmed, structure_not_finalized, appendix_missing, appendix_not_confirmed. Ownership checked inside (owner, staff, or service_role). Interim reports are never gated.';

REVOKE ALL ON FUNCTION public.final_report_gate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.final_report_gate(TEXT) TO authenticated, service_role;

-- Let PostgREST pick up the new view + function without a container restart.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verification (manual, on the VM, inside one psql session):
--
--   -- 1. Simulate a session owner and read their dossier row + gate:
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"<owner-uuid>"}';
--   SET LOCAL ROLE authenticated;
--   SELECT session_id, documents_status, questions_status, structure_status,
--          appendix_status, report_status, inputs_changed_after_final
--   FROM public.atad2_dossier_blocks WHERE session_id = '<session_id>';
--   SELECT public.final_report_gate('<session_id>');
--   ROLLBACK;
--
--   -- 2. A non-owner non-staff caller must get zero view rows and an
--   --    exception (42501) from the gate for the same session.
--
--   -- 3. Staff (moderator) should now see prefill/job/chart-derived statuses
--   --    for foreign sessions; docs_count and the appendix block remain
--   --    owner-only for moderators (documented limitation above).
-- ============================================================================
