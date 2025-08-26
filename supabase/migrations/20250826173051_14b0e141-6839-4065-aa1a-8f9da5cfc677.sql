-- Add requires_explanation column to atad2_questions
ALTER TABLE public.atad2_questions 
ADD COLUMN IF NOT EXISTS requires_explanation BOOLEAN NOT NULL DEFAULT false;

-- Backfill: set true where context questions exist for that question_id + answer_option combination
UPDATE public.atad2_questions 
SET requires_explanation = true
WHERE EXISTS (
  SELECT 1 FROM public.atad2_context_questions cq
  WHERE cq.question_id = atad2_questions.question_id
    AND cq.answer_trigger = atad2_questions.answer_option
);

-- Add index for performance on context questions lookup
CREATE INDEX IF NOT EXISTS idx_context_questions_lookup 
ON public.atad2_context_questions (question_id, answer_trigger);