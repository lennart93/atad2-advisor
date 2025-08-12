-- Create audit log table for tracking security events
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  user_info RECORD;
BEGIN
  -- Get user info if available
  SELECT * INTO user_info FROM auth.users WHERE id = auth.uid();
  
  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
    now()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit triggers to sensitive tables
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.atad2_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Create function to prevent self-admin-removal and add additional security
CREATE OR REPLACE FUNCTION public.can_modify_admin_role(target_user_id UUID, action TEXT)
RETURNS BOOLEAN AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update user_roles policies to use the new security function
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles with verification" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND 
  can_modify_admin_role(user_id, 'INSERT')
);

CREATE POLICY "Admins can delete roles with verification" 
ON public.user_roles 
FOR DELETE 
USING (
  has_role(auth.uid(), 'admin'::app_role) AND 
  can_modify_admin_role(user_id, 'DELETE')
);

-- Add data retention and anonymization functions
CREATE OR REPLACE FUNCTION public.anonymize_old_sessions()
RETURNS void AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;