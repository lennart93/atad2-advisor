-- First, let's check if the foreign key constraint exists and remove it if it does
-- since it's pointing to the wrong column

-- Drop the existing constraint if it exists
ALTER TABLE atad2_answers DROP CONSTRAINT IF EXISTS fk_atad2_answers_session;

-- Create the correct foreign key constraint
-- The atad2_answers.session_id should reference atad2_sessions.session_id (not id)
-- Both are text fields, so this should work correctly
ALTER TABLE atad2_answers 
ADD CONSTRAINT fk_atad2_answers_session 
FOREIGN KEY (session_id) 
REFERENCES atad2_sessions(session_id) 
ON DELETE CASCADE;