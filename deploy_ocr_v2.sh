#!/bin/bash
set -euo pipefail

echo "=== 1. Pull latest from main ==="
cd /root/atad2-advisor
git fetch origin main
git reset --hard origin/main
git log -1 --oneline

echo ""
echo "=== 2. rsync prefill-documents (only change: analyze.ts) ==="
rsync -av --delete \
  /root/atad2-advisor/supabase/functions/prefill-documents/ \
  /root/supabase-docker/volumes/functions/prefill-documents/

echo ""
echo "=== 3. Restart edge-functions container ==="
docker restart supabase-edge-functions
sleep 4
docker ps --filter name=supabase-edge-functions --format 'table {{.Names}}\t{{.Status}}'

echo ""
echo "=== 4. Verify md5 match (host vs container) ==="
for f in "prefill-documents/analyze.ts"; do
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
echo "=== DONE ==="
