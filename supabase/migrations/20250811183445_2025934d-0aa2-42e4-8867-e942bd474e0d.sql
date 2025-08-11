-- Fix check constraint to allow "Unknown" answers
ALTER TABLE atad2_answers DROP CONSTRAINT IF EXISTS atad2_answers_answer_check;
ALTER TABLE atad2_answers ADD CONSTRAINT atad2_answers_answer_check 
  CHECK ((answer = ANY (ARRAY['Yes'::text, 'No'::text, 'Unknown'::text])));

-- Add unique constraint for proper upsert functionality
ALTER TABLE atad2_answers ADD CONSTRAINT IF NOT EXISTS atad2_answers_session_question_unique 
  UNIQUE (session_id, question_id);