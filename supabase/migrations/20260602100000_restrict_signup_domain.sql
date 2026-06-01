-- H1: Restrict sign-ups to @svalneratlas.com at the database layer.
--
-- Until now the domain check lived only in src/pages/Auth.tsx, which builds
-- the email as ${local}@svalneratlas.com. Anyone POSTing directly to
-- /auth/v1/signup with an arbitrary email could bypass it. This trigger
-- enforces the same rule server-side on auth.users, so the protection holds
-- regardless of which client made the request.

CREATE OR REPLACE FUNCTION public.enforce_signup_email_domain()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL OR NEW.email !~* '@svalneratlas\.com$' THEN
    RAISE EXCEPTION
      'Sign-ups are restricted to @svalneratlas.com email addresses'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_signup_email_domain() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_signup_email_domain ON auth.users;

CREATE TRIGGER enforce_signup_email_domain
  BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_email_domain();

COMMENT ON FUNCTION public.enforce_signup_email_domain() IS
  'Rejects auth.users rows whose email is not @svalneratlas.com. Mirrors the client-side check in src/pages/Auth.tsx so the restriction holds against direct API calls.';
