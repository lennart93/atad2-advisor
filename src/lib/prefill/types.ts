export const DOCUMENT_CATEGORIES = [
  { value: "financial_statements", label: "Financial statements" },
  { value: "tax_returns", label: "Tax returns" },
  { value: "local_file", label: "Local file" },
  { value: "master_file", label: "Master file" },
  { value: "previous_year_atad2_analysis", label: "Previous year ATAD2 analysis" },
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
  "text/plain", "text/csv", "text/markdown",
] as const;

export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_SESSION_BYTES = 200 * 1024 * 1024;

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
}
