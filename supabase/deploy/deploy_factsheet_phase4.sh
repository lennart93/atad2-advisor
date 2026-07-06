#!/usr/bin/env bash
# Factsheet-pipeline FASE 4 — swarm prompt v18 flip op de VM.
#
# DRAAI DIT PAS NADAT fase-2 (deploy_factsheet_phase2.sh) live is: v18 laat de
# toelichting tot 4000 tekens groeien en emit een evidence-veld. De OUDE
# prefill-documents container (zod-cap 1000) zou die output afkeuren en de rij
# 500'en. Placeholder-regel: eerst de vuller (fase 2), dan de prompt (fase 4).
#
# Draai op de VM als root via:
#   & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke `
#     --resource-group rg-atad2-prod --name adn-x-s-5 `
#     --command-id RunShellScript `
#     --scripts "@supabase/deploy/deploy_factsheet_phase4.sh" `
#     --query "value[0].message" -o tsv
#
# Idempotent: de migratie demote't active < 18, INSERT is NOT EXISTS-guarded en
# een DO-block RAISEt als de v17-ankers niet matchen (dan is v17 op de VM getuned;
# inspecteer de live v17 system_prompt en pas de ankers aan).
set -euo pipefail

REPO=/root/atad2-advisor
DB=$(docker ps --filter name=supabase-db -q)

echo "==== apply swarm v18 ===="
docker exec -i "$DB" \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < "$REPO/supabase/migrations/20260706170000_swarm_prompt_v18_factsheet.sql"

echo "==== verificatie (precies 1 active swarm-row = v18) ===="
docker exec -i "$DB" psql -U supabase_admin -d postgres -c "
  select version, is_active, left(notes, 40) as notes
  from atad2_prompts
  where key = 'prefill_swarm_system'
  order by version desc limit 3;
"
echo "ROLLBACK: update atad2_prompts set is_active=false where key='prefill_swarm_system' and version=18;"
echo "          update atad2_prompts set is_active=true  where key='prefill_swarm_system' and version=17;"
echo "==== klaar ===="
