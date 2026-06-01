#!/usr/bin/env bash
# One-shot deploy for swarm prompt v10 (taxpayer + fiscal_year anchoring).
#
# What this does:
#   1. SCP the latest prefill-documents edge function source to the VM
#      and restart the edge-runtime container.
#   2. Apply migration 20260601200000_swarm_prompt_v10_assessment_context.sql
#      on the self-hosted Postgres (via docker exec).
#   3. Verify v10 is active and v9 is not.
#
# Run from project root:
#   bash scripts/deploy-prefill-v10.sh
#
# Prereqs (same as scripts/deploy-prefill-function.sh):
#   - SSH key at: C:/Users/adn356/OneDrive - Svalner Atlas/Documenten/ATAD2/Docker/ATAD2_key.pem
#   - Branch feat/document-prefill already pushed to origin with v10 migration.
#
# Idempotent — re-running won't double-apply (the migration is "UPDATE … SET
# is_active = false; INSERT v10" which fails-safe on the unique key if v10
# already exists; check the verify step's output if you want certainty).

set -euo pipefail

KEY="C:/Users/adn356/OneDrive - Svalner Atlas/Documenten/ATAD2/Docker/ATAD2_key.pem"
HOST="azureuser@135.225.104.142"
REPO_ON_VM='~/atad2-advisor'
REMOTE_FN_DIR='~/supabase/docker/volumes/functions/prefill-documents'
LOCAL_FN_DIR='supabase/functions/prefill-documents'
MIGRATION='supabase/migrations/20260601200000_swarm_prompt_v10_assessment_context.sql'

if [[ ! -f "$KEY" ]]; then echo "ERROR: SSH key not found at $KEY"; exit 1; fi
if [[ ! -d "$LOCAL_FN_DIR" ]]; then echo "ERROR: Run from project root"; exit 1; fi
if [[ ! -f "$MIGRATION" ]]; then echo "ERROR: Migration $MIGRATION not found"; exit 1; fi

chmod 600 "$KEY" 2>/dev/null || true

echo "==> 1/4  Sync edge function source to VM"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p $REMOTE_FN_DIR"
scp -i "$KEY" "$LOCAL_FN_DIR"/*.ts "$LOCAL_FN_DIR"/*.json "$HOST":"$REMOTE_FN_DIR/"

echo "==> 2/4  Restart edge-runtime container"
ssh -i "$KEY" "$HOST" bash <<'EOF'
set -e
cd ~/supabase/docker
SERVICE=$(docker compose ps --services | grep -Ei 'functions|edge-runtime' | head -1)
if [[ -z "$SERVICE" ]]; then echo "ERROR: edge-runtime service not found"; exit 1; fi
echo "    Restarting: $SERVICE"
docker compose restart "$SERVICE"
EOF

echo "==> 3/4  Pull latest feat/document-prefill on VM + apply v10 migration"
ssh -i "$KEY" "$HOST" bash <<EOF
set -e
cd $REPO_ON_VM
git fetch origin
git checkout feat/document-prefill
git pull --ff-only origin feat/document-prefill
echo "    Repo now at: \$(git log -1 --oneline)"

DB=\$(docker ps --filter name=supabase-db -q | head -1)
if [ -z "\$DB" ]; then echo "ABORT: supabase-db container not found"; exit 1; fi

echo "    Applying $MIGRATION"
docker exec -i "\$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < $MIGRATION
echo "    Migration applied."
EOF

echo "==> 4/4  Verify v10 is active"
ssh -i "$KEY" "$HOST" bash <<'EOF'
set -e
DB=$(docker ps --filter name=supabase-db -q | head -1)
docker exec "$DB" psql -U postgres -d postgres -t -c \
  "SELECT version, is_active FROM atad2_prompts WHERE key='prefill_swarm_system' AND version IN (9,10) ORDER BY version;"
EOF

echo ""
echo "==> Done. v10 should show is_active = t, v9 should show is_active = f."
echo "    Test by re-running prefill on a session — the contextual_hint should"
echo "    now use the taxpayer_name you typed instead of asking which entity is"
echo "    the Dutch taxpayer."
