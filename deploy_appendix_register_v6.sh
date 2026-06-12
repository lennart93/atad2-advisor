#!/usr/bin/env bash
# Deploys the entity-register graph-walk + fiscal-unity-from-docs change to the
# self-hosted Supabase on the VM. Run on the VM as root via:
#   az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @deploy_appendix_register_v6.sh \
#     --query "value[0].message" -o tsv
#
# Two idempotent steps:
#   1. Apply the appendix_facts_system v6 prompt (in-place UPDATE; re-runnable).
#   2. rsync the generate-appendix edge function (index.ts + factsBuild.ts +
#      factsSchemas.ts changed) and restart the container.
#
# By default it deploys whatever is on origin/main. To test the feature branch
# BEFORE merging, set GIT_REF, e.g. GIT_REF=origin/feat/technical-appendix.
set -eu

GIT_REF="${GIT_REF:-origin/main}"

echo "=== 1. Pull ${GIT_REF} ==="
cd /root/atad2-advisor
git fetch origin
git reset --hard "${GIT_REF}"
git log -1 --oneline

echo ""
echo "=== 2. Apply appendix_facts_system v9 prompt (idempotent) ==="
DB=$(docker ps --filter name=supabase-db -q)
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < /root/atad2-advisor/supabase/migrations/20260609220000_appendix_facts_prompt_v9_all_parents.sql
docker exec "$DB" psql -U supabase_admin -d postgres -c \
  "SELECT key, version, left(notes, 60) AS notes FROM public.atad2_prompts WHERE key='appendix_facts_system' AND is_active = true;"

echo ""
echo "=== 3. rsync generate-appendix edge function ==="
# Verify the mount source first (DASH path, not the slash shadow folder).
docker inspect supabase-edge-functions --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'
rsync -av --delete \
  /root/atad2-advisor/supabase/functions/generate-appendix/ \
  /root/supabase-docker/volumes/functions/generate-appendix/

echo ""
echo "=== 4. Restart edge-functions container ==="
docker restart supabase-edge-functions
sleep 4
docker ps --filter name=supabase-edge-functions --format 'table {{.Names}}\t{{.Status}}'

echo ""
echo "=== 5. Verify md5 match (host vs container) ==="
for f in "generate-appendix/index.ts" "generate-appendix/factsBuild.ts" "generate-appendix/factsSchemas.ts"; do
  HOST=$(md5sum /root/atad2-advisor/supabase/functions/$f | awk '{print $1}')
  CONT=$(docker exec supabase-edge-functions md5sum /home/deno/functions/$f | awk '{print $1}')
  if [ "$HOST" = "$CONT" ]; then
    echo "OK   $f  $HOST"
  else
    echo "DIFF $f  host=$HOST container=$CONT"
    exit 1
  fi
done

echo ""
echo "=== DONE. Open an assessment's appendix and click Regenerate to rebuild stored facts. ==="
