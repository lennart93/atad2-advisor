-- Admin "reset session for re-run" feature.
--
-- A user can complete an ATAD2 assessment session, generate a memo, and then
-- the session is locked into "View report" mode (Index.tsx). There's no path
-- to re-open that specific session and regenerate. Admin needs a way to roll
-- a session back so the user can resume it, without losing the original
-- memo from the admin audit view.
--
-- Approach:
--   1. atad2_reports gets a soft-archive marker (archived_at, archived_by).
--      Archived reports are hidden from the user-facing views by the
--      frontend (RLS still allows SELECT for both user and admin so the
--      audit trail remains queryable).
--   2. A SECURITY DEFINER RPC admin_reset_session() does the whole reset
--      atomically: archives every non-archived report for the session and
--      flips the session back to in-progress. Admin permission is checked
--      via has_admin_access() inside the function so we don't need to
--      grant broad UPDATE rights on atad2_reports / atad2_sessions to the
--      authenticated role.

ALTER TABLE public.atad2_reports
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS atad2_reports_session_active_idx
  ON public.atad2_reports (session_id, generated_at DESC)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.admin_reset_session(p_session_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_archived_count INT;
  v_session_uuid UUID;
BEGIN
  IF NOT public.has_admin_access(v_admin_id) THEN
    RAISE EXCEPTION 'admin_reset_session: caller is not admin or moderator'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_session_uuid
  FROM public.atad2_sessions
  WHERE session_id = p_session_id;

  IF v_session_uuid IS NULL THEN
    RAISE EXCEPTION 'admin_reset_session: session % not found', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.atad2_reports
  SET archived_at = NOW(),
      archived_by = v_admin_id
  WHERE session_id = p_session_id
    AND archived_at IS NULL;
  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  UPDATE public.atad2_sessions
  SET completed = false,
      outcome_confirmed = false,
      status = 'in_progress'
  WHERE session_id = p_session_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, new_values)
  VALUES (
    'session_reset_for_rerun',
    'atad2_sessions',
    v_session_uuid::text,
    v_admin_id,
    jsonb_build_object(
      'session_id', p_session_id,
      'archived_reports', v_archived_count
    )
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'archived_reports', v_archived_count,
    'reset_by', v_admin_id,
    'reset_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_session(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_session(TEXT) TO authenticated;
