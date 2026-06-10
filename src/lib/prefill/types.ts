export const DOCUMENT_CATEGORIES = [
  { value: "financial_statements", label: "Financial statements" },
  { value: "tax_returns", label: "Tax returns" },
  { value: "structure_chart", label: "Structure chart" },
  { value: "previous_year_atad2_analysis", label: "Previous year ATAD2 analysis" },
  { value: "client_correspondence", label: "Client correspondence" },
  { value: "local_file", label: "Local file" },
  { value: "master_file", label: "Master file" },
  { value: "trial_balance", label: "Trial balance" },
  { value: "general_ledger", label: "General ledger" },
  { value: "memo", label: "Memo" },
  { value: "comment_letter_to_tax_return", label: "Comment letter to tax return" },
  { value: "other", label: "Other" },
] as const;

export const RELEVANCE_NOTE_MIN_LENGTH = 30;

export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number]["value"];

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "text/plain", "text/csv", "text/markdown",
  "application/rtf", "text/rtf",
] as const;

// Browsers report .rtf inconsistently: application/rtf, text/rtf, sometimes
// application/msword, and sometimes an empty string. We therefore detect RTF by
// file extension and never trust the MIME alone. RTF is text-extracted in the
// browser at upload time (see useUploadDocument), so it travels through the rest
// of the pipeline as text/plain.
export function isRtfFile(file: { name: string; type: string }): boolean {
  return /\.rtf$/i.test(file.name)
    || file.type === "application/rtf"
    || file.type === "text/rtf";
}

// Browsers report .xlsm (macro-enabled Excel) inconsistently: the proper
// application/vnd.ms-excel.sheet.macroEnabled.12, the legacy
// application/vnd.ms-excel, application/octet-stream, or "". Detect Excel by
// extension. .xlsx and .xlsm share the OOXML format and are both extracted to
// text in the browser (see useUploadDocument), travelling onward as text/plain.
export function isExcelFile(file: { name: string; type: string }): boolean {
  return /\.xls[xm]$/i.test(file.name)
    || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || file.type === "application/vnd.ms-excel.sheet.macroEnabled.12";
}

// PowerPoint .pptx detection (extension or the presentationml MIME). Extracted
// to text in the browser (see useUploadDocument) and travels onward as text/plain.
export function isPptxFile(file: { name: string; type: string }): boolean {
  return /\.pptx$/i.test(file.name)
    || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

// A dropped/selected file is accepted if its MIME is on the allow-list OR it is
// a .rtf / Excel / PowerPoint file (whose MIME is unreliable). Use this, not a
// bare MIME check.
export function isAcceptedUpload(file: { name: string; type: string }): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)
    || isRtfFile(file)
    || isExcelFile(file)
    || isPptxFile(file);
}

// Value for the <input accept> attribute. Includes the office extensions so the
// OS file picker surfaces them even on systems that map them to an unlisted MIME.
export const FILE_INPUT_ACCEPT = [
  ...ACCEPTED_MIME_TYPES, ".rtf", ".docx", ".xlsx", ".xlsm", ".pptx",
].join(",");

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_SESSION_BYTES = 100 * 1024 * 1024;

export interface SourceRef {
  document_id: string;
  doc_label: string;
  location: string;
}

export type PrefillUserAction = "pending" | "accepted" | "edited" | "dismissed" | "moved_to_additional_context";

export interface QuestionPrefill {
  id: string;
  session_id: string;
  question_id: string;
  suggested_toelichting: string | null;
  source_refs: SourceRef[];
  verbatim_quote: string | null;
  user_action: PrefillUserAction;
  actioned_at: string | null;
  created_at: string;
  suggested_answer: "yes" | "no" | "unknown" | null;
  confidence_pct: number | null;
  answer_rationale: string | null;
  contextual_hint: string | null;
  // v9 companion to contextual_hint. Populated when contextual_hint is, holds
  // the user-voice "it is unknown..." version of the same dossier facts that
  // the SuggestionCard renders when the user picks Unknown on this question.
  suggested_toelichting_unknown: string | null;
  // Snapshot of the exact text the user accepted (Accept) or edited-then-saved (Edit).
  // Falls back to suggested_toelichting for historical rows where the column is null.
  committed_text: string | null;
}

export type PrefillJobStatus =
  | "queued" | "stage1_running" | "stage2_running"
  | "completed" | "failed" | "cancelled";

export interface PrefillJob {
  id: string;
  session_id: string;
  status: PrefillJobStatus;
  started_at: string | null;
  stage1_finished_at: string | null;
  stage2_finished_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  total_token_usage: { input_tokens: number; output_tokens: number } | null;
  locked_at: string | null;
  // Ticked ~20s by the browser swarm while it runs; NULL on legacy rows.
  heartbeat_at: string | null;
}

export interface SessionDocument {
  id: string;
  session_id: string;
  filename: string;
  doc_label: string;
  category: DocumentCategory;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "summarizing" | "summarized" | "failed";
  error_message: string | null;
  relevance_note: string | null;
  created_at: string;
  is_thin: boolean;
  category_source: "filename" | "ai" | "user";
}
