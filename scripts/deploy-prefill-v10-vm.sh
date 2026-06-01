#!/bin/bash
# VM-side deploy for swarm prompt v10 (taxpayer + fiscal_year anchoring).
#
# Run this INSIDE the VM via Azure portal "Run command" -> RunShellScript,
# or via:
#   az vm run-command invoke \
#     --resource-group rg-atad2-prod \
#     --name ATAD2 \
#     --command-id RunShellScript \
#     --scripts @scripts/deploy-prefill-v10-vm.sh
#
# Mirrors .tmp-deploy.sh's pattern. Assumes:
#   - Repo cloned at /root/atad2-advisor on branch feat/document-prefill
#   - Supabase docker stack at /root/supabase/docker
#   - Containers: supabase-db, supabase-edge-functions

set -e

REPO=/root/atad2-advisor
FUNCDIR=/root/supabase/docker/volumes/functions
DOCKERDIR=/root/supabase/docker
MIGRATION_REL=supabase/migrations/20260601200000_swarm_prompt_v10_assessment_context.sql

DB=$(docker ps --filter name=supabase-db -q | head -1)
EDGE=$(docker ps --filter name=supabase-edge-functions -q | head -1)
if [ -z "$DB" ]; then echo "ABORT: supabase-db container not found"; exit 1; fi
if [ -z "$EDGE" ]; then echo "ABORT: supabase-edge-functions container not found"; exit 1; fi

echo '=== Step 1: pull latest feat/document-prefill ==='
cd "$REPO"
git fetch origin
git checkout feat/document-prefill
git pull --ff-only origin feat/document-prefill
echo "Now at: $(git log -1 --oneline)"

echo
echo '=== Step 2: sync prefill-documents function source ==='
mkdir -p "$FUNCDIR/prefill-documents"
cp -f "$REPO/supabase/functions/prefill-documents/"*.ts "$FUNCDIR/prefill-documents/"
cp -f "$REPO/supabase/functions/prefill-documents/"*.json "$FUNCDIR/prefill-documents/" 2>/dev/null || true
echo "Function source synced:"
ls -la "$FUNCDIR/prefill-documents/" | head

echo
echo '=== Step 3: apply v10 migration ==='
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < "$REPO/$MIGRATION_REL"
echo "Migration applied."

echo
echo '=== Step 4: verify v10 active, v9 not ==='
docker exec "$DB" psql -U postgres -d postgres -t -c \
  "SELECT version, is_active FROM atad2_prompts WHERE key='prefill_swarm_system' AND version IN (9,10) ORDER BY version;"

echo
echo '=== Step 5: restart edge-runtime so it picks up new function source ==='
cd "$DOCKERDIR"
SERVICE=$(docker compose ps --services | grep -Ei 'functions|edge-runtime' | head -1)
if [ -z "$SERVICE" ]; then echo "ERROR: edge-runtime service not found"; exit 1; fi
echo "Restarting service: $SERVICE"
docker compose restart "$SERVICE"

echo
echo '=== Done ==='
echo "Expected verify output: v9 is_active=f, v10 is_active=t"
echo "Test by re-running prefill on a session; the contextual_hint should use"
echo "the taxpayer_name from the Assessment header instead of asking which"
echo "entity is the Dutch taxpayer."
