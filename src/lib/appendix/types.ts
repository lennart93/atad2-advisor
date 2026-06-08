/**
 * The status an advisor (or the AI) records per row. One controlled vocabulary
 * for every section: each skeleton row is phrased as a testable condition, and
 * the status says whether that condition is triggered. The "so what" lives in a
 * separate Legal consequence field, so a reader never has to guess what a bare
 * Yes/No meant.
 */
export type Status = 'Not triggered' | 'Triggered' | 'Insufficient information';

/** A fixed row in the legal framework. Never generated; lives in skeleton.ts / the DB. */
export interface SkeletonRow {
  rowId: string;            // e.g. "3.2"
  sectionId: string;        // e.g. "3"
  sectionTitle: string;     // e.g. "Primary rule: hybrid mismatches (art. 12aa)"
  legalBasis: string;       // the citation only, e.g. "Article 12aa(1)(b) Wet Vpb 1969"
  conditionTested: string;  // the test, phrased as a condition, in plain English
  effect: 'D/NI' | 'DD' | null;
  allowedStates: Status[];
  drivenByQuestionIds: string[]; // question_ids that, if changed, flag this row stale
  /** Render only when this answer matches. Undefined = always render. */
  renderIfQuestionEquals?: { questionId: string; equals: string };
}

/**
 * One stored row: the AI output plus the current (possibly edited) value and audit
 * state. Two reference tracks are kept on purpose: factualBasis is the clean,
 * verifiable fact that goes into the client/dossier export, while provenance holds
 * the raw internal trail (answer ids, edge ids) and never leaves the internal view.
 */
export interface AppendixRow {
  rowId: string;
  aiStatus: Status | null;
  aiConsequence: string | null;
  aiFactualBasis: string | null;
  aiProvenance: string | null;
  status: Status | null;          // current; equals ai* until edited
  consequence: string | null;     // the legal consequence that follows from the status
  factualBasis: string | null;    // clean, verifiable fact (export-safe)
  provenance: string | null;      // internal-only raw trail, excluded from export
  source: 'ai' | 'edited';
  stale: boolean;
  staleReason: string | null;
  editedBy: string | null;        // user id
  editedAt: string | null;        // ISO timestamp
}

/** The editable fields on a row (provenance is internal, read-only). */
export type EditableField = 'status' | 'consequence' | 'factualBasis';

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
  updated_at: string | null;
}
