-- Grant admin role to lw@atlas.tax if user exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'lw@atlas.tax'
ON CONFLICT (user_id, role) DO NOTHING;