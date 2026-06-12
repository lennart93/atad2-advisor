#!/usr/bin/env bash
# Deploys the compose_client_letter v3 change-set (edge schema v2 with grouped
# questions + question_ids mapping, legacy-schema fallback, exactly-once-across-ids
# coverage guard, prompt v3) to the self-hosted Supabase on the VM.
# Run on the VM as root via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @deploy_client_letter_v3.sh \
#     --query "value[0].message" -o tsv
#
# Two steps, IN THIS ORDER (edge function -> prompt):
#   1. rsync the prefill-documents edge function (schemas.ts, composeLetter.ts
#      changed: grouped schema v2 parsed first with fallback to the legacy v1
#      schema + server-side normalization) and restart the container, with md5
#      verification.
#   2. Apply 20260612120000_compose_letter_prompt_v3.sql (deactivates prompt
#      versions 1 and 2, inserts v3 as active).
# Either order is actually safe: the new edge still composes with the old v2
# prompt (legacy-schema fallback), and the frontend accepts both response
# shapes, so a half-deployed state keeps working.
#
# Every step is idempotent; if a PIM window expires mid-run, re-activate and
# run the whole script again.
# By default it deploys whatever is on origin/main. To test the feature branch
# BEFORE merging, set GIT_REF, e.g. GIT_REF=origin/feat/client-platform.
set -eu

GIT_REF="${GIT_REF:-origin/main}"

echo "=== 0. Pull ${GIT_REF} ==="
cd /root/atad2-advisor
git fetch origin
git reset --hard "${GIT_REF}"
git log -1 --oneline

DB=$(docker ps --filter name=supabase-db -q)

echo ""
echo "=== 1. rsync prefill-documents edge function ==="
# Verify the mount source first (DASH path, not the slash shadow folder).
docker inspect supabase-edge-functions --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'
rsync -av --delete \
  /root/atad2-advisor/supabase/functions/prefill-documents/ \
  /root/supabase-docker/volumes/functions/prefill-documents/

docker restart supabase-edge-functions
sleep 4
docker ps --filter name=supabase-edge-functions --format 'table {{.Names}}\t{{.Status}}'

for f in "prefill-documents/index.ts" "prefill-documents/prompts.ts" "prefill-documents/schemas.ts" "prefill-documents/composeLetter.ts"; do
  HOST=$(md5sum /root/atad2-advisor/supabase/functions/$f | awk '{print $1}')
  CONT=$(docker exec supabase-edge-functions md5sum /home/deno/functions/$f | awk '{print $1}')
  if [ "$HOST" = "$CONT" ]; then
    echo "OK   $f  $HOST"
  else
    echo "DIFF $f  host=$HOST container=$CONT"
    exit 1
  fi
done
echo "CHECKPOINT step 1 done: edge live; legacy-schema fallback means the old v2 prompt still composes if step 2 has not run yet."

echo ""
echo "=== 2. Apply compose_client_letter prompt v3 (deactivate v1/v2 + insert) ==="
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < /root/atad2-advisor/supabase/migrations/20260612120000_compose_letter_prompt_v3.sql
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT key, version, is_active, left(notes, 60) AS notes FROM public.atad2_prompts WHERE key='compose_client_letter' ORDER BY version DESC LIMIT 4;"
echo "CHECKPOINT step 2 done: prompt v3 active (expect v3 active, v1/v2 inactive above)."

echo ""
echo "=== DONE. Letter now returns intro + grouped questions with question_ids mapping; the frontend accepts old and new shapes so any cached client keeps working. ==="
