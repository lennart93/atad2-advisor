-- First, clean up orphaned reports that don't have corresponding sessions
DELETE FROM public.atad2_reports 
WHERE session_id NOT IN (
  SELECT session_id FROM public.atad2_sessions
);

-- Now add the foreign key constraint with CASCADE DELETE
ALTER TABLE public.atad2_reports 
ADD CONSTRAINT fk_atad2_reports_session 
FOREIGN KEY (session_id) 
REFERENCES public.atad2_sessions(session_id) 
ON DELETE CASCADE;