export const DOCUMENT_CATEGORIES = [
  { value: "financial_statements", label: "Financial Statements" },
  { value: "tax_returns", label: "Tax Returns" },
  { value: "local_file", label: "Local File" },
  { value: "master_file", label: "Master File" },
  { value: "previous_year_atad2_analysis", label: "Previous Year ATAD2 Analysis" },
  { value: "trial_balance", label: "Trial Balance" },
  { value: "general_ledger", label: "General Ledger" },
  { value: "other", label: "Other" },
] as const;

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
  suggested_toelichting: string;
  source_refs: SourceRef[];
  verbatim_quote: string | null;
  user_action: PrefillUserAction;
  actioned_at: string | null;
  created_at: string;
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
  created_at: string;
}
