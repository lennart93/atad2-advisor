-- Add DELETE policy for atad2_sessions table
-- Users should be able to delete their own sessions

CREATE POLICY "Users can delete their own sessions" 
ON atad2_sessions 
FOR DELETE 
USING ((auth.uid() = user_id) OR (user_id IS NULL));