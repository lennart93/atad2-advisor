#!/usr/bin/env bash
# Factsheet-pipeline FASE 1 — DB-migraties op de self-hosted Supabase VM.
#
# Draai op de VM als root via:
#   & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke `
#     --resource-group rg-atad2-prod --name adn-x-s-5 `
#     --command-id RunShellScript `
#     --scripts "@supabase/deploy/deploy_factsheet_phase1.sh" `
#     --query "value[0].message" -o tsv
#
# Vereist een actief PIM-venster (VM-rechten). Bij AuthorizationFailed:
# PIM opnieuw activeren en nog eens draaien — dit script is idempotent.
#
# Migraties draaien als supabase_admin (tabellen zijn eigendom van supabase_admin,
# NIET postgres). ON_ERROR_STOP=1 stopt bij de eerste fout.
set -euo pipefail

REPO=/root/atad2-advisor
DB=$(docker ps --filter name=supabase-db -q)

run_migration () {
  local f="$1"
  echo "==== applying $f ===="
  docker exec -i "$DB" \
    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    < "$REPO/supabase/migrations/$f"
}

run_migration 20260706160000_document_facts_table.sql
run_migration 20260706161000_session_factsheet_table.sql
run_migration 20260706162000_prefill_widen_and_factsheet_columns.sql
run_migration 20260706163000_factsheet_prompt_seeds.sql

echo "==== verificatie ===="
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select 'atad2_document_facts'    as tbl, count(*) from atad2_document_facts
  union all
  select 'atad2_session_factsheet' as tbl, count(*) from atad2_session_factsheet;
"
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select conname, pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid = 'public.atad2_question_prefills'::regclass
    and conname in (
      'atad2_question_prefills_suggested_toelichting_check',
      'atad2_question_prefills_suggested_toelichting_unknown_check',
      'atad2_question_prefills_answer_rationale_check'
    )
  order by conname;
"
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select column_name from information_schema.columns
  where table_name = 'atad2_question_prefills'
    and column_name in ('factsheet_version','evidence')
  order by column_name;
"
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select key, version, model, is_active
  from atad2_prompts
  where key in ('docfacts_extract_system','factsheet_merge_system')
  order by key;
"
echo "==== klaar ===="
