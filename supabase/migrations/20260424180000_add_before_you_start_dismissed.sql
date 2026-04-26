-- Document Pre-Fill UX iteration 2: account-bound dismiss preference
-- for the "Before you start" modal on assessment creation.

ALTER TABLE public.profiles
  ADD COLUMN before_you_start_dismissed boolean NOT NULL DEFAULT false;
