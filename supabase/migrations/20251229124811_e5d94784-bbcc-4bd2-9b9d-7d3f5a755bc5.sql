-- Add additional_context column to atad2_sessions
ALTER TABLE public.atad2_sessions 
ADD COLUMN additional_context text;