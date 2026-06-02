#!/usr/bin/env bash
# Deploy a Supabase Edge Function to the self-hosted Supabase on the Azure VM.
#
# Usage:
#   bash scripts/deploy-edge-function.sh <function-name>
#
# Example:
#   bash scripts/deploy-edge-function.sh extract-structure
#
# Prerequisites:
#   - ssh + scp in PATH (built-in on Windows 10+, Linux, Mac)
#   - SSH key at: C:/Users/adn356/OneDrive - Svalner Atlas/Documenten/ATAD2/Docker/ATAD2_key.pem
#
# What it does:
#   1. Recursively syncs supabase/functions/<name>/ → VM ~/supabase/docker/volumes/functions/<name>/
#      (recursive, so subfolders like prompts/ come along)
#   2. Restarts the edge-runtime container so it picks up the new code
#   3. Prints a curl smoke-test command
#
# Idempotent — re-run after local edits to sync.

set -euo pipefail

FN_NAME="${1:-}"
if [[ -z "$FN_NAME" ]]; then
  echo "Usage: bash scripts/deploy-edge-function.sh <function-name>"
  exit 1
fi

KEY="C:/Users/adn356/OneDrive - Svalner Atlas/Documenten/ATAD2/Docker/ATAD2_key.pem"
HOST="azureuser@135.225.104.142"
LOCAL_FN_DIR="supabase/functions/$FN_NAME"
REMOTE_FN_DIR="~/supabase/docker/volumes/functions/$FN_NAME"

if [[ ! -f "$KEY" ]]; then
  echo "ERROR: SSH key not found at $KEY"
  exit 1
fi

if [[ ! -d "$LOCAL_FN_DIR" ]]; then
  echo "ERROR: Local function dir $LOCAL_FN_DIR not found. Run from project root."
  exit 1
fi

chmod 600 "$KEY" 2>/dev/null || true

echo "==> Ensuring remote directory exists"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p $REMOTE_FN_DIR"

echo "==> Recursively syncing $LOCAL_FN_DIR/ → $REMOTE_FN_DIR/"
# -r recursive; copies everything under the function dir (top-level + subfolders).
scp -i "$KEY" -r "$LOCAL_FN_DIR"/. "$HOST":"$REMOTE_FN_DIR/"

echo "==> Restarting edge-runtime container"
ssh -i "$KEY" "$HOST" bash <<'EOF'
set -e
cd ~/supabase/docker
SERVICE=$(docker compose ps --services | grep -Ei 'functions|edge-runtime' | head -1)
if [[ -z "$SERVICE" ]]; then
  echo "ERROR: Could not find edge-runtime / functions service in docker compose"
  exit 1
fi
echo "    Restarting service: $SERVICE"
docker compose restart "$SERVICE"
EOF

echo "==> Done. Function deployed: $FN_NAME"
echo ""
echo "Smoke test (replace <JWT> + <SESSION_UUID>):"
echo "  curl -X POST https://api.atad2.tax/functions/v1/$FN_NAME \\"
echo "    -H 'Authorization: Bearer <JWT>' -H 'Content-Type: application/json' \\"
echo "    -d '{\"session_id\":\"<SESSION_UUID>\"}'"
