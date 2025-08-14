-- Create atad2_reports table
CREATE TABLE public.atad2_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  model TEXT,
  total_risk INTEGER,
  answers_count INTEGER,
  report_title TEXT,
  report_md TEXT NOT NULL,
  report_json JSONB,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create function to automatically set user_id from session
CREATE OR REPLACE FUNCTION public.set_report_user_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Get user_id from the corresponding session
  SELECT user_id INTO NEW.user_id 
  FROM public.atad2_sessions 
  WHERE session_id = NEW.session_id;
  
  -- If no session found, raise error
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Session with id % not found', NEW.session_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-set user_id on insert/update
CREATE TRIGGER set_report_user_id_trigger
  BEFORE INSERT OR UPDATE ON public.atad2_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_report_user_id();

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_atad2_reports_updated_at
  BEFORE UPDATE ON public.atad2_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.atad2_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies for users
CREATE POLICY "Users can view their own reports" 
ON public.atad2_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" 
ON public.atad2_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for admins
CREATE POLICY "Admins can view all reports" 
ON public.atad2_reports 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete all reports" 
ON public.atad2_reports 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert reports (for n8n callback)
CREATE POLICY "Service role can insert reports" 
ON public.atad2_reports 
FOR INSERT 
WITH CHECK (true);