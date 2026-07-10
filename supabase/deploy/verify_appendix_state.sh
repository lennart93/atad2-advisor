#!/usr/bin/env sh
# WP0 — READ-ONLY deploy-state verificatie voor de appendix-hardening.
# Wijzigt niets. Draai via:
#   & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke `
#     --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript `
#     --scripts "@supabase/deploy/verify_appendix_state.sh" --query "value[0].message" -o tsv
#
# Rapporteert: (1) actieve promptversies, (2) skeleton allowed_states (N/A aanwezig?),
# (3) md5 van de generate-appendix edge-function-bestanden IN DE CONTAINER (vergelijk
# zelf met de repo). Output = input voor de deploy-beslissing.
set -eu
DB=$(docker ps --filter name=supabase-db -q)

echo "==== 1. actieve promptversies ===="
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select key, version, is_active, left(coalesce(notes,''), 60) as notes
  from atad2_prompts
  where key in ('appendix_system','appendix_facts_system','prefill_swarm_system')
  order by key, version desc;" 2>&1 | sed -n '1,60p'

echo "==== 2. skeleton: aantal actieve rijen + allowed_states (bevat N/A?) ===="
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select count(*) as active_skeleton_rows from atad2_appendix_skeleton where is_active;" 2>&1
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select row_id, allowed_states,
         (allowed_states @> '[\"N/A\"]'::jsonb) as has_na
  from atad2_appendix_skeleton
  where is_active and row_id in ('1.1','2.1','4.1','6.1','6.2','8.1','8.2','8.3')
  order by row_id;" 2>&1

echo "==== 3. generate-appendix bestanden: md5 IN DE CONTAINER ===="
for f in index.ts factsBuild.ts documentsLoader.ts skeletonRows.ts mootness.ts schemas.ts factsSchemas.ts promptsLoader.ts claude.ts; do
  m=$(docker exec supabase-edge-functions md5sum "/home/deno/functions/generate-appendix/$f" 2>/dev/null | awk '{print $1}')
  echo "$m  generate-appendix/$f"
done

echo "==== 4. appendix_system placeholder-check (heeft de actieve prompt {{FACTS_BLOCK}}? sources? N/A?) ===="
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select version,
         (system_prompt like '%{{FACTS_BLOCK}}%')     as has_facts_block,
         (system_prompt like '%{{DOCUMENTS_LIST}}%')   as has_documents_list,
         (system_prompt like '%sources%')              as mentions_sources,
         (system_prompt like '%{{FACTSHEET_BLOCK}}%')  as has_factsheet_block
  from atad2_prompts where key='appendix_system' and is_active;" 2>&1
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select version,
         (system_prompt like '%{{DOCUMENTS_BLOCK}}%')  as has_documents_block,
         (system_prompt like '%{{FACTSHEET_BLOCK}}%')  as has_factsheet_block
  from atad2_prompts where key='appendix_facts_system' and is_active;" 2>&1

echo "==== WP0 DONE ===="
