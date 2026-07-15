import type { ActingLikelihood } from './facts/actingLikelihood';
import type { ActingBasis } from './facts/actingBasis';

/**
 * The status an advisor (or the AI) records per row. One controlled vocabulary
 * for every section, used identically on screen and in the memo:
 *   - 'Not triggered'          tested against the facts and clean (green check).
 *   - 'N/A'                     does not apply: a satisfied scope/definition gate,
 *                               or a condition that is moot because the trigger
 *                               above it is absent (muted green).
 *   - 'Triggered'              a mismatch condition actually fires (amber).
 *   - 'Insufficient information' reachable but the facts needed are missing
 *                               (amber outline). Never used on a moot condition.
 * The "so what" lives in the reasoning, so a reader never has to guess what a
 * bare status meant.
 */
export type Status = 'Not triggered' | 'N/A' | 'Triggered' | 'Insufficient information';

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
 * One backing source the AI names for a row, shown in the per-row source panel
 * (internal view only, like provenance):
 *   - 'on_file': a session document that supports the deciding fact; note says
 *     what it confirms.
 *   - 'missing': a document or fact NOT in the file that holds up an
 *     "Insufficient information" outcome; note says what it would settle.
 * Rows generated before prompt v5 have no sources; the panel then falls back to
 * the derived/mootness explanation and the raw provenance trail.
 */
export interface AppendixRowSource {
  kind: 'on_file' | 'missing';
  name: string;
  note: string | null;
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
  sources?: AppendixRowSource[];  // AI-named backing documents; internal-only, absent on pre-v5 rows
  /**
   * True when the row carries the "model did not return a grounded answer"
   * fallback (F2): the section call failed, or the row was never returned even
   * after the coverage-retry. The UI/export must show this as an explicit
   * "not assessed" signal (amber outline), never as a normal status chip, even
   * when the mootness backstop later stamps it 'N/A'.
   */
  ungrounded?: boolean;
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

export type FactStatus = 'proposed' | 'confirmed';
export type FactSource = 'chart' | 'ai' | 'edited';

/** One entity in the register; the anchor every other exhibit references by `id`. */
export interface FactEntity {
  id: string;                // stable cross-ref label, e.g. "E1"
  chartEntityId: string;     // atad2_structure_entities.id
  name: string;
  jurisdiction: string | null;
  entityType: string | null;
  role: 'Taxpayer' | 'Parent' | 'Subsidiary' | 'Group entity';
  ownershipPct: number | null; // parent: effective stake in the taxpayer; subsidiary: taxpayer's effective stake (chain-multiplied)
  related: boolean;            // meets the related-party (associated enterprise) test (any basis below)
  /**
   * WHY the entity is related, when it is (F7). 'pct' = the >25% ownership test;
   * 'consolidation_2_24b' = the 2:24b Dutch Civil Code group (consolidation /
   * de-facto control, even at 0% shares); 'acting_together' = samenwerkende groep;
   * 'manual' = advisor asserted it. Set from the factsheet's related_to_taxpayers
   * basis. An entity with 0% but a consolidation basis is related=true. Undefined
   * on non-related entities (and legacy data). Rendering groups on this, never on
   * the bare percentage.
   */
  relatednessBasis?: 'pct' | 'consolidation_2_24b' | 'acting_together' | 'manual';
  /** Tax identification number (RSIN/TIN), from the factsheet; drives duplicate detection (F9a). */
  tin?: string | null;
  /** Other names the same entity appears under across documents, from the factsheet (F9a). */
  aliases?: string[];
  /**
   * For a Group entity that is associated only through a common parent: the
   * register id (e.g. "E3") of that common parent, and its effective stake in this
   * entity. Null for parents/subsidiaries (their link to the taxpayer is direct).
   */
  relatedVia?: string | null;
  relatedViaPct?: number | null;
  /**
   * Parent/Subsidiary only: true when a single ownership edge connects the
   * taxpayer (or a fiscal-unity member) and this entity; false when the link
   * runs through intermediate entities (indirect). Undefined on other roles.
   */
  directLink?: boolean;
  /**
   * Group entity only: one short AI-written clause on how this entity relates
   * to the taxpayer (e.g. a co-investor in a named fund), grounded on the
   * documents. Null when the documents give nothing.
   */
  position?: string | null;
  /**
   * AI-derived from the documents: this entity holds shares directly in the
   * taxpayer even though the chart has no ownership edge (e.g. share counts
   * without percentages). Display-level: the data role stays Group entity.
   */
  shareholderOfTaxpayer?: boolean;
  nlTaxStatus: string | null;  // AI/advisor filled; null until proposed
  /** AI-written, grounded one-liner on how the NL qualification was reached (legal form + rule applied). */
  nlTaxStatusReason?: string | null;
  /**
   * Advisor overrides for the editable register fields. The base fields above are
   * rebuilt from the chart/AI on every regeneration; anything set here wins and is
   * preserved across regeneration (keyed by chartEntityId, like `hidden`).
   * relationType/relatedPct override the relation-to-the-taxpayer line (and the
   * Related % column); the *Reason keys override the reasoning shown under the
   * relation, NL-classification and home-state blocks in the register detail.
   */
  edits?: {
    jurisdiction?: string | null;
    entityType?: string | null;
    nlTaxStatus?: string | null;
    relationType?: string | null;
    /** Advisor override for the short role label shown next to the name (e.g. "Group
     *  company" → "Customer"). Wins over the derived characterisation in roleLabel. */
    roleLabel?: string | null;
    relatedPct?: number | null;
    relationReason?: string | null;
    nlReason?: string | null;
    localReason?: string | null;
    /**
     * Advisor's explicit membership of the "Related" (relevant) set, overriding the
     * derived relevance. 'in' promotes an otherwise-Other entity into the relevant
     * list; 'out' demotes an otherwise-relevant entity to Other. Absent = follow the
     * derived relevance test. Distinct from `hidden` (client visibility).
     */
    relevanceOverride?: 'in' | 'out';
    /**
     * Advisor dismissed the inline "home-state classification required" flag: the
     * foreign (home-state) classification is not relevant for this entity, without
     * recording a transparent / non-transparent view.
     */
    localNotRelevant?: boolean;
  };
  /**
   * Advisor added this entity by hand (not derived from the structure chart). It has
   * no chart counterpart, so regeneration must carry it over rather than rebuild it;
   * removing it deletes it outright instead of demoting it to "Other".
   */
  manual?: boolean;
  /** Advisor has marked this entity irrelevant; dropped from all client-facing exports. */
  hidden?: boolean;
  /** True on the synthetic taxpayer that represents a fiscal unity. */
  isFiscalUnity?: boolean;
  /** On the fiscal-unity entity: the chart entity ids of its members. */
  memberEntityIds?: string[];
  /** On a member row: the register id (e.g. "E1") of the fiscal unity it belongs to. */
  memberOfUnityId?: string;
  /**
   * AI-derived (from the documents): this entity forms a Dutch fiscal unity
   * (fiscale eenheid) with the taxpayer E1, so it is part of the same NL taxpayer.
   * Set by the facts step when there is no explicitly drawn fiscal-unity grouping.
   */
  inTaxpayerFiscalUnity?: boolean;
}

export interface ActingTogetherCluster {
  id: string;                  // "A1"
  memberEntityIds: string[];   // the parents/shareholders the assessment concerns; advisor-editable
  combinedPct: number | null;
  likelihood: ActingLikelihood;   // advisor-selectable level
  reasoning: string;           // the displayed assessment paragraph; editable
  /**
   * AI-prepared assessment text per likelihood level, so switching the level
   * swaps the displayed reasoning without a new AI call. Missing on old data
   * or after heavy advisor edits; switching then keeps the current text.
   */
  rationales?: Partial<Record<ActingLikelihood, string>>;
  excludedFromClient: boolean;
  /**
   * The advisor's explicit annex decision, overriding the likelihood-derived
   * default. Undefined = follow the default (likely or higher is shown in the
   * client annex). Set to true to disclose an unlikely grouping anyway, or false
   * to leave a likely one out. See actingInClientAnnex.
   */
  includeInClient?: boolean;
  /**
   * How this grouping came to be:
   *   'manual' - the advisor built it in the group builder. Manual groups are the
   *              leading input: they (and only they) flow to the client appendix
   *              and the memo. See actingInClientReport.
   *   'ai'/undefined - a non-binding suggestion from the documents (legacy or a
   *              hint). It never reaches the client on its own; the advisor adopts
   *              it into a manual group first.
   */
  origin?: 'ai' | 'manual';
  /** Manual groups: the legal basis (grondslag) category driving the suggestion text. */
  basis?: ActingBasis;
  /** Manual groups: the advisor-given group name (e.g. "The Jansen family"). */
  name?: string;
  /** Manual groups: the entity whose voting rights/capital the group acts over (fills [target]). */
  targetEntityId?: string | null;
  source: 'ai' | 'edited';
}

export interface ClassificationItem {
  entityId: string;            // "E4"
  homeState: string;
  homeClass: string;           // transparent | opaque | disregarded | ...
  sourceState: string | null;
  sourceClass: string | null;
  hybrid: boolean;             // homeClass != sourceClass
  status: FactStatus;
  excludedFromClient: boolean;
  source: 'ai' | 'edited';
}

/** One characteristic's answer. 'tbd' = to be determined; 'na' only on the quad ones. */
export type TriState = 'yes' | 'no' | 'tbd';
export type QuadState = TriState | 'na';
/** The two buckets a transaction lands in, derived from the characteristics below. */
export type TxStatus = 'needs' | 'no_risk';

/**
 * The advisor-editable substance of a transaction's ATAD2 assessment. Cross-border
 * is context (a precondition); the four mismatch categories are what actually make
 * a flow "needs assessment". Any category answered Yes or To be determined keeps the
 * flow in "Needs assessment"; all cleared (No / N/A) yields "No risk identified".
 *
 * Unset fields fall back to a seed derived from the facts (jurisdictions,
 * classifications) and the AI funnel flag, so an untouched transaction reproduces
 * the AI's original bucket. `statusOverride` lets the advisor force the bucket
 * regardless of the characteristics, with a mandatory reason.
 *
 * Purely advisor-authored: the AI never writes this. Preserved across regeneration
 * because any edit stamps the transaction `source: 'edited'` (see mergeFacts).
 */
export interface TransactionAssessment {
  crossBorder?: TriState;
  hybridInstrument?: TriState;
  hybridEntityMismatch?: QuadState;
  importedMismatch?: QuadState;
  permanentEstablishment?: QuadState;   // disregarded-PE / branch mismatch
  /** Free-text rationale shown in the panel and carried into the memo line. */
  rationale?: string | null;
  /**
   * Advisor rationale per assessment line (keyed by characteristic), so each
   * answer can carry its own documented justification instead of one catch-all
   * note. Included in the memo reason line next to `rationale`.
   */
  lineRationales?: Partial<Record<
    'crossBorder' | 'hybridInstrument' | 'hybridEntityMismatch' | 'importedMismatch' | 'permanentEstablishment',
    string
  >>;
  /** Advisor's explicit bucket, overriding the derived one. Null/absent = follow the characteristics. */
  statusOverride?: TxStatus | null;
  /** Required whenever statusOverride is set: why the advisor overrode the derived status. */
  overrideReason?: string | null;
}

export interface TransactionItem {
  id: string;                  // "T1"
  fromEntityId: string;
  toEntityId: string;
  kind: string;                // financing | service | royalty | dividend | ...
  instrument: string | null;
  note: string | null;
  articlesTested: string[];    // ["12aa(1)(a)","12ad"]
  /** AI-proposed funnel relevance; seeds the assessment when untouched. Missing = relevant. */
  relevant?: boolean;
  /** Short AI reason why this flow is (not) relevant for ATAD2; the memo fallback when untouched. */
  relevanceReason?: string | null;
  /** Advisor's editable characteristics + status override (see TransactionAssessment). */
  assessment?: TransactionAssessment;
  /** Advisor added this flow by hand (not AI-identified); carried across regeneration, deletable outright. */
  manual?: boolean;
  status: FactStatus;
  excludedFromClient: boolean;
  source: 'ai' | 'edited';
}

/**
 * The Part A exhibits an advisor can drop from the client export as a whole
 * ("make transparent"): the section-level counterpart of the per-item
 * excludedFromClient flag. Internal working copies still show every section.
 */
export type AppendixSectionKey =
  | 'entityRegister'
  | 'relatedness'
  | 'actingTogether'
  | 'classification'
  | 'transactions';

/** One connective sentence per funnel section; AI-drafted, advisor-editable. */
export interface Narrative {
  text: string;
  source: 'ai' | 'edited';
}

export type NarrativeKey = 'register' | 'related' | 'flows' | 'classification';

export interface AppendixFacts {
  entities: FactEntity[];
  actingTogether: ActingTogetherCluster[];
  classifications: ClassificationItem[];
  transactions: TransactionItem[];
  /** Whole Part A sections the advisor excluded from the client export. */
  excludedSections?: AppendixSectionKey[];
  /**
   * Chart-derived entities the advisor deleted outright. They are removed from
   * `entities` immediately; their chartEntityId is recorded here so a later
   * regeneration can skip re-adding them (a manual entity has no chart id, so it
   * simply never comes back).
   */
  removedChartEntityIds?: string[];
  /**
   * Deterministic validation warnings (F6/F8/F9a): shareholder percentages that
   * do not sum to ~100%, transactions whose borrower disagrees with the
   * factsheet, and duplicate entities (shared TIN/alias). Shown quietly on the
   * Facts page and NEVER in the client export. Advisory only; nothing is changed.
   */
  warnings?: string[];
  /** Per-section connective sentences (max ~2 sentences each). */
  narratives?: Partial<Record<NarrativeKey, Narrative>>;
  /**
   * True once a successful facts pass produced its acting-together assessment,
   * even when the result is an empty group. Distinguishes a trusted, cacheable
   * empty from a not-yet-run one, so the appendix is not regenerated on revisit.
   */
  actingTogetherSettled?: boolean;
}

/** The atad2_appendix row shape (rows stored as JSONB). */
export interface StoredAppendix {
  id: string;
  session_id: string;
  /** Fingerprint of the effective answer set the run used; null on legacy dossiers. */
  answers_fingerprint: string | null;
  review_status: ReviewStatus;
  generation_status: GenerationStatus;
  rows: AppendixRow[];
  facts: AppendixFacts | null;
  facts_skipped: boolean;
  checklist_skipped: boolean;
  model: string | null;
  prompt_version: number | null;
  error_message: string | null;
  generated_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  updated_at: string | null;
}
