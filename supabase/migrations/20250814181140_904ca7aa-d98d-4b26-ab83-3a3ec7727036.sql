-- Fix function search_path issues by setting search_path on existing functions
ALTER FUNCTION public.set_report_user_id() SET search_path = 'public';
ALTER FUNCTION public.audit_trigger() SET search_path = 'public';