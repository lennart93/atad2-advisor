-- Add foreign key constraint from atad2_answers to atad2_sessions with CASCADE delete
-- This ensures that when a session is deleted, all related answers are automatically deleted

ALTER TABLE atad2_answers 
ADD CONSTRAINT fk_atad2_answers_session 
FOREIGN KEY (session_id) 
REFERENCES atad2_sessions(session_id) 
ON DELETE CASCADE;

-- Add an index on session_id for better performance
CREATE INDEX IF NOT EXISTS idx_atad2_answers_session_id ON atad2_answers(session_id);