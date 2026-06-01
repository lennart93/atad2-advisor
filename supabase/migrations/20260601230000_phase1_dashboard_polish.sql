-- Phase 1 polish: robust last_seen tracking + drop deprecated prefill prompt rows.

-- ============================================================
-- 1) Robust last_seen tracking
-- ============================================================

-- Backfill: existing users get the best available activity timestamp,
-- combining auth.users.last_sign_in_at and their latest session edit.
UPDATE public.profiles p
SET last_seen_at = GREATEST(
  COALESCE((SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = p.user_id), 'epoch'::timestamptz),
  COALESCE((SELECT max(s.updated_at) FROM public.atad2_sessions s WHERE s.user_id = p.user_id), 'epoch'::timestamptz)
)
WHERE p.last_seen_at IS NULL
  AND (
    (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = p.user_id) IS NOT NULL
    OR (SELECT max(s.updated_at) FROM public.atad2_sessions s WHERE s.user_id = p.user_id) IS NOT NULL
  );

-- Make the heartbeat RPC resilient: if the profile row somehow
-- doesn't exist yet, upsert it with the user's email so the
-- stamp lands and Last-seen reporting works on first ping.
CREATE OR REPLACE FUNCTION public.mark_user_seen()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  UPDATE public.profiles SET last_seen_at = now() WHERE user_id = uid;

  IF NOT FOUND THEN
    SELECT email INTO uemail FROM auth.users WHERE id = uid;
    INSERT INTO public.profiles (user_id, email, last_seen_at)
    VALUES (uid, uemail, now())
    ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;
  END IF;
END;
$$;

-- ============================================================
-- 2) Drop deprecated legacy prefill prompt rows
-- The swarm prompt replaced these in 2026-05-02. No FKs point
-- to atad2_prompts.id, so deleting is safe and clears them
-- from the admin Pre-Fill Prompts page.
-- ============================================================

DELETE FROM public.atad2_prompts
WHERE key IN ('prefill_stage1_system', 'prefill_stage2_system');
