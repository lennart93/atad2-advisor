#!/usr/bin/env bash
# Applies the ownership-edge label position/hide migration to the self-hosted
# Supabase DB. Run on the VM as root via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @deploy_edge_label_position.sh \
#     --query "value[0].message" -o tsv
#
# Additive + idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to run before
# the frontend deploy and safe to re-run.
set -euo pipefail

DB=$(docker ps --filter name=supabase-db -q)

docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE public.atad2_structure_edges
  ADD COLUMN IF NOT EXISTS label_dx real,
  ADD COLUMN IF NOT EXISTS label_dy real,
  ADD COLUMN IF NOT EXISTS label_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.atad2_structure_edges.label_dx IS
  'User-dragged horizontal label offset from anchor, chart px. NULL = auto.';
COMMENT ON COLUMN public.atad2_structure_edges.label_dy IS
  'User-dragged vertical label offset from anchor, chart px. NULL = auto.';
COMMENT ON COLUMN public.atad2_structure_edges.label_hidden IS
  'Hide the % label on the chart (value still feeds the memo). Default false.';

-- Make PostgREST expose the new columns immediately.
NOTIFY pgrst, 'reload schema';
SQL

echo "=== columns ==="
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='atad2_structure_edges' AND column_name IN ('label_dx','label_dy','label_hidden') ORDER BY column_name;"

echo "DONE"
