#!/bin/bash
# Phase 1: deploy the prefill-documents Edge Function files to the VM.
# Does NOT set any secrets. Run Phase 2 for that.
set -e

TARGET="/root/supabase-docker/volumes/functions/prefill-documents"
TARBALL="/tmp/prefill.tgz"

# The base64 payload gets appended to this script by scripts/gen-deploy-payload.sh
B64_PAYLOAD="__B64_PLACEHOLDER__"

echo "=== writing and decoding tarball ==="
echo "$B64_PAYLOAD" | base64 -d > "$TARBALL"
ls -la "$TARBALL"

echo "=== extracting to $TARGET (replacing existing) ==="
mkdir -p "$(dirname "$TARGET")"
rm -rf "$TARGET"
tar -xzf "$TARBALL" -C "$(dirname "$TARGET")"
ls -la "$TARGET"

echo "=== cleaning up temp tarball ==="
rm -f "$TARBALL"

echo "=== restarting supabase-edge-functions container ==="
docker restart supabase-edge-functions
echo "done, container state:"
docker ps --format '{{.Names}} :: {{.Status}}' | grep edge-functions || true

echo "=== DONE phase 1 ==="
