-- Fix RLS policies: remove "OR user_id IS NULL" to prevent data leaking between users

DROP POLICY IF EXISTS "Users can view their own sessions" ON atad2_sessions;
CREATE POLICY "Users can view their own sessions"
  ON atad2_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own sessions" ON atad2_sessions;
CREATE POLICY "Users can create their own sessions"
  ON atad2_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own sessions" ON atad2_sessions;
CREATE POLICY "Users can update their own sessions"
  ON atad2_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Also fix atad2_answers policies that reference user_id IS NULL
DROP POLICY IF EXISTS "Users can view answers for their sessions" ON atad2_answers;
CREATE POLICY "Users can view answers for their sessions"
  ON atad2_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_answers.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can create answers for their sessions" ON atad2_answers;
CREATE POLICY "Users can create answers for their sessions"
  ON atad2_answers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_answers.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update answers for their sessions" ON atad2_answers;
CREATE POLICY "Users can update answers for their sessions"
  ON atad2_answers FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_answers.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can delete answers for their sessions" ON atad2_answers;
CREATE POLICY "Users can delete answers for their sessions"
  ON atad2_answers FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM atad2_sessions
    WHERE atad2_sessions.session_id = atad2_answers.session_id
    AND atad2_sessions.user_id = auth.uid()
  ));
