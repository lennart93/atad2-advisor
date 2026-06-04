#!/bin/bash
set -euo pipefail

DB_CONTAINER=$(docker ps --filter name=supabase-db -q)
if [ -z "$DB_CONTAINER" ]; then
  echo "ERROR: supabase-db container not found"
  exit 1
fi

echo "DB container: $DB_CONTAINER"

cat <<'SQL' | docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1
ALTER TABLE atad2_structure_edges
  ADD COLUMN IF NOT EXISTS label_t real;

COMMENT ON COLUMN atad2_structure_edges.label_t IS
  'User-dragged label position along edge: 0 = source, 1 = target, NULL = auto.';

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'atad2_structure_edges' AND column_name = 'label_t';
SQL

echo "OK"
