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
        ? ` relevance_note="${String(d.relevance_note).replace(/"/g, "'")}"`
        : "";
      return `<document doc_label="${d.doc_label}" category="${d.category}"${noteAttr}>\n${text}\n</document>`;
    }),
  );

  return docTexts.filter((t): t is string => t !== null).join("\n\n");
}
