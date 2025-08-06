
-- Update atad2_sessions table to include user relationship and better structure
ALTER TABLE atad2_sessions 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS entity_name text,
ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false;

-- Create index for better performance on user queries
CREATE INDEX IF NOT EXISTS idx_atad2_sessions_user_id ON atad2_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_atad2_sessions_created_at ON atad2_sessions(created_at DESC);

-- Update RLS policies for atad2_sessions to be user-specific
DROP POLICY IF EXISTS "Sessions are viewable by everyone" ON atad2_sessions;

-- Allow users to view their own sessions
CREATE POLICY "Users can view their own sessions" 
ON atad2_sessions 
FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

-- Allow users to insert their own sessions
CREATE POLICY "Users can create their own sessions" 
ON atad2_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow users to update their own sessions
CREATE POLICY "Users can update their own sessions" 
ON atad2_sessions 
FOR UPDATE 
USING (auth.uid() = user_id OR user_id IS NULL);

-- Update RLS policies for atad2_answers to be session-based
DROP POLICY IF EXISTS "Answers are viewable by everyone" ON atad2_answers;

-- Allow users to view answers for their own sessions
CREATE POLICY "Users can view answers for their sessions" 
ON atad2_answers 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM atad2_sessions 
    WHERE atad2_sessions.session_id = atad2_answers.session_id 
    AND (atad2_sessions.user_id = auth.uid() OR atad2_sessions.user_id IS NULL)
  )
);

-- Allow users to insert answers for their own sessions
CREATE POLICY "Users can create answers for their sessions" 
ON atad2_answers 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM atad2_sessions 
    WHERE atad2_sessions.session_id = atad2_answers.session_id 
    AND (atad2_sessions.user_id = auth.uid() OR atad2_sessions.user_id IS NULL)
  )
);

-- Allow users to update answers for their own sessions
CREATE POLICY "Users can update answers for their sessions" 
ON atad2_answers 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM atad2_sessions 
    WHERE atad2_sessions.session_id = atad2_answers.session_id 
    AND (atad2_sessions.user_id = auth.uid() OR atad2_sessions.user_id IS NULL)
  )
);

-- Allow users to delete answers for their own sessions
CREATE POLICY "Users can delete answers for their sessions" 
ON atad2_answers 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM atad2_sessions 
    WHERE atad2_sessions.session_id = atad2_answers.session_id 
    AND (atad2_sessions.user_id = auth.uid() OR atad2_sessions.user_id IS NULL)
  )
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_atad2_answers_session_id ON atad2_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_atad2_answers_question_id ON atad2_answers(question_id);
