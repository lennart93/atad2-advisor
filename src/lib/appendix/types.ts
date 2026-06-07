/** The decision an advisor (or the AI) records per row. Gateway rows use the gateway variants. */
export type Decision =
  | 'Not applicable'
  | 'Potentially applicable'
  | 'Further information needed'
  | 'In scope'
  | 'Out of scope'
  | 'Yes'
  | 'No';

/** A fixed row in the legal framework. Never generated; lives in skeleton.ts. */
export interface SkeletonRow {
  rowId: string;            // e.g. "1.b"
  sectionId: string;        // e.g. "1"
  sectionTitle: string;     // e.g. "Mismatch categories, art. 12aa(1)(a)-(g)"
  legalFramework: string;   // citation + short English label, verbatim
  effect: 'D/NI' | 'DD' | null;
  allowedStates: Decision[];
  drivenByQuestionIds: string[]; // question_ids that, if changed, flag this row stale
  /** Render only when this answer matches. Undefined = always render. */
  renderIfQuestionEquals?: { questionId: string; equals: string };
  flags?: Array<'contested' | 'unverified'>;
}

/** One stored row: the AI output plus the current (possibly edited) value and audit state. */
export interface AppendixRow {
  rowId: string;
  aiDecision: Decision | null;
  aiReasoning: string | null;
  aiReference: string | null;
  decision: Decision | null;     // current; equals ai* until edited
  reasoning: string | null;
  reference: string | null;
  source: 'ai' | 'edited';
  stale: boolean;
  staleReason: string | null;
  editedBy: string | null;       // user id
  editedAt: string | null;       // ISO timestamp
}

export type ReviewStatus = 'draft' | 'confirmed';
export type GenerationStatus = 'generating' | 'ready' | 'error';

/** The atad2_appendix row shape (rows stored as JSONB). */
export interface StoredAppendix {
  id: string;
  session_id: string;
  review_status: ReviewStatus;
  generation_status: GenerationStatus;
  rows: AppendixRow[];
  model: string | null;
  prompt_version: number | null;
  error_message: string | null;
  generated_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
}
