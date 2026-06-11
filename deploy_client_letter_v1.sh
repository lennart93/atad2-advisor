#!/usr/bin/env bash
# Deploys the compose_client_letter change-set (prefill-documents edge action
# + prompt v1 with key-CHECK widening) to the self-hosted Supabase on the VM.
# Run on the VM as root via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @deploy_client_letter_v1.sh \
#     --query "value[0].message" -o tsv
#
# Two steps, IN THIS ORDER (edge function -> prompt):
#   1. rsync the prefill-documents edge function (index.ts, prompts.ts,
#      schemas.ts, composeLetter.ts changed) and restart the container,
#      with md5 verification.
#   2. Apply 20260611100000_compose_letter_prompt_v1.sql (widens the
#      atad2_prompts key CHECK from the union of the required keys and the
#      keys already on the VM, then inserts the v1 prompt as active).
# Either order is actually safe: the UI soft-fails on both "Unknown action"
# (edge not deployed) and "No active prompt" (migration not applied) with a
# "Letter composition is not deployed yet" toast.
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
echo "CHECKPOINT step 1 done: edge function live (action exists; prompt may still be missing, UI soft-fails)."

echo ""
echo "=== 2. Apply compose_client_letter prompt v1 (key-CHECK widening + insert) ==="
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < /root/atad2-advisor/supabase/migrations/20260611100000_compose_letter_prompt_v1.sql
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT key, version, is_active, left(notes, 60) AS notes FROM public.atad2_prompts WHERE key='compose_client_letter' ORDER BY version DESC LIMIT 3;"
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT pg_get_constraintdef(oid) AS key_check FROM pg_constraint WHERE conname='atad2_prompts_key_check';"
echo "CHECKPOINT step 2 done: prompt v1 active."

echo ""
echo "=== DONE. 'Compose client letter' in the open-questions panel now returns a composed letter; no schema or n8n changes involved. ==="
