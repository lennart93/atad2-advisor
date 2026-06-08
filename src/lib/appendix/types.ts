/**
 * The status an advisor (or the AI) records per row. One controlled vocabulary
 * for every section: each skeleton row is phrased as a testable condition, and
 * the status says whether that condition is triggered. The "so what" lives in a
 * separate Legal consequence field, so a reader never has to guess what a bare
 * Yes/No meant.
 */
export type Status = 'Not triggered' | 'Triggered' | 'Insufficient information';

/**
 * Whether a triggered row is a real ATAD2 adjustment ('operative': a deduction is
 * denied, income included, double deduction) or just an informational
 * condition/threshold ('gate': scope, definitions, classification). Only operative
 * rows get the red/green traffic light; gate rows stay neutral.
 */
export type RowKind = 'gate' | 'operative';

/**
 * How the related-parties / associated-enterprise data is surfaced on a row:
 * 'none' = nothing, 'popover' = a compact list in the sources popover,
 * 'inline' = a full-width annotated association panel under the row (the
 * associated-enterprise showcase on the art. 12ac relatedness row).
 */
export type RelatedView = 'none' | 'popover' | 'inline';

/** A fixed row in the legal framework. Never generated; lives in skeleton.ts / the DB. */
export interface SkeletonRow {
  rowId: string;            // e.g. "3.2"
  sectionId: string;        // e.g. "3"
  sectionTitle: string;     // e.g. "Primary rule: hybrid mismatches (art. 12aa)"
  legalBasis: string;       // the citation only, e.g. "Article 12aa(1)(b) CIT Act"
  conditionTested: string;  // the test, phrased as a condition, in plain English
  effect: 'D/NI' | 'DD' | null;
  kind: RowKind;
  allowedStates: Status[];
  drivenByQuestionIds: string[]; // question_ids that, if changed, flag this row stale
  /** Render only when this answer matches. Undefined = always render. */
  renderIfQuestionEquals?: { questionId: string; equals: string };
  relatedView: RelatedView;
}

/**
 * One stored row: the AI output plus the current (possibly edited) value and audit
 * state. reasoning is the clean, export-safe narrative (the supporting fact and the
 * legal consequence in one), while provenance holds the raw internal trail (answer
 * ids, edge ids) and never leaves the internal view.
 */
export interface AppendixRow {
  rowId: string;
  aiStatus: Status | null;
  aiReasoning: string | null;
  aiProvenance: string | null;
  status: Status | null;          // current; equals ai* until edited
  reasoning: string | null;       // fact + legal consequence in one, export-safe
  provenance: string | null;      // internal-only raw trail, excluded from export
  excludedFromClient: boolean;    // advisor hid this row; dropped + renumbered in the client export
  source: 'ai' | 'edited';
  stale: boolean;
  staleReason: string | null;
  editedBy: string | null;        // user id
  editedAt: string | null;        // ISO timestamp
}

/** The editable fields on a row (provenance is internal, read-only). */
export type EditableField = 'status' | 'reasoning';

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
