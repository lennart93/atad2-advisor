-- Add columns for preliminary ATAD2 assessment confirmation flow
ALTER TABLE public.atad2_sessions
ADD COLUMN IF NOT EXISTS preliminary_outcome text,
ADD COLUMN IF NOT EXISTS outcome_confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS outcome_overridden boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS override_reason text,
ADD COLUMN IF NOT EXISTS override_outcome text,
ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone;