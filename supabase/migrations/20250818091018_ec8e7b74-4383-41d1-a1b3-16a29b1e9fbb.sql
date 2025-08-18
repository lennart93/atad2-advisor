-- Update atad2_answers table to use numeric type for risk_points to match atad2_questions table
ALTER TABLE public.atad2_answers 
ALTER COLUMN risk_points TYPE numeric(3,1)
USING (risk_points::numeric);