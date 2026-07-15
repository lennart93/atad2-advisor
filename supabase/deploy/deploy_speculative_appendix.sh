#!/usr/bin/env bash
# Deploy speculatieve bijlage-generatie (spec 2026-07-14). Draaien op de VM via
# az run-command. Volgorde: migratie -> edge functions -> daarna frontend via
# Azure App Service (apart, NOOIT op de VM).
set -euo pipefail

cd /root/atad2-advisor && git pull

# 1. Migratie (idempotent; tabellen zijn van supabase_admin)
docker exec -i $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260714130000_answers_fingerprint_columns.sql

# 2. Edge functions: _shared + extract-structure + generate-appendix (DASH-pad!)
for fn in _shared extract-structure generate-appendix; do
  rsync -av --delete "/root/atad2-advisor/supabase/functions/$fn/" \
    "/root/supabase-docker/volumes/functions/$fn/"
done
docker restart $(docker ps --filter name=supabase-edge-functions -q)
sleep 5

# 3. Verificatie: volledige mappen (les van het prod-incident 7 jul) + md5
for fn in extract-structure generate-appendix; do
  echo "== $fn =="
  ls "/root/atad2-advisor/supabase/functions/$fn" | wc -l
  docker exec $(docker ps --filter name=supabase-edge-functions -q) sh -c "ls /home/deno/functions/$fn | wc -l"
done
md5sum /root/atad2-advisor/supabase/functions/_shared/effectiveAnswers.ts
docker exec $(docker ps --filter name=supabase-edge-functions -q) \
  md5sum /home/deno/functions/_shared/effectiveAnswers.ts
