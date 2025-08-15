-- Add foreign key constraint with CASCADE DELETE to automatically delete reports when sessions are deleted
ALTER TABLE public.atad2_reports 
ADD CONSTRAINT fk_atad2_reports_session 
FOREIGN KEY (session_id) 
REFERENCES public.atad2_sessions(session_id) 
ON DELETE CASCADE;