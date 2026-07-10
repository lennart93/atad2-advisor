import { supabase } from "@/integrations/supabase/client";

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const PDF_MIME_TYPE = "application/pdf";

// Strip control chars + escape XML so a malicious document can't break out
// of <document> tags and inject system instructions into the LLM prompt.
const escapeXmlText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeXmlAttr = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface ImageRef {
  doc_label: string;
  storage_path: string;
  mime_type: string;
  relevance_note: string | null;
}

// Raw PDFs end up here when browser-side text extraction failed or returned
// too little to be useful (scanned, image-only, certain signed Deloitte
// outputs). The edge function downloads + base64-encodes them as Anthropic
// "document" content blocks so Claude can OCR them natively.
export interface PdfRef {
  doc_label: string;
  storage_path: string;
  relevance_note: string | null;
}

export interface DocumentsBundle {
  textBlock: string;
  imageRefs: ImageRef[];
  pdfRefs: PdfRef[];
  taxpayerName: string;
  fiscalYear: string;
}

export interface BuildDocumentsOptions {
  /**
   * Trim the raw documents because the verified fact sheet is available and is
   * the primary source (see useStartAnalyze / the re-run). Without this, a big
   * dossier ships ~180k tokens of raw documents on EVERY question call, which is
   * slow enough to time out and trip the stall watchdog. With the fact sheet in
   * hand the raw docs are backup, so we:
   *   - drop the bulk line-item dumps (general_ledger, trial_balance) whose facts
   *     are already distilled into the fact sheet,
   *   - drop raw PDFs (extract-docfacts already OCR'd them into the fact sheet),
   *   - cap each remaining document so one giant statement cannot dominate.
   */
  trim?: boolean;
}

/** Categories whose raw text is line-item noise once the fact sheet exists. */
const TRIM_DROP_CATEGORIES = new Set(["general_ledger", "trial_balance"]);
/** Per-document character cap when trimming (keeps the substantive head of each). */
const TRIM_MAX_DOC_CHARS = 40_000;

/**
 * Fetch all session documents and split them into:
 *  - textBlock: canonical <document …> XML for text-extractable docs (most
 *    PDF/DOCX are already text-extracted at upload time; CSV/TXT/MD are raw)
 *  - imageRefs: storage pointers for PNG/JPG/WEBP, sent to the edge function
 *    which downloads + base64-encodes them as Anthropic image content blocks
 *  - pdfRefs: storage pointers for raw PDFs that the browser couldn't read,
 *    sent to the edge function which forwards them to Claude as native
 *    "document" blocks (Anthropic does the OCR work)
 *
 * Also pulls the session's user-entered taxpayer_name and fiscal_year so the
 * swarm can anchor on them instead of guessing the taxpayer from a docless
 * image (e.g. a structure chart with 7 NL entities and no metadata).
 */
export async function buildDocumentsBlock(sessionId: string, opts: BuildDocumentsOptions = {}): Promise<DocumentsBundle> {
  const trim = opts.trim === true;
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
    return { textBlock: "", imageRefs: [], pdfRefs: [], taxpayerName, fiscalYear };
  }

  const imageRefs: ImageRef[] = [];
  const pdfRefs: PdfRef[] = [];
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
    if (d.mime_type === PDF_MIME_TYPE) {
      // Trimming: a raw PDF's facts are already in the fact sheet (extract-docfacts
      // OCR'd it), so drop the heavy native block.
      if (trim) continue;
      pdfRefs.push({
        doc_label: d.doc_label,
        storage_path: d.storage_path,
        relevance_note: d.relevance_note,
      });
      continue;
    }
    // Trimming: skip the line-item dumps whose facts are distilled in the sheet.
    if (trim && TRIM_DROP_CATEGORIES.has(d.category)) continue;
    textPromises.push((async () => {
      const { data: file } = await supabase.storage
        .from("session-documents")
        .download(d.storage_path);
      if (!file) return null;
      let text = await file.text();
      if (trim && text.length > TRIM_MAX_DOC_CHARS) {
        text = `${text.slice(0, TRIM_MAX_DOC_CHARS)}\n[document truncated; full facts are in the verified fact sheet]`;
      }
      const noteAttr = d.relevance_note
        ? ` relevance_note="${escapeXmlAttr(String(d.relevance_note))}"`
        : "";
      return `<document doc_label="${escapeXmlAttr(d.doc_label)}" category="${escapeXmlAttr(d.category)}"${noteAttr}>\n${escapeXmlText(text)}\n</document>`;
    })());
  }

  const docTexts = await Promise.all(textPromises);
  const textBlock = docTexts.filter(Boolean).join("\n\n");

  return { textBlock, imageRefs, pdfRefs, taxpayerName, fiscalYear };
}
