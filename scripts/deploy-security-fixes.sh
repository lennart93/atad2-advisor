#!/bin/bash
# Deploy H1 + M1 + M2 + M3 security fixes to the self-hosted Supabase VM.
#
# Inlines all SQL + the patched documentsLoader.ts so we do not depend on a
# git pull. Run from a workstation via:
#
#   az vm run-command invoke \
#     --resource-group rg-atad2-prod --name adn-x-s-5 \
#     --command-id RunShellScript --scripts @scripts/deploy-security-fixes.sh
#
# Idempotent — re-running is safe (DROP IF EXISTS / CREATE OR REPLACE everywhere).

set -e

DB=$(docker ps --filter name=supabase-db -q | head -1)
EDGE=$(docker ps --filter name=supabase-edge-functions -q | head -1)
if [ -z "$DB" ]; then echo "ABORT: supabase-db container not found"; exit 1; fi
if [ -z "$EDGE" ]; then echo "ABORT: supabase-edge-functions container not found"; exit 1; fi
EXTRACT_DIR=/root/supabase/docker/volumes/functions/extract-structure

mkdir -p /tmp/security-fixes

echo '=== H1: restrict signup domain (auth.users trigger) ==='
cat > /tmp/security-fixes/h1.sql <<'SQL_EOF'
CREATE OR REPLACE FUNCTION public.enforce_signup_email_domain()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $func$
BEGIN
  IF NEW.email IS NULL OR NEW.email !~* '@svalneratlas\.com$' THEN
    RAISE EXCEPTION
      'Sign-ups are restricted to @svalneratlas.com email addresses'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$func$;

REVOKE ALL ON FUNCTION public.enforce_signup_email_domain() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_signup_email_domain ON auth.users;

CREATE TRIGGER enforce_signup_email_domain
  BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_signup_email_domain();

COMMENT ON FUNCTION public.enforce_signup_email_domain() IS
  'Rejects auth.users rows whose email is not @svalneratlas.com. Mirrors the client-side check in src/pages/Auth.tsx so the restriction holds against direct API calls.';
SQL_EOF
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/security-fixes/h1.sql

echo
echo '=== M1: storage policies require session ownership ==='
cat > /tmp/security-fixes/m1.sql <<'SQL_EOF'
DROP POLICY IF EXISTS "Users can read their own session documents"   ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own session documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own session documents" ON storage.objects;

CREATE POLICY "Users can read their own session documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.atad2_sessions s
      WHERE s.session_id = (storage.foldername(name))[2]
        AND s.user_id    = auth.uid()
    )
  );

CREATE POLICY "Users can upload their own session documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.atad2_sessions s
      WHERE s.session_id = (storage.foldername(name))[2]
        AND s.user_id    = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own session documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'session-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.atad2_sessions s
      WHERE s.session_id = (storage.foldername(name))[2]
        AND s.user_id    = auth.uid()
    )
  );
SQL_EOF
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/security-fixes/m1.sql

echo
echo '=== M2: audit trigger on atad2_prompts ==='
cat > /tmp/security-fixes/m2.sql <<'SQL_EOF'
CREATE TABLE IF NOT EXISTS public.atad2_prompts_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id    uuid,
  prompt_key   text,
  version      integer,
  action       text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_row      jsonb,
  new_row      jsonb,
  changed_by   uuid,
  db_role      text NOT NULL,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atad2_prompts_audit_prompt_id_idx
  ON public.atad2_prompts_audit (prompt_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS atad2_prompts_audit_changed_at_idx
  ON public.atad2_prompts_audit (changed_at DESC);

ALTER TABLE public.atad2_prompts_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read prompt audit log" ON public.atad2_prompts_audit;
CREATE POLICY "Admins can read prompt audit log"
  ON public.atad2_prompts_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.log_atad2_prompts_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $func$
DECLARE
  v_prompt_id  uuid;
  v_prompt_key text;
  v_version    integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_prompt_id  := OLD.id;
    v_prompt_key := OLD.key;
    v_version    := OLD.version;
  ELSE
    v_prompt_id  := NEW.id;
    v_prompt_key := NEW.key;
    v_version    := NEW.version;
  END IF;

  INSERT INTO public.atad2_prompts_audit
    (prompt_id, prompt_key, version, action, old_row, new_row, changed_by, db_role)
  VALUES (
    v_prompt_id,
    v_prompt_key,
    v_version,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    auth.uid(),
    current_user
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$func$;

REVOKE ALL ON FUNCTION public.log_atad2_prompts_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS atad2_prompts_audit_trigger ON public.atad2_prompts;

CREATE TRIGGER atad2_prompts_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.atad2_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_atad2_prompts_change();

COMMENT ON TABLE public.atad2_prompts_audit IS
  'Append-only audit log of every change to atad2_prompts. Populated by a SECURITY DEFINER trigger so service-role and superuser writes are captured.';
SQL_EOF
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/security-fixes/m2.sql

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
