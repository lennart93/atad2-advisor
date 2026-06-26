#!/usr/bin/env bash
# Immediate mitigation for the compose_client_letter "composition incomplete"
# 500: flip the active prompt back from v3 (grouped/merge) to v2 (flat).
#
# WHY THIS IS SAFE WITHOUT AN EDGE REDEPLOY:
#   The currently deployed edge parses the grouped shape first and FALLS BACK to
#   the legacy flat schema + normalizeLegacyComposedLetter. v2 emits the flat
#   shape, so every question becomes a single-id question -> each input id is
#   covered exactly once -> the coverage guard passes trivially. No 500.
#
# NOTE: atad2_prompts is owned by supabase_admin, so use -U supabase_admin
#       (-U postgres fails with "must be owner of table atad2_prompts").
# NOTE: loadActivePrompt caches the active prompt for ~60s, so allow up to a
#       minute (or an edge cold start) before the flip takes effect.
#
# Run from the VM via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @scripts/revert-compose-letter-v2.sh \
#     --query "value[0].message" -o tsv
set -euo pipefail

docker exec -i "$(docker ps --filter name=supabase-db -q)" \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
UPDATE atad2_prompts SET is_active = false
  WHERE key = 'compose_client_letter' AND version = 3;
UPDATE atad2_prompts SET is_active = true
  WHERE key = 'compose_client_letter' AND version = 2;
SELECT version, is_active
  FROM atad2_prompts
  WHERE key = 'compose_client_letter'
  ORDER BY version;
SQL
