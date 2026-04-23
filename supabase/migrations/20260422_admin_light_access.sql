-- Adds "admin-light" (moderator) read access to the admin suite.
-- Admin-only mutations remain unchanged.
--
-- The 'moderator' value already exists in the app_role enum (since 2025-08-08).
-- No enum migration needed.

-- 1) Helper: true if user has admin OR moderator role
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'moderator')
  );
$$;

-- 2) user_roles: let moderators read roles (needed for Users page display)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_admin_access(auth.uid()));

-- 3) audit_logs: moderators can read audit trail
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Staff can view all audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.has_admin_access(auth.uid()));

-- 4) profiles: moderators can view all profiles (for Users page + session owner names)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Staff can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR user_id = auth.uid()
);

-- 5) atad2_sessions: moderators can view all sessions
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.atad2_sessions;
CREATE POLICY "Staff can view all sessions"
ON public.atad2_sessions
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR user_id = auth.uid()
);

-- 6) atad2_answers: moderators can view all answers
DROP POLICY IF EXISTS "Admins can view all answers" ON public.atad2_answers;
CREATE POLICY "Staff can view all answers"
ON public.atad2_answers
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_answers.session_id AND s.user_id = auth.uid()
  )
);

-- 7) atad2_reports: moderators can view all reports
DROP POLICY IF EXISTS "Admins can view all reports" ON public.atad2_reports;
CREATE POLICY "Staff can view all reports"
ON public.atad2_reports
FOR SELECT
TO authenticated
USING (
  public.has_admin_access(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_reports.session_id AND s.user_id = auth.uid()
  )
);

-- Unchanged: all INSERT/UPDATE/DELETE policies remain admin-only.
-- The can_modify_admin_role trigger remains in force.
