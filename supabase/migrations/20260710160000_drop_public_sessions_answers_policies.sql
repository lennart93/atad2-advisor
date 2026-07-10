-- SECURITY FIX: remove the world-open RLS policies on atad2_sessions /
-- atad2_answers that were created in 20250803164520 and never dropped.
--
-- Those two policies were:
--   CREATE POLICY "Sessions are publicly accessible" ON atad2_sessions FOR ALL USING (true);
--   CREATE POLICY "Answers are publicly accessible"  ON atad2_answers  FOR ALL USING (true);
--
-- No TO clause => they apply to every role (anon included). PostgreSQL ORs RLS
-- policies together, so as long as a USING(true) policy exists the owner-scoped
-- policies added later (20260327120000) are meaningless: anyone holding the
-- public anon key could SELECT/UPDATE/DELETE every client's sessions and
-- answers via PostgREST (https://api.atad2.tax). This drops them and then
-- fails loudly if ANY permissive (USING true / no owner predicate) policy
-- still remains on either table.
--
-- Apply on the VM as supabase_admin (see CLAUDE.md), NOT as postgres.
-- Safe to re-run: DROP ... IF EXISTS + a read-only verification block.

DROP POLICY IF EXISTS "Sessions are publicly accessible" ON public.atad2_sessions;
DROP POLICY IF EXISTS "Answers are publicly accessible"  ON public.atad2_answers;

-- Belt and suspenders: also drop the older SELECT-only "everyone" variants in
-- case an out-of-order apply left them behind (the 20250806174342 cleanup only
-- dropped them by name; harmless if already gone).
DROP POLICY IF EXISTS "Sessions are viewable by everyone" ON public.atad2_sessions;
DROP POLICY IF EXISTS "Answers are viewable by everyone"  ON public.atad2_answers;

------------------------------------------------------------------------------
-- Verification: fail if any policy on these tables is still world-open, i.e.
-- its USING/WITH CHECK expression is literally `true` (a policy with no real
-- ownership predicate). This catches any remaining permissive policy under any
-- name, not just the two dropped above.
------------------------------------------------------------------------------
DO $$
DECLARE
  v_bad record;
BEGIN
  FOR v_bad IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('atad2_sessions', 'atad2_answers')
      AND (
        btrim(coalesce(qual, ''))       = 'true'
        OR btrim(coalesce(with_check, '')) = 'true'
      )
  LOOP
    RAISE EXCEPTION
      'Security fix verification: table % still has world-open policy "%" (qual=%, with_check=%)',
      v_bad.tablename, v_bad.policyname, v_bad.qual, v_bad.with_check;
  END LOOP;

  RAISE NOTICE 'Security fix verified: no world-open (USING true) policies remain on atad2_sessions / atad2_answers.';
END $$;

notify pgrst, 'reload schema';
