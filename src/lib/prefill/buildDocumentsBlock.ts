import { supabase } from "@/integrations/supabase/client";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface ImageRef {
  doc_label: string;
  storage_path: string;
  mime_type: string;
  relevance_note: string | null;
}

export interface DocumentsBundle {
  textBlock: string;
  imageRefs: ImageRef[];
  taxpayerName: string;
  fiscalYear: string;
}

/**
 * Fetch all session documents and split them into:
 *  - textBlock: canonical <document …> XML for text-extractable docs (PDF/DOCX
 *    are already text-extracted at upload time; CSV/TXT/MD are raw text)
 *  - imageRefs: storage pointers for PNG/JPG/WEBP, sent to the edge function
 *    which downloads + base64-encodes them as Anthropic image content blocks.
 *
 * Also pulls the session's user-entered taxpayer_name and fiscal_year so the
 * swarm can anchor on them instead of guessing the taxpayer from a docless
 * image (e.g. a structure chart with 7 NL entities and no metadata).
 */
export async function buildDocumentsBlock(sessionId: string): Promise<DocumentsBundle> {
  const [{ data: docs }, { data: session }] = await Promise.all([
    supabase
      .from("atad2_session_documents")
      .select("id, doc_label, category, storage_path, relevance_note, mime_type")
      .eq("session_id", sessionId),
    supabase
      .from("atad2_sessions")
      .select("taxpayer_name, fiscal_year")
      .eq("session_id", sessionId)
      .maybeSingle(),
  ]);

  const taxpayerName = (session?.taxpayer_name ?? "").trim();
  const fiscalYear = (session?.fiscal_year ?? "").toString().trim();

  if (!docs || docs.length === 0) {
    return { textBlock: "", imageRefs: [], taxpayerName, fiscalYear };
  }

  const imageRefs: ImageRef[] = [];
  const textPromises: Promise<string | null>[] = [];

  for (const d of docs) {
    if (IMAGE_MIME_TYPES.has(d.mime_type)) {
      imageRefs.push({
        doc_label: d.doc_label,
        storage_path: d.storage_path,
        mime_type: d.mime_type,
        relevance_note: d.relevance_note,
      });
      continue;
    }
    textPromises.push((async () => {
      const { data: file } = await supabase.storage
        .from("session-documents")
        .download(d.storage_path);
      if (!file) return null;
      const text = await file.text();
      const noteAttr = d.relevance_note
        ? ` relevance_note="${String(d.relevance_note).replace(/"/g, "'")}"`
        : "";
      return `<document doc_label="${d.doc_label}" category="${d.category}"${noteAttr}>\n${text}\n</document>`;
    })());
  }

  const docTexts = await Promise.all(textPromises);
  const textBlock = docTexts.filter(Boolean).join("\n\n");

  return { textBlock, imageRefs, taxpayerName, fiscalYear };
}
