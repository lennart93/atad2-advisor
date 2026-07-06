#!/usr/bin/env bash
# Factsheet-pipeline FASE 2 — edge functions op de self-hosted Supabase VM.
#
# Draai op de VM als root via:
#   & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke `
#     --resource-group rg-atad2-prod --name adn-x-s-5 `
#     --command-id RunShellScript `
#     --scripts "@supabase/deploy/deploy_factsheet_phase2.sh" `
#     --query "value[0].message" -o tsv
#
# VOORWAARDE: draai fase-1 (deploy_factsheet_phase1.sh) EERST — de functions
# schrijven naar atad2_document_facts / atad2_session_factsheet en de nieuwe
# prefill-kolommen.
#
# LET OP (DASH-pad + _shared): de mount-source is
#   /root/supabase-docker/volumes/functions   (DASH, geen slash!)
# en `_shared/factsheetSchema.ts` MOET mee-gesynct worden, want extract-docfacts
# en build-factsheet importeren het via `../_shared/factsheetSchema.ts`. Zonder
# _shared falen die twee functions bij container-start.
set -euo pipefail

SRC=/root/atad2-advisor/supabase/functions
DST=/root/supabase-docker/volumes/functions

# Verifieer de mount-source vóór we syncen (voorkomt de shadow-folder-fout).
echo "==== mount check ===="
docker inspect supabase-edge-functions --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'

sync_dir () {
  local name="$1"
  echo "==== rsync $name ===="
  rsync -av --delete "$SRC/$name/" "$DST/$name/"
}

sync_dir _shared
sync_dir extract-docfacts
sync_dir build-factsheet
sync_dir prefill-documents

echo "==== restart edge container ===="
docker restart "$(docker ps --filter name=supabase-edge-functions -q)"
sleep 4

echo "==== md5 verificatie (repo vs container) ===="
verify () {
  local rel="$1"
  local a b
  a=$(md5sum "$SRC/$rel" | awk '{print $1}')
  b=$(docker exec supabase-edge-functions md5sum "/home/deno/functions/$rel" | awk '{print $1}')
  if [ "$a" = "$b" ]; then echo "OK   $rel"; else echo "FAIL $rel ($a != $b)"; fi
}
verify _shared/factsheetSchema.ts
verify extract-docfacts/index.ts
verify build-factsheet/index.ts
verify prefill-documents/analyze.ts
verify prefill-documents/schemas.ts

echo "==== klaar ===="
echo "Volgorde hierna: (3) frontend via Azure App Service, (4) prompt v18 pas NA deze deploy:"
echo "    deploy_factsheet_phase4.sh  ->  20260706170000_swarm_prompt_v18_factsheet.sql"
