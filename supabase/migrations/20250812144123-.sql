-- Fix search_path issues for all functions by adding SET search_path = 'public'
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_modify_admin_role(target_user_id UUID, action TEXT)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_is_admin BOOLEAN;
  target_user_is_admin BOOLEAN;
  admin_count INTEGER;
BEGIN
  -- Check if current user is admin
  SELECT has_role(auth.uid(), 'admin'::app_role) INTO current_user_is_admin;
  
  -- Only admins can modify roles
  IF NOT current_user_is_admin THEN
    RETURN FALSE;
  END IF;
  
  -- Check if target user is admin
  SELECT has_role(target_user_id, 'admin'::app_role) INTO target_user_is_admin;
  
  -- Prevent self-removal of admin rights
  IF action = 'DELETE' AND target_user_id = auth.uid() AND target_user_is_admin THEN
    -- Count total admins
    SELECT COUNT(*) INTO admin_count 
    FROM public.user_roles 
    WHERE role = 'admin'::app_role;
    
    -- Don't allow if this would be the last admin
    IF admin_count <= 1 THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.anonymize_old_sessions()
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Anonymize sessions older than 2 years
  UPDATE public.atad2_sessions 
  SET 
    taxpayer_name = 'ANONYMIZED',
    entity_name = 'ANONYMIZED'
  WHERE created_at < now() - interval '2 years' 
    AND taxpayer_name != 'ANONYMIZED';
    
  -- Anonymize old answers
  UPDATE public.atad2_answers 
  SET explanation = 'ANONYMIZED'
  WHERE created_at < now() - interval '2 years' 
    AND explanation != 'ANONYMIZED'
    AND session_id IN (
      SELECT session_id FROM public.atad2_sessions 
      WHERE created_at < now() - interval '2 years'
    );
END;
$$;