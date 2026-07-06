import {
  CONFIRM_LEAD_IN,
  questionKey,
  startsWithPoliteOpener,
  type ComposedLetter,
  type LetterTable,
} from "./letterShape";
import type { QuestionBranchRow } from "./projectedPath";
import type { OpenQuestionRow } from "./types";
import { formatFiscalYears } from "@/utils/formatFiscalYears";

/**
 * The documents-step worklist: the questions the documents could NOT answer,
 * presented the way they go to a client, "Could you please confirm: 1, 2, 3".
 *
 * The AI compose step merges duplicate/related decision-tree questions into
 * one client question (LetterQuestion.question_ids is the merge mapping), so
 * the advisor sees a few coherent questions instead of dozens of near-
 * identical ones. One answer on a merged question covers EVERY decision-tree
 * question it bundles: the same resolution and the same draft answer are
 * written to each covered node.
 *
 * Pure module: view-model building, gating, the submit fingerprint and the
 * draft-write planner. All side effects live in useDocumentsWorklist.
 */

/** Advisor-facing lifecycle of one open point. */
export type OpenPointStatus =
  | "open"
  | "answered"
  | "sent_to_client"
  | "answered_by_client"
  | "na";

/** How the point is answered: yes/no buttons or free text. */
export type OpenPointAnswerType = "yesno" | "text";

export interface OpenPoint {
  /** Stable id: the merge key (question_ids joined) or a single row id. */
  id: string;
  /** Client-facing question text, merged where the compose step merged. */
  questionText: string;
  /** 1..N position in the visible list; null for the off-path extras. */
  number: number | null;
  /** Decision-tree question ids this point feeds (the draft-write targets). */
  nodeIds: string[];
  // Currently unused by the documents step: after the "no Yes/No" reframe the
  // card is always free text. Retained for the projected-path derivation and
  // any future reinstatement; do NOT read it to render a yes/no control.
  answerType: OpenPointAnswerType;
  status: OpenPointStatus;
  /** Parsed yes/no from the saved answer; null for text answers. */
  answerValue: "yes" | "no" | null;
  /** Free-text part of the saved answer (context, source, client reply). */
  answerDetail: string | null;
  /** Reason recorded with N/a. */
  naReason: string | null;
  /** True when any covered question was reopened by a contradicting analysis. */
  needsAttention: boolean;
  reopenReason: string | null;
  /** Per-entity grid attached to the merged question, if any. */
  table: LetterTable | null;
  answeredAt: string | null;
  sentAt: string | null;
  /** The register rows this point covers; the actions mutate all of them. */
  coveredRows: OpenQuestionRow[];
}

/** Register statuses that count as a still-open work item. */
const OPEN_ROW_STATUSES = new Set(["open", "taken_to_client"]);

/** Maps a single register row status onto the advisor-facing point status. */
export function mapRowStatus(row: OpenQuestionRow): OpenPointStatus {
  switch (row.status) {
    case "taken_to_client":
      return "sent_to_client";
    case "answered":
      return row.taken_to_client_at ? "answered_by_client" : "answered";
    case "confirmed_unknown":
      return "na";
    case "resolved":
      // A recorded Yes/No auto-resolved the row; for this step that reads as
      // answered, even though no client-answer text was typed here.
      return "answered";
    default:
      return "open";
  }
}

/**
 * yes/no buttons when the node branches on Yes AND No; free text otherwise.
 * Branch rows are the same atad2_questions data the questionnaire walks.
 */
export function deriveAnswerType(
  branches: QuestionBranchRow[],
  questionId: string,
): OpenPointAnswerType {
  let hasYes = false;
  let hasNo = false;
  for (const row of branches) {
    if (row.question_id !== questionId) continue;
    const option = row.answer_option.toLowerCase();
    if (option === "yes") hasYes = true;
    if (option === "no") hasNo = true;
  }
  return hasYes && hasNo ? "yesno" : "text";
}

/**
 * A merged point offers yes/no only when EVERY covered node is a yes/no node;
 * if any covered node is open-ended, the whole point falls back to free text
 * so no answer is forced onto a node that cannot take it.
 */
export function deriveMergedAnswerType(
  branches: QuestionBranchRow[],
  nodeIds: string[],
): OpenPointAnswerType {
  return nodeIds.every((id) => deriveAnswerType(branches, id) === "yesno")
    ? "yesno"
    : "text";
}

/**
 * One canonical serialization for saved answers so they parse back reliably:
 * "Yes", "No", "Yes. <detail>", "No. <detail>", or the bare detail text.
 */
export function serializeAnswer(
  value: "yes" | "no" | null,
  detail: string,
): string {
  const trimmed = detail.trim();
  if (value === null) return trimmed;
  const label = value === "yes" ? "Yes" : "No";
  return trimmed.length > 0 ? `${label}. ${trimmed}` : label;
}

/**
 * Inverse of serializeAnswer. Only the CANONICAL encodings count as a yes/no:
 * the whole string is exactly "Yes"/"No", or it opens "Yes. "/"No. " before
 * the detail. Free-text facts that merely begin with the word, e.g. "No US
 * check-the-box election was made." or "Yes, the entity is opaque", stay
 * detail-only with value null. This is load-bearing: the documents step saves
 * pure free text, so a loose match here would silently fabricate a definitive
 * questionnaire answer the advisor never gave (and drop their first word).
 */
export function parseAnswer(text: string | null): {
  value: "yes" | "no" | null;
  detail: string | null;
} {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) return { value: null, detail: null };
  const match = /^(yes|no)(?:\.\s+|\s*$)/i.exec(trimmed);
  if (!match) return { value: null, detail: trimmed };
  const rest = trimmed.slice(match[0].length).trim();
  return {
    value: match[1].toLowerCase() as "yes" | "no",
    detail: rest.length > 0 ? rest : null,
  };
}

function maxIso(values: Array<string | null>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (value && (best === null || value > best)) best = value;
  }
  return best;
}

/**
 * Folds the covered register rows into one point status. Resolving a merged
 * question writes the same status to every covered row, so they normally
 * agree; the priority below keeps a sensible reading if a DB trigger nudges
 * one row on its own (a recorded answer, a reopen flag):
 *  - any covered row still open  -> the point is open
 *  - else any sent to the client -> sent (its reply is still pending)
 *  - else any client answer      -> answered / answered_by_client
 *  - else (confirmed unknown / auto-resolved) -> n/a or answered
 */
function foldCoveredRows(coveredRows: OpenQuestionRow[]): {
  status: OpenPointStatus;
  answerValue: "yes" | "no" | null;
  answerDetail: string | null;
  naReason: string | null;
  needsAttention: boolean;
  reopenReason: string | null;
  answeredAt: string | null;
  sentAt: string | null;
} {
  const needsAttentionRow = coveredRows.find(
    (row) => row.source === "reopen" && OPEN_ROW_STATUSES.has(row.status),
  );
  const answeredRow = coveredRows.find((row) => row.status === "answered");
  const parsed = parseAnswer(answeredRow?.client_answer ?? null);
  const naRow = coveredRows.find((row) => row.status === "confirmed_unknown");
  const base = {
    answerValue: parsed.value,
    answerDetail: parsed.detail,
    naReason: naRow?.resolution_note ?? null,
    needsAttention: needsAttentionRow !== undefined,
    reopenReason: needsAttentionRow?.reopen_reason ?? null,
    answeredAt: maxIso(coveredRows.map((row) => row.client_answer_at)),
    sentAt: maxIso(coveredRows.map((row) => row.taken_to_client_at)),
  };

  if (coveredRows.some((row) => row.status === "open")) {
    return { ...base, status: "open" };
  }
  if (coveredRows.some((row) => row.status === "taken_to_client")) {
    return { ...base, status: "sent_to_client" };
  }
  if (answeredRow) {
    return {
      ...base,
      status: answeredRow.taken_to_client_at ? "answered_by_client" : "answered",
    };
  }
  if (naRow) return { ...base, status: "na" };
  // All remaining covered rows are auto-resolved (recorded Yes/No).
  return { ...base, status: "answered" };
}

function makePoint(
  id: string,
  questionText: string,
  table: LetterTable | null,
  number: number | null,
  nodeIds: string[],
  coveredRows: OpenQuestionRow[],
  branches: QuestionBranchRow[],
): OpenPoint {
  const folded = foldCoveredRows(coveredRows);
  return {
    id,
    questionText,
    number,
    nodeIds,
    answerType: deriveMergedAnswerType(branches, nodeIds),
    table,
    coveredRows,
    ...folded,
  };
}

/**
 * The main worklist: one point per merged client question, in letter order,
 * numbered 1..N. nodeIds is the merge mapping (every decision-tree question
 * the client question covers); coveredRows are the live register rows behind
 * them, which drive the point's status. A merged question whose covered rows
 * are no longer in the register (rare data drift) is dropped.
 */
export function buildMergedPoints(
  letter: ComposedLetter,
  rowByQuestionId: Map<string, OpenQuestionRow>,
  branches: QuestionBranchRow[],
): OpenPoint[] {
  const points: OpenPoint[] = [];
  let number = 0;
  for (const group of letter.groups) {
    for (const question of group.questions) {
      const coveredRows = question.question_ids
        .map((id) => rowByQuestionId.get(id))
        .filter((row): row is OpenQuestionRow => row !== undefined);
      if (coveredRows.length === 0) continue;
      number += 1;
      points.push(
        makePoint(
          questionKey(question),
          question.text,
          question.table,
          number,
          question.question_ids,
          coveredRows,
          branches,
        ),
      );
    }
  }
  return points;
}

/**
 * The off-path extras behind the "ask everything" expander: register rows
 * that are not reachable on the current questionnaire path. Shown one per
 * row (the compose merge runs only on the expected-path questions), each
 * answerable on its own.
 */
export function buildRawPoints(
  rows: OpenQuestionRow[],
  branches: QuestionBranchRow[],
  resolveText: (row: OpenQuestionRow) => string,
): OpenPoint[] {
  return rows.map((row) =>
    makePoint(
      row.id,
      resolveText(row),
      null,
      null,
      [row.question_id],
      [row],
      branches,
    ),
  );
}

export interface PartitionedPoints {
  /** The core list: questions on the expected flow, plus all resolved work. */
  pathPoints: OpenPoint[];
  /** The "Other possible points" extras: open questions the flow ruled out. */
  offPathPoints: OpenPoint[];
}

/**
 * Splits the merged points against the current projected path. A point stays
 * in the core list while at least one of its questions is still reachable, or
 * once it is resolved (finished work stays visible). An OPEN point whose
 * questions have all fallen off the path (a gate answer routed away from it)
 * moves to the off-path extras, so the advisor never has to answer a question
 * the flow has ruled out. Off-path register rows not covered by the merged
 * letter are appended as their own raw points, de-duped against the letter.
 */
export function partitionPointsByPath(
  mergedPoints: OpenPoint[],
  offPathRows: OpenQuestionRow[],
  branches: QuestionBranchRow[],
  resolveText: (row: OpenQuestionRow) => string,
  projectedIds: Set<string>,
): PartitionedPoints {
  const onPath = (point: OpenPoint) =>
    point.nodeIds.some((id) => projectedIds.has(id));
  const pathPoints = mergedPoints.filter(
    (point) => point.status !== "open" || onPath(point),
  );
  const ruledOutOpen = mergedPoints.filter(
    (point) => point.status === "open" && !onPath(point),
  );
  const letterIds = new Set(mergedPoints.flatMap((point) => point.nodeIds));
  const extra = offPathRows.filter((row) => !letterIds.has(row.question_id));
  return {
    pathPoints,
    offPathPoints: [...ruledOutOpen, ...buildRawPoints(extra, branches, resolveText)],
  };
}

/**
 * The "Could you please confirm:" stem shown above a list of points on screen,
 * the same lead-in the client copy and the composed letter use. The points are
 * direct clauses ("for each of ...", "whether ...") written to complete this
 * stem, so without it they read as bare fragments. Returns null for a legacy
 * set where most points carry their own polite opener (the stem would double
 * up) and for an empty list, mirroring letterLeadIn exactly.
 */
export function pointsLeadIn(points: { questionText: string }[]): string | null {
  if (points.length === 0) return null;
  const politeCount = points.filter((point) =>
    startsWithPoliteOpener(point.questionText),
  ).length;
  return politeCount > points.length / 2 ? null : CONFIRM_LEAD_IN;
}

export function openCount(points: OpenPoint[]): number {
  return points.filter((point) => point.status === "open").length;
}

export function resolvedCount(points: OpenPoint[]): number {
  return points.length - openCount(points);
}

/** "4 still open" / "1 still open" for the disabled submit button. */
export function stillOpenLabel(count: number): string {
  return count === 1 ? "1 still open" : `${count} still open`;
}

/**
 * Stable identity of the resolution state across all points. Submit stores
 * it; while it matches, the drafts in the questionnaire are up to date and
 * the footer can offer "Review questionnaire" without a re-submit.
 */
export function worklistFingerprint(points: OpenPoint[]): string {
  const entries = points
    .map((point) => [
      point.nodeIds.join("+"),
      point.status,
      point.answerValue ?? "",
      point.answerDetail ?? "",
      point.naReason ?? "",
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

// ---------------------------------------------------------------------------
// Draft writes: what submit pushes into atad2_question_prefills
// ---------------------------------------------------------------------------

/**
 * The register trigger (sync_open_questions_from_prefill) raises a reopen
 * flag when a definitive yes/no suggestion at confidence >= 60 contradicts a
 * recorded answer. Advisor drafts must never reopen the very point the
 * advisor just resolved, so a contradicting draft stays below that threshold
 * while still clearing the questionnaire's >= 40 "suggested" display bar.
 */
export const REOPEN_SAFE_CONFIDENCE = 55;
export const DRAFT_CONFIDENCE = 100;

/** Patch for one prefill row; only the keys present are written. */
export interface DraftWritePatch {
  suggested_answer?: "yes" | "no" | "unknown";
  confidence_pct?: number;
  answer_rationale?: string;
  suggested_toelichting?: string;
  suggested_toelichting_unknown?: string;
  user_action?: "pending";
  committed_text?: null;
}

export interface DraftWrite {
  questionId: string;
  prefillId: string;
  patch: DraftWritePatch;
}

/** A resolved node with no prefill row to carry the draft. */
export interface DraftSkip {
  questionId: string;
  reason: "no_prefill_row";
}

export interface DraftWritePlan {
  writes: DraftWrite[];
  skipped: DraftSkip[];
}

/** answer_rationale has a 300-char CHECK constraint; clamp defensively. */
function clampRationale(text: string): string {
  return text.length <= 300 ? text : `${text.slice(0, 297)}...`;
}

/**
 * suggested_toelichting and suggested_toelichting_unknown carry a 4000-char
 * CHECK constraint. A pasted client reply can exceed that; clamp so the draft
 * always lands instead of silently failing the UPDATE and dropping the node.
 */
function clampToelichting(text: string): string {
  return text.length <= 4000 ? text : `${text.slice(0, 3997)}...`;
}

function confidenceFor(
  value: "yes" | "no",
  recordedAnswer: string | undefined,
): number {
  if (recordedAnswer === undefined) return DRAFT_CONFIDENCE;
  return recordedAnswer.toLowerCase() === value
    ? DRAFT_CONFIDENCE
    : REOPEN_SAFE_CONFIDENCE;
}

/** The shared part of the patch for a resolved point (node-independent). */
function patchForPoint(point: OpenPoint): DraftWritePatch | null {
  if (point.status === "answered" || point.status === "answered_by_client") {
    const sourceNote =
      point.status === "answered_by_client"
        ? "Client reply recorded on the documents step."
        : "Your input on the documents step.";
    // A fresh resolution supersedes any earlier questionnaire decision on
    // these nodes, so always clear the committed/dismissed state; otherwise a
    // stale 'accepted'/'dismissed' + leftover committed_text from a previous
    // pass would contradict the new draft.
    const patch: DraftWritePatch = { user_action: "pending", committed_text: null };
    if (point.answerValue !== null) {
      patch.suggested_answer = point.answerValue;
      patch.answer_rationale = clampRationale(sourceNote);
      if (point.answerDetail !== null) {
        patch.suggested_toelichting = clampToelichting(point.answerDetail);
      }
      return patch;
    }
    if (point.answerDetail !== null) {
      // Context but no yes/no: clear any stale definitive suggestion (so the
      // questionnaire stops showing a "suggested · X%" pill the advisor never
      // gave) and carry the note on the unknown branch.
      patch.suggested_answer = "unknown";
      patch.confidence_pct = DRAFT_CONFIDENCE;
      patch.answer_rationale = clampRationale(sourceNote);
      patch.suggested_toelichting_unknown = clampToelichting(point.answerDetail);
      return patch;
    }
    return null; // nothing usable saved
  }
  // Sent-to-client and Not-applicable are "unknown" outcomes: there is no
  // definitive answer to record. We deliberately leave the prefill exactly as
  // the document analysis left it, rather than forcing a "suggested unknown"
  // at full confidence over the top and wiping the earlier draft. The advisor
  // sees the original suggestion in the questionnaire and confirms it there;
  // the sent / not-applicable status itself lives in the open-questions
  // register, not in the questionnaire prefill.
  return null;
}

/**
 * Plans the prefill updates for every resolved point. A merged point writes
 * the SAME draft to each decision-tree node it covers (one answer covers
 * all): a yes/no answer becomes that node's draft answer, with the
 * confidence held below the reopen threshold where it contradicts a recorded
 * answer; sent-to-client and n/a draft to "unknown" with a note. Points still
 * 'open' are the caller's gating problem, never planned here. Nodes without a
 * prefill row are reported as skipped (the browser may only UPDATE
 * atad2_question_prefills, never INSERT).
 */
export function planDraftWrites(
  points: OpenPoint[],
  prefillIdByQuestionId: Map<string, string>,
  recordedAnswers: Map<string, string>,
): DraftWritePlan {
  const writes: DraftWrite[] = [];
  const skipped: DraftSkip[] = [];

  for (const point of points) {
    if (point.status === "open") continue;
    const basePatch = patchForPoint(point);
    if (basePatch === null) continue;

    for (const questionId of point.nodeIds) {
      const prefillId = prefillIdByQuestionId.get(questionId);
      if (!prefillId) {
        skipped.push({ questionId, reason: "no_prefill_row" });
        continue;
      }
      // Confidence is the only node-specific field: a contradicting yes/no
      // draft must not reopen the node it lands on.
      const patch: DraftWritePatch = { ...basePatch };
      if (patch.suggested_answer === "yes" || patch.suggested_answer === "no") {
        patch.confidence_pct = confidenceFor(
          patch.suggested_answer,
          recordedAnswers.get(questionId),
        );
      }
      writes.push({ questionId, prefillId, patch });
    }
  }

  return { writes, skipped };
}

// ---------------------------------------------------------------------------
// Copy points as text (for the client, or all of them)
// ---------------------------------------------------------------------------

export interface PointsCopyMeta {
  taxpayerName: string;
  fiscalYear: string;
}

/**
 * A clean numbered plain-text list of the given points, ready to paste into
 * an email. The subset is renumbered 1..N (independent of the worklist
 * position) so a client list always reads 1, 2, 3. With `withIntro` it leads
 * with a short client-ready line so it drops straight into a message to a CFO.
 */
export function formatPointsList(
  points: { questionText: string }[],
  meta: PointsCopyMeta,
  withIntro: boolean,
): string {
  const header = `Points to confirm, ${meta.taxpayerName}${
    meta.fiscalYear ? ` (FY ${formatFiscalYears(meta.fiscalYear)})` : ""
  }`;
  const numbered = points.map((point, index) => `${index + 1}. ${point.questionText}`);
  const blocks: string[] = [header];
  if (withIntro) {
    blocks.push(
      "To finish your ATAD2 assessment we still need a few points confirmed. Could you please help us with the following:",
    );
  }
  blocks.push(numbered.join("\n"));
  return `${blocks.join("\n\n")}\n`;
}

/**
 * The client-ready message for "Copy points for client": a short plain-language
 * lead-in followed by the numbered selected points, ready to paste straight
 * into an email. The subset is renumbered 1..N independent of worklist
 * position. No internal header and no conclusions; the compose step already
 * phrases each point in client language.
 */
export function formatClientMessage(points: { questionText: string }[]): string {
  const lead = "To finalise our assessment, could you confirm the following:";
  const numbered = points.map((point, index) => `${index + 1}. ${point.questionText}`);
  return `${lead}\n\n${numbered.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Stored submit record (localStorage, per session)
// ---------------------------------------------------------------------------

export interface StoredDraftSubmit {
  v: 1;
  fingerprint: string;
  submittedAt: string;
  written: number;
}

export function draftSubmitStorageKey(sessionId: string): string {
  return `documents-drafts:${sessionId}`;
}

/** localStorage key for the cached merged worklist letter (separate from the
 * client-letter envelope, which holds only the sent subset). */
export function worklistLetterStorageKey(sessionId: string): string {
  return `documents-worklist-letter:${sessionId}`;
}

export function encodeStoredDraftSubmit(record: StoredDraftSubmit): string {
  return JSON.stringify(record);
}

/** Fail-closed decode: anything malformed reads as "never submitted". */
export function decodeStoredDraftSubmit(
  raw: string | null,
): StoredDraftSubmit | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (typeof record.fingerprint !== "string") return null;
  if (typeof record.submittedAt !== "string") return null;
  if (typeof record.written !== "number") return null;
  return {
    v: 1,
    fingerprint: record.fingerprint,
    submittedAt: record.submittedAt,
    written: record.written,
  };
}

// ---------------------------------------------------------------------------
// Letter staleness: the merged letter is composed from the open path rows
// ---------------------------------------------------------------------------

/**
 * True when the cached merged letter no longer covers every open question on
 * the path (a question reopened or appeared since it was composed). Resolved
 * questions leaving the open set never make it stale, so the letter stays
 * stable while the advisor works through it.
 */
export function letterIsStale(
  coveredIds: string[],
  openPathIds: string[],
): boolean {
  const covered = new Set(coveredIds);
  return openPathIds.some((id) => !covered.has(id));
}
