-- Add risk_category column to atad2_reports table
ALTER TABLE public.atad2_reports 
ADD COLUMN IF NOT EXISTS risk_category text;

-- Add check constraint to validate risk_category values
ALTER TABLE public.atad2_reports
DROP CONSTRAINT IF EXISTS atad2_reports_risk_category_check;

ALTER TABLE public.atad2_reports
ADD CONSTRAINT atad2_reports_risk_category_check
CHECK (risk_category IS NULL OR risk_category IN ('low','medium','high','insufficient_information'));