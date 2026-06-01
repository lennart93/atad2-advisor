-- M2: Audit trail for atad2_prompts.
--
-- The atad2_prompts table is read by edge functions using the service role
-- key, which bypasses RLS. If that key ever leaks, an attacker can swap the
-- active swarm prompt to inject instructions into every prefill run with no
-- audit trail. The trigger below fires regardless of who performs the change
-- (admin, service role, or postgres superuser), so we keep a forensic record
-- even when RLS is not in the path.

CREATE TABLE IF NOT EXISTS public.atad2_prompts_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id    uuid,
  prompt_key   text,
  version      integer,
  action       text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row      jsonb,
  new_row      jsonb,
  changed_by   uuid,
  db_role      text NOT NULL,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atad2_prompts_audit_prompt_id_idx
  ON public.atad2_prompts_audit (prompt_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS atad2_prompts_audit_changed_at_idx
  ON public.atad2_prompts_audit (changed_at DESC);

ALTER TABLE public.atad2_prompts_audit ENABLE ROW LEVEL SECURITY;

-- Admins can read the audit log. There are no INSERT/UPDATE/DELETE policies
-- because writes happen exclusively via the SECURITY DEFINER trigger below
-- (which runs as the function owner, bypassing RLS for the write).
DROP POLICY IF EXISTS "Admins can read prompt audit log" ON public.atad2_prompts_audit;
CREATE POLICY "Admins can read prompt audit log"
  ON public.atad2_prompts_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.log_atad2_prompts_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_prompt_id  uuid;
  v_prompt_key text;
  v_version    integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_prompt_id  := OLD.id;
    v_prompt_key := OLD.key;
    v_version    := OLD.version;
  ELSE
    v_prompt_id  := NEW.id;
    v_prompt_key := NEW.key;
    v_version    := NEW.version;
  END IF;

  INSERT INTO public.atad2_prompts_audit
    (prompt_id, prompt_key, version, action, old_row, new_row, changed_by, db_role)
  VALUES (
    v_prompt_id,
    v_prompt_key,
    v_version,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    auth.uid(),
    current_user
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.log_atad2_prompts_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS atad2_prompts_audit_trigger ON public.atad2_prompts;

CREATE TRIGGER atad2_prompts_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.atad2_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_atad2_prompts_change();

COMMENT ON TABLE public.atad2_prompts_audit IS
  'Append-only audit log of every change to atad2_prompts. Populated by a SECURITY DEFINER trigger so service-role and superuser writes are captured.';
