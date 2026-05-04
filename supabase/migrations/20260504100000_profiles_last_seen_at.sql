-- Track when a user was last actively using the app. Auth.users.last_sign_in_at
-- only updates on OTP login, which is misleading for long sessions. We add a
-- profiles.last_seen_at column and a security-definer RPC the client calls
-- (throttled) so the user can update only their own row without a write-policy.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_user_seen()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles
    SET last_seen_at = now()
    WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_user_seen() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_user_seen() TO authenticated;
