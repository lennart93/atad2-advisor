#!/usr/bin/env bash
# Deploy the prefill-documents Edge Function to the self-hosted Supabase on the VM.
#
# Prerequisites on your local machine:
#   - ssh in PATH (built into Windows 10+ and all Linux/Mac)
#   - scp in PATH (ditto)
#   - The SSH key at: C:/Users/adn356/OneDrive - Svalner Atlas/Documenten/ATAD2/Docker/ATAD2_key.pem
#   - Your Anthropic API key ready to paste when asked
#
# Run from the project root:
#   bash scripts/deploy-prefill-function.sh
#
# What it does:
#   1. Copies supabase/functions/prefill-documents/ → VM ~/supabase/docker/volumes/functions/prefill-documents/
#   2. Ensures ANTHROPIC_API_KEY is in the VM's ~/supabase/docker/.env
#   3. Restarts the edge-runtime container so it picks up the new code + env
#   4. Runs a quick health check
#
# The script is idempotent — you can re-run it after local changes to sync new code.

set -euo pipefail

KEY="C:/Users/adn356/OneDrive - Svalner Atlas/Documenten/ATAD2/Docker/ATAD2_key.pem"
HOST="azureuser@135.225.104.142"
REMOTE_FN_DIR='~/supabase/docker/volumes/functions/prefill-documents'
LOCAL_FN_DIR='supabase/functions/prefill-documents'

if [[ ! -f "$KEY" ]]; then
  echo "ERROR: SSH key not found at $KEY"
  exit 1
fi

if [[ ! -d "$LOCAL_FN_DIR" ]]; then
  echo "ERROR: Run this from the project root. Local function dir $LOCAL_FN_DIR not found."
  exit 1
fi

# Ensure private key has correct permissions (Git Bash on Windows sometimes messes this up)
chmod 600 "$KEY" 2>/dev/null || true

echo "==> Ensuring remote directory exists"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p $REMOTE_FN_DIR"

echo "==> Copying function source files"
scp -i "$KEY" \
  "$LOCAL_FN_DIR"/*.ts \
  "$LOCAL_FN_DIR"/*.json \
  "$HOST":"$REMOTE_FN_DIR/"

echo "==> Configuring ANTHROPIC_API_KEY (skipped if already present)"
# Use the key from local .env.local if present. If it isn't, that's fine —
# the VM almost always already has the key; we only error if NEITHER has it.
ANTHROPIC_KEY=""
if [[ -f .env.local ]] && grep -q '^ANTHROPIC_API_KEY=' .env.local; then
  ANTHROPIC_KEY="$(grep '^ANTHROPIC_API_KEY=' .env.local | cut -d= -f2-)"
  echo "    Found ANTHROPIC_API_KEY in .env.local"
else
  echo "    No ANTHROPIC_API_KEY in .env.local — will rely on the VM's existing key."
fi

ssh -i "$KEY" "$HOST" bash <<EOF
set -e
cd ~/supabase/docker
touch .env
if grep -q '^ANTHROPIC_API_KEY=' .env; then
  echo "    VM .env already has ANTHROPIC_API_KEY — leaving as-is."
elif [[ -n "$ANTHROPIC_KEY" ]]; then
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" >> .env
  echo "    Appended ANTHROPIC_API_KEY to VM .env"
else
  echo "ERROR: VM .env has no ANTHROPIC_API_KEY and none was provided locally."
  echo "       Add ANTHROPIC_API_KEY=sk-ant-... to .env.local and re-run."
  exit 1
fi
EOF

echo "==> Restarting edge-runtime container"
ssh -i "$KEY" "$HOST" bash <<'EOF'
set -e
cd ~/supabase/docker
# Discover the edge-runtime service name (varies across Supabase releases)
SERVICE=$(docker compose ps --services | grep -Ei 'functions|edge-runtime' | head -1)
if [[ -z "$SERVICE" ]]; then
  echo "ERROR: Could not find edge-runtime / functions service in docker compose"
  exit 1
fi
echo "    Restarting service: $SERVICE"
docker compose restart "$SERVICE"
EOF

echo "==> Done."
echo ""
echo "Quick smoke test (optional — replace <JWT> with a real Supabase session token):"
echo "  curl -X POST https://api.atad2.tax/functions/v1/prefill-documents \\"
echo "    -H 'Authorization: Bearer <JWT>' -H 'Content-Type: application/json' \\"
echo "    -d '{\"action\":\"cleanup\",\"session_id\":\"<session_id>\"}'"
