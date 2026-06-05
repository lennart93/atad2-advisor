-- Commercial tracking on assessment sessions.
--
-- The admin Sessions overview needs to record, per session, whether the ATAD2
-- analysis was actually sold to the client and for what fee. Amounts can be
-- entered at any time (a quote / pipeline value) and the session flipped to
-- "sold" later, so the two facts are stored independently:
--   * sold        - was the engagement booked (yes/no)
--   * revenue_eur - the fee (quoted or booked), NULL = no amount entered
--
-- Booked revenue  = SUM(revenue_eur) WHERE sold
-- Pipeline (open) = SUM(revenue_eur) WHERE NOT sold AND revenue_eur IS NOT NULL
--
-- This is sensitive commercial data, so the write path is admin-ONLY (not the
-- moderator / admin-light role). The existing owner-only UPDATE policy on
-- atad2_sessions stays untouched; instead a SECURITY DEFINER RPC performs the
-- write after checking has_role(uid, 'admin'), mirroring admin_reset_session.

ALTER TABLE public.atad2_sessions
  ADD COLUMN IF NOT EXISTS sold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue_eur numeric(12,2),
  ADD COLUMN IF NOT EXISTS revenue_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS revenue_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_set_session_revenue(
  p_session_id TEXT,
  p_sold BOOLEAN,
  p_revenue_eur NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_session_uuid UUID;
  v_sold BOOLEAN := COALESCE(p_sold, false);
BEGIN
  -- Admins ONLY: revenue is commercial data, moderators may read but not write.
  IF NOT public.has_role(v_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_set_session_revenue: caller is not an admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_revenue_eur IS NOT NULL AND p_revenue_eur < 0 THEN
    RAISE EXCEPTION 'admin_set_session_revenue: amount must not be negative'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.atad2_sessions
  SET sold = v_sold,
      revenue_eur = p_revenue_eur,
      revenue_updated_at = NOW(),
      revenue_updated_by = v_admin_id
  WHERE session_id = p_session_id
  RETURNING id INTO v_session_uuid;

  IF v_session_uuid IS NULL THEN
    RAISE EXCEPTION 'admin_set_session_revenue: session % not found', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, new_values)
  VALUES (
    'session_revenue_set',
    'atad2_sessions',
    v_session_uuid::text,
    v_admin_id,
    jsonb_build_object(
      'session_id', p_session_id,
      'sold', v_sold,
      'revenue_eur', p_revenue_eur
    )
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'sold', v_sold,
    'revenue_eur', p_revenue_eur,
    'updated_by', v_admin_id,
    'updated_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_session_revenue(TEXT, BOOLEAN, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_session_revenue(TEXT, BOOLEAN, NUMERIC) TO authenticated;
