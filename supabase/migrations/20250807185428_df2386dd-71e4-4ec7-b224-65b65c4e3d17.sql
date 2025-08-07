-- CRITICAL SECURITY FIXES

-- 1. Enable RLS on atad2_context_questions table (currently has no RLS protection)
ALTER TABLE atad2_context_questions ENABLE ROW LEVEL SECURITY;

-- 2. Create read-only policy for context questions (they should be publicly readable)
CREATE POLICY "Context questions are viewable by everyone" 
ON atad2_context_questions 
FOR SELECT 
USING (true);

-- 3. Update atad2_sessions policies to remove NULL user access (security vulnerability)
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can create their own sessions" ON atad2_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON atad2_sessions;
DROP POLICY IF EXISTS "Users can view their own sessions" ON atad2_sessions;

-- Create secure policies that require authentication (no NULL users)
CREATE POLICY "Users can create their own sessions" 
ON atad2_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions" 
ON atad2_sessions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own sessions" 
ON atad2_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Keep the delete policy as-is since it was just added
-- Note: The existing delete policy will be updated separately if needed

-- 4. Update atad2_answers policies to remove NULL user access
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can create answers for their sessions" ON atad2_answers;
DROP POLICY IF EXISTS "Users can update answers for their sessions" ON atad2_answers;
DROP POLICY IF EXISTS "Users can view answers for their sessions" ON atad2_answers;
DROP POLICY IF EXISTS "Users can delete answers for their sessions" ON atad2_answers;

-- Create secure policies for answers (through session ownership)
CREATE POLICY "Users can create answers for their sessions" 
ON atad2_answers 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM atad2_sessions 
  WHERE atad2_sessions.session_id = atad2_answers.session_id 
  AND atad2_sessions.user_id = auth.uid()
));

CREATE POLICY "Users can update answers for their sessions" 
ON atad2_answers 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM atad2_sessions 
  WHERE atad2_sessions.session_id = atad2_answers.session_id 
  AND atad2_sessions.user_id = auth.uid()
));

CREATE POLICY "Users can view answers for their sessions" 
ON atad2_answers 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM atad2_sessions 
  WHERE atad2_sessions.session_id = atad2_answers.session_id 
  AND atad2_sessions.user_id = auth.uid()
));

CREATE POLICY "Users can delete answers for their sessions" 
ON atad2_answers 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM atad2_sessions 
  WHERE atad2_sessions.session_id = atad2_answers.session_id 
  AND atad2_sessions.user_id = auth.uid()
));

-- 5. Fix database function security by setting search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$function$;