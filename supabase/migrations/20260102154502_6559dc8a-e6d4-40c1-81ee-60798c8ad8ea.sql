-- Add column to track when Word document was downloaded
ALTER TABLE public.atad2_sessions 
ADD COLUMN docx_downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;