-- Permanent assessment activity log.
-- Snapshots every session create / completion / deletion so that
-- "who ran which assessment for which client in which year" can
-- always be answered, even after a user deletes their session.

CREATE TABLE public.atad2_assessment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Snapshot of the session at event time. Not FK-linked so the
  -- row survives even when the originating session is deleted.
  session_uuid uuid NOT NULL,
  session_id text NOT NULL,
  user_id uuid,
  user_email text,
  user_full_name text,
  taxpayer_name text,
  entity_name text,
  fiscal_year text,
  status text,
  final_score numeric,
  preliminary_outcome text,
  outcome_confirmed boolean,
  session_created_at timestamptz,
  session_updated_at timestamptz,
  confirmed_at timestamptz,
  event_type text NOT NULL CHECK (event_type IN ('created','completed','deleted','backfill')),
  event_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessment_log_event_at  ON public.atad2_assessment_log(event_at DESC);
CREATE INDEX idx_assessment_log_user_id   ON public.atad2_assessment_log(user_id);
CREATE INDEX idx_assessment_log_session   ON public.atad2_assessment_log(session_id);

ALTER TABLE public.atad2_assessment_log ENABLE ROW LEVEL SECURITY;

-- Read access: staff (admin/moderator). Writes happen only via
-- the SECURITY DEFINER trigger fn, so no INSERT/UPDATE policies.
CREATE POLICY "Staff can read assessment log"
  ON public.atad2_assessment_log FOR SELECT
  TO authenticated
  USING (has_admin_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_atad2_session_event()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_email text;
  v_full_name text;
  v_user_id uuid;
  v_row public.atad2_sessions%ROWTYPE;
  v_event text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
    v_event := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_row := NEW;
    v_event := 'created';
  ELSE
    v_row := NEW;
    IF (COALESCE(OLD.completed, false) = false AND COALESCE(NEW.completed, false) = true)
       OR (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL)
       OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed') THEN
      v_event := 'completed';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  v_user_id := v_row.user_id;

  IF v_user_id IS NOT NULL THEN
    SELECT email, full_name INTO v_email, v_full_name
      FROM public.profiles WHERE user_id = v_user_id;
    IF v_email IS NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
    END IF;
  END IF;

  INSERT INTO public.atad2_assessment_log (
    session_uuid, session_id, user_id, user_email, user_full_name,
    taxpayer_name, entity_name, fiscal_year, status, final_score,
    preliminary_outcome, outcome_confirmed,
    session_created_at, session_updated_at, confirmed_at,
    event_type
  ) VALUES (
    v_row.id, v_row.session_id, v_user_id, v_email, v_full_name,
    v_row.taxpayer_name, v_row.entity_name, v_row.fiscal_year, v_row.status, v_row.final_score,
    v_row.preliminary_outcome, v_row.outcome_confirmed,
    v_row.created_at, v_row.updated_at, v_row.confirmed_at,
    v_event
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_atad2_sessions_log
  AFTER INSERT OR UPDATE OR DELETE ON public.atad2_sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_atad2_session_event();

-- Backfill: one 'backfill' row per existing session, dated at session creation.
INSERT INTO public.atad2_assessment_log (
  session_uuid, session_id, user_id, user_email, user_full_name,
  taxpayer_name, entity_name, fiscal_year, status, final_score,
  preliminary_outcome, outcome_confirmed,
  session_created_at, session_updated_at, confirmed_at,
  event_type, event_at
)
SELECT
  s.id, s.session_id, s.user_id,
  p.email, p.full_name,
  s.taxpayer_name, s.entity_name, s.fiscal_year, s.status, s.final_score,
  s.preliminary_outcome, s.outcome_confirmed,
  s.created_at, s.updated_at, s.confirmed_at,
  'backfill', s.created_at
FROM public.atad2_sessions s
LEFT JOIN public.profiles p ON p.user_id = s.user_id;
