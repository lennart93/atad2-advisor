#!/bin/bash
echo "=== id ==="
id
echo "=== docker ps ==="
docker ps --format '{{.Names}}' 2>&1
echo "=== locate supabase dirs ==="
find / -maxdepth 5 -type d \( -name 'supabase' -o -name 'functions' \) 2>/dev/null | head -30
echo "=== home dirs ==="
ls -la /home/ 2>&1
echo "=== containers with 'supabase' or 'edge' in name ==="
docker ps -a --format '{{.Names}} | {{.Mounts}}' 2>&1 | grep -iE 'supabase|edge|functions' | head
