#!/usr/bin/env bash
# Deploys the client_question change-set (open-questions register wording +
# swarm prompt v12) to the self-hosted Supabase on the VM. Run on the VM as
# root via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @deploy_client_question_v12.sh \
#     --query "value[0].message" -o tsv
#
# Four steps, IN THIS ORDER (schema -> edge function -> prompt; the why is in
# docs/drafts/2026-06-10-client-question-prompt-note.md):
#   1. Apply 20260610210000_open_question_events_check_widening.sql
#      (event vocabulary incl. 'undismissed').
#   2. Apply 20260610220000_prefill_client_question_column.sql
#      (landing column + register trigger + get_active_prompt_version RPC).
#   3. rsync the prefill-documents edge function (schemas.ts + analyze.ts
#      changed) and restart the container, with md5 verification.
#   4. Apply 20260610220100_swarm_prompt_v12_client_question.sql
#      (activates v12; only now does the model emit client_question).
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
echo "=== 1. Apply event-vocabulary widening (incl. 'undismissed') ==="
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < /root/atad2-advisor/supabase/migrations/20260610210000_open_question_events_check_widening.sql
echo "CHECKPOINT step 1 done: atad2_open_question_events CHECK widened."

echo ""
echo "=== 2. Apply client_question column + trigger + gating RPC ==="
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < /root/atad2-advisor/supabase/migrations/20260610220000_prefill_client_question_column.sql
echo "CHECKPOINT step 2 done: schema ready, nothing writes the column yet."

echo ""
echo "=== 3. rsync prefill-documents edge function ==="
# Verify the mount source first (DASH path, not the slash shadow folder).
docker inspect supabase-edge-functions --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'
rsync -av --delete \
  /root/atad2-advisor/supabase/functions/prefill-documents/ \
  /root/supabase-docker/volumes/functions/prefill-documents/

docker restart supabase-edge-functions
sleep 4
docker ps --filter name=supabase-edge-functions --format 'table {{.Names}}\t{{.Status}}'

for f in "prefill-documents/analyze.ts" "prefill-documents/schemas.ts"; do
  HOST=$(md5sum /root/atad2-advisor/supabase/functions/$f | awk '{print $1}')
  CONT=$(docker exec supabase-edge-functions md5sum /home/deno/functions/$f | awk '{print $1}')
  if [ "$HOST" = "$CONT" ]; then
    echo "OK   $f  $HOST"
  else
    echo "DIFF $f  host=$HOST container=$CONT"
    exit 1
  fi
done
echo "CHECKPOINT step 3 done: edge function live (v11 still active, field stays null)."

echo ""
echo "=== 4. Apply swarm prompt v12 (client_question) ==="
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < /root/atad2-advisor/supabase/migrations/20260610220100_swarm_prompt_v12_client_question.sql
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT key, version, is_active, left(notes, 60) AS notes FROM public.atad2_prompts WHERE key='prefill_swarm_system' ORDER BY version DESC LIMIT 3;"
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT public.get_active_prompt_version('prefill_swarm_system') AS live_version;"
echo "CHECKPOINT step 4 done: v12 active."

echo ""
echo "=== DONE. 'Prepare client questions' unlocks by itself (RPC now returns 12); existing dossiers get wording via that button; new swarm runs write client_question automatically. ==="
