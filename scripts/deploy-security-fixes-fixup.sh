#!/bin/bash
# Fixup pass for deploy-security-fixes.sh:
#   - M2 trigger creation requires owner of public.atad2_prompts (= supabase_admin)
#   - M3 documentsLoader.ts overwrite + edge restart were skipped due to set -e

set -e

DB=$(docker ps --filter name=supabase-db -q | head -1)
EDGE=$(docker ps --filter name=supabase-edge-functions -q | head -1)
if [ -z "$DB" ]; then echo "ABORT: supabase-db container not found"; exit 1; fi
if [ -z "$EDGE" ]; then echo "ABORT: supabase-edge-functions container not found"; exit 1; fi
EXTRACT_DIR=/root/supabase/docker/volumes/functions/extract-structure

mkdir -p /tmp/security-fixes

echo '=== M2 (fixup): create trigger as supabase_admin ==='
cat > /tmp/security-fixes/m2-trigger.sql <<'SQL_EOF'
DROP TRIGGER IF EXISTS atad2_prompts_audit_trigger ON public.atad2_prompts;

CREATE TRIGGER atad2_prompts_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.atad2_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_atad2_prompts_change();

COMMENT ON TABLE public.atad2_prompts_audit IS
  'Append-only audit log of every change to atad2_prompts. Populated by a SECURITY DEFINER trigger so service-role and superuser writes are captured.';
SQL_EOF
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/security-fixes/m2-trigger.sql

echo
echo '=== M3: overwrite documentsLoader.ts with XML-escaping version ==='
mkdir -p "$EXTRACT_DIR"
cat > "$EXTRACT_DIR/documentsLoader.ts" <<'TS_EOF'
// Server-side documents-block loader for the corporate-structure-chart
// extractor.
//
// This mirrors the client-side `src/lib/prefill/buildDocumentsBlock.ts`
// loader so the extractor sees the same `<document doc_label="..." ...>`
// XML-ish format that the prefill swarm sees. The prefill Edge Function
// receives `documents_block` from the client (built browser-side with the
// user's auth context); the extractor instead builds the block server-side
// using the service role client, since the extractor is invoked from
// places where the client may not have shipped a precomputed block.
//
// Format (matches `buildDocumentsBlock.ts`):
//   <document doc_label="..." category="..." [relevance_note="..."]>
//   <file text>
//   </document>
//
// Documents are joined with a blank line. Returns "" if no docs exist.

import type { SupabaseClient } from "supabase";

// Escape XML so document content can't close </document> and inject
// system instructions into the Claude prompt. Mirrors the client-side
// helper in src/lib/prefill/buildDocumentsBlock.ts.
const escapeXmlText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeXmlAttr = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function loadDocumentsBlock(
  client: SupabaseClient,
  sessionId: string,
): Promise<string> {
  const { data: docs, error } = await client
    .from("atad2_session_documents")
    .select("id, doc_label, category, storage_path, relevance_note")
    .eq("session_id", sessionId);

  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  if (!docs || docs.length === 0) return "";

  const docTexts = await Promise.all(
    docs.map(async (d) => {
      const { data: file, error: dlErr } = await client.storage
        .from("session-documents")
        .download(d.storage_path);
      if (dlErr || !file) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "document_download_failed",
          message: dlErr?.message ?? "no file body",
          doc_label: d.doc_label,
          storage_path: d.storage_path,
        }));
        return null;
      }
      const text = await file.text();
      const noteAttr = d.relevance_note
        ? ` relevance_note="${escapeXmlAttr(String(d.relevance_note))}"`
        : "";
      return `<document doc_label="${escapeXmlAttr(d.doc_label)}" category="${escapeXmlAttr(d.category)}"${noteAttr}>\n${escapeXmlText(text)}\n</document>`;
    }),
  );

  return docTexts.filter((t): t is string => t !== null).join("\n\n");
}
TS_EOF
echo "documentsLoader.ts written ($(wc -c < "$EXTRACT_DIR/documentsLoader.ts") bytes)"

echo
echo '=== Restart edge-runtime so it picks up new documentsLoader.ts ==='
docker restart "$EDGE"
docker ps --filter id="$EDGE" --format 'edge-runtime now: {{.Status}}'

echo
echo '=== Verification ==='
echo '-- H1 trigger:'
docker exec "$DB" psql -U postgres -d postgres -t -c \
  "SELECT tgname FROM pg_trigger WHERE tgname = 'enforce_signup_email_domain';"

echo '-- M1 policies (expect 3 rows):'
docker exec "$DB" psql -U postgres -d postgres -t -c \
  "SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'Users can%session documents';"

echo '-- M2 audit table + trigger:'
docker exec "$DB" psql -U postgres -d postgres -t -c \
  "SELECT to_regclass('public.atad2_prompts_audit') IS NOT NULL AS table_present, EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='atad2_prompts_audit_trigger') AS trigger_present;"

echo '-- M3 escape helpers in deployed file:'
grep -c "escapeXmlAttr" "$EXTRACT_DIR/documentsLoader.ts"

echo
echo '=== Done ==='
