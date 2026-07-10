#!/usr/bin/env bash
# Password-reset fix — send-auth-email edge function op de self-hosted Supabase VM.
#
# WAAROM: de reset-mail bevatte een eenmalige verify-link die door de Outlook
# Safe Links-scanner van Microsoft 365 al bij bezorging werd geopend, waardoor
# de token verbruikt was voor de gebruiker kon klikken (#error=otp_expired).
# De mail bevat nu een 6-cijferige code (zoals signup); de frontend verifieert
# die via verifyOtp(type: "recovery").
#
# VOLGORDE: frontend EERST naar Azure (nieuwe /reset-password met code-invoer),
# DAARNA dit script. Andersom mailt de VM codes die de oude frontend niet kan
# verwerken.
#
# Draai op de VM als root via:
#   & "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke `
#     --resource-group rg-atad2-prod --name adn-x-s-5 `
#     --command-id RunShellScript `
#     --scripts "@supabase/deploy/deploy_send_auth_email.sh" `
#     --query "value[0].message" -o tsv
#
# VOORWAARDE: /root/atad2-advisor staat op de commit met de nieuwe
# send-auth-email/index.ts (git pull na de push naar main).
set -euo pipefail

SRC=/root/atad2-advisor/supabase/functions
DST=/root/supabase-docker/volumes/functions

echo "==== git state repo op VM ===="
git -C /root/atad2-advisor log -1 --oneline

# Verifieer de mount-source vóór we syncen (voorkomt de shadow-folder-fout).
echo "==== mount check ===="
docker inspect supabase-edge-functions --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'

echo "==== rsync send-auth-email ===="
rsync -av --delete "$SRC/send-auth-email/" "$DST/send-auth-email/"

echo "==== restart edge container ===="
docker restart "$(docker ps --filter name=supabase-edge-functions -q)"
sleep 4

echo "==== md5 + volledigheid (repo vs container) ===="
a=$(md5sum "$SRC/send-auth-email/index.ts" | awk '{print $1}')
b=$(docker exec supabase-edge-functions md5sum /home/deno/functions/send-auth-email/index.ts | awk '{print $1}')
if [ "$a" = "$b" ]; then echo "OK   send-auth-email/index.ts"; else echo "FAIL send-auth-email/index.ts ($a != $b)"; fi
echo "bestanden in repo-map:      $(ls "$SRC/send-auth-email" | wc -l)"
echo "bestanden in container-map: $(docker exec supabase-edge-functions ls /home/deno/functions/send-auth-email | wc -l)"

echo "==== boot-smoke: container logs (laatste 20 regels) ===="
docker logs --tail 20 "$(docker ps --filter name=supabase-edge-functions -q)"

echo "==== klaar ===="
