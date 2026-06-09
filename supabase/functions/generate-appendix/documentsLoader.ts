// Server-side documents-block loader for the appendix facts proposal.
// Mirror of supabase/functions/extract-structure/documentsLoader.ts so the
// facts proposal sees the same <document doc_label="..." ...> format. Built
// server-side with the service-role client.

import type { SupabaseClient } from "supabase";

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
