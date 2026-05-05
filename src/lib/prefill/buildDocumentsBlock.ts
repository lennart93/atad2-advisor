import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all session documents and assemble them into the canonical
 * <document …> XML block used by both the swarm prefill and memo
 * generation prompts. Returns "" when no docs exist.
 *
 * Format mirrors what useStartAnalyze already produces in iter 3 so the
 * model sees the same shape across both prompts.
 */
export async function buildDocumentsBlock(sessionId: string): Promise<string> {
  const { data: docs } = await supabase
    .from("atad2_session_documents")
    .select("id, doc_label, category, storage_path, relevance_note")
    .eq("session_id", sessionId);

  if (!docs || docs.length === 0) return "";

  const docTexts = await Promise.all(
    docs.map(async (d) => {
      const { data: file } = await supabase.storage
        .from("session-documents")
        .download(d.storage_path);
      if (!file) return null;
      const text = await file.text();
      const noteAttr = d.relevance_note
        ? ` relevance_note="${String(d.relevance_note).replace(/"/g, "'")}"`
        : "";
      return `<document doc_label="${d.doc_label}" category="${d.category}"${noteAttr}>\n${text}\n</document>`;
    })
  );

  return docTexts.filter(Boolean).join("\n\n");
}
