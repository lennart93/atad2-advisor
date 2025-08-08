-- 1) Create enum for roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
  END IF;
END
$$;

-- 2) Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 4) Policies for user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5) Ensure RLS is enabled on target tables (no-op if already enabled)
ALTER TABLE public.atad2_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_context_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6) Admin policies for content tables
-- atad2_questions: allow admins to manage
DROP POLICY IF EXISTS "Admins can insert questions" ON public.atad2_questions;
CREATE POLICY "Admins can insert questions"
ON public.atad2_questions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update questions" ON public.atad2_questions;
CREATE POLICY "Admins can update questions"
ON public.atad2_questions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete questions" ON public.atad2_questions;
CREATE POLICY "Admins can delete questions"
ON public.atad2_questions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- atad2_context_questions: allow admins to manage
DROP POLICY IF EXISTS "Admins can insert context questions" ON public.atad2_context_questions;
CREATE POLICY "Admins can insert context questions"
ON public.atad2_context_questions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update context questions" ON public.atad2_context_questions;
CREATE POLICY "Admins can update context questions"
ON public.atad2_context_questions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete context questions" ON public.atad2_context_questions;
CREATE POLICY "Admins can delete context questions"
ON public.atad2_context_questions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- atad2_sessions: allow admins to view/update/delete all
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.atad2_sessions;
CREATE POLICY "Admins can view all sessions"
ON public.atad2_sessions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all sessions" ON public.atad2_sessions;
CREATE POLICY "Admins can update all sessions"
ON public.atad2_sessions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete all sessions" ON public.atad2_sessions;
CREATE POLICY "Admins can delete all sessions"
ON public.atad2_sessions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- atad2_answers: allow admins to view/update/delete all
DROP POLICY IF EXISTS "Admins can view all answers" ON public.atad2_answers;
CREATE POLICY "Admins can view all answers"
ON public.atad2_answers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all answers" ON public.atad2_answers;
CREATE POLICY "Admins can update all answers"
ON public.atad2_answers
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete all answers" ON public.atad2_answers;
CREATE POLICY "Admins can delete all answers"
ON public.atad2_answers
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- profiles: allow admins to list all profiles to manage users
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 7) Indexes for performance
CREATE INDEX IF NOT EXISTS idx_atad2_answers_session_id ON public.atad2_answers (session_id);
CREATE INDEX IF NOT EXISTS idx_atad2_answers_question_id ON public.atad2_answers (question_id);
CREATE INDEX IF NOT EXISTS idx_atad2_context_questions_question_id ON public.atad2_context_questions (question_id);
CREATE INDEX IF NOT EXISTS idx_atad2_sessions_user_created_at ON public.atad2_sessions (user_id, created_at);