#!/usr/bin/env bash
# Applies the session revenue-tracking migration to the self-hosted Supabase DB.
# Run on the VM as root via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @deploy_revenue_migration.sh \
#     --query "value[0].message" -o tsv
#
# Additive + idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE), so it is
# safe to run before the frontend deploy and safe to re-run.
set -euo pipefail

DB=$(docker ps --filter name=supabase-db -q)

docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE public.atad2_sessions
  ADD COLUMN IF NOT EXISTS sold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue_eur numeric(12,2),
  ADD COLUMN IF NOT EXISTS revenue_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS revenue_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_set_session_revenue(
  p_session_id TEXT,
  p_sold BOOLEAN,
  p_revenue_eur NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_session_uuid UUID;
  v_sold BOOLEAN := COALESCE(p_sold, false);
BEGIN
  IF NOT public.has_role(v_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_set_session_revenue: caller is not an admin'
      USING ERRCODE = '42501';
  END IF;

  IF p_revenue_eur IS NOT NULL AND p_revenue_eur < 0 THEN
    RAISE EXCEPTION 'admin_set_session_revenue: amount must not be negative'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.atad2_sessions
  SET sold = v_sold,
      revenue_eur = p_revenue_eur,
      revenue_updated_at = NOW(),
      revenue_updated_by = v_admin_id
  WHERE session_id = p_session_id
  RETURNING id INTO v_session_uuid;

  IF v_session_uuid IS NULL THEN
    RAISE EXCEPTION 'admin_set_session_revenue: session % not found', p_session_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, user_id, new_values)
  VALUES (
    'session_revenue_set',
    'atad2_sessions',
    v_session_uuid::text,
    v_admin_id,
    jsonb_build_object('session_id', p_session_id, 'sold', v_sold, 'revenue_eur', p_revenue_eur)
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id, 'sold', v_sold, 'revenue_eur', p_revenue_eur,
    'updated_by', v_admin_id, 'updated_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_session_revenue(TEXT, BOOLEAN, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_session_revenue(TEXT, BOOLEAN, NUMERIC) TO authenticated;

-- Make PostgREST pick up the new columns + RPC immediately.
NOTIFY pgrst, 'reload schema';
SQL

echo "=== columns ==="
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='atad2_sessions' AND column_name IN ('sold','revenue_eur','revenue_updated_at','revenue_updated_by') ORDER BY column_name;"

echo "=== function ==="
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT proname, pg_get_function_identity_arguments(oid) AS args FROM pg_proc WHERE proname='admin_set_session_revenue';"

echo "DONE"
