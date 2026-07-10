-- Security fix (F2): the atad2_sessions DELETE policy still carried the
-- `OR user_id IS NULL` clause. The 20260327120000 null-leak remediation removed
-- that clause from SELECT/INSERT/UPDATE but never touched DELETE, so any
-- authenticated user could DELETE null-owner session rows (cross-tenant
-- integrity / data-loss hole). Recreate the policy owner-scoped and
-- authenticated-only, matching the other session policies.
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.atad2_sessions;

CREATE POLICY "Users can delete their own sessions"
  ON public.atad2_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Guard: fail the migration if the null-leak clause somehow survives.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'atad2_sessions'
      AND cmd = 'DELETE'
      AND qual ILIKE '%user_id IS NULL%'
  ) THEN
    RAISE EXCEPTION 'atad2_sessions DELETE policy still contains "user_id IS NULL"';
  END IF;
END $$;
