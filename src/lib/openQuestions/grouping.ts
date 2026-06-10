import { FALLBACK_QUESTION_SENTENCE, type OpenQuestionRow } from "./types";

/**
 * Terminal statuses always land in the collapsed history group, regardless
 * of source. Only non-terminal rows route on source and path membership.
 */
const HISTORY_STATUSES = new Set([
  "resolved",
  "confirmed_unknown",
  "dismissed",
  "answered",
]);

export interface OpenQuestionGroups {
  /** source='reopen' rows that are still open or sent to the client. */
  needsAttention: OpenQuestionRow[];
  /** Open/taken_to_client rows on the projected questionnaire path. */
  active: OpenQuestionRow[];
  /**
   * Open/taken_to_client rows off the projected path: not reachable given
   * the recorded answers and AI suggestions ("Not expected on the current
   * path"). Collapsed by default, never deleted.
   */
  later: OpenQuestionRow[];
  /** Resolved, confirmed unknown, dismissed and client-answered rows. */
  history: OpenQuestionRow[];
}

/**
 * Question text to show the advisor or the client. Prefers the AI-written
 * client_question, then the official question text, then a fixed sentence.
 */
export function resolveClientQuestion(
  row: OpenQuestionRow,
  officialTextById: Map<string, string>,
): string {
  const clientQuestion = row.client_question?.trim();
  if (clientQuestion) return clientQuestion;
  const official = officialTextById.get(row.question_id);
  if (official) return official;
  return FALLBACK_QUESTION_SENTENCE;
}

/**
 * A row is on the projected path when its question can still come up given
 * the recorded answers and AI suggestions (see computeProjectedPath in
 * projectedPath.ts). Questions outside this set cannot be reached no matter
 * how the remaining unknowns resolve.
 */
export function isOnProjectedPath(
  row: OpenQuestionRow,
  projectedQuestionIds: Set<string>,
): boolean {
  return projectedQuestionIds.has(row.question_id);
}

function byUpdatedAtDesc(a: OpenQuestionRow, b: OpenQuestionRow): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

function byQuestionIdNumeric(a: OpenQuestionRow, b: OpenQuestionRow): number {
  return a.question_id.localeCompare(b.question_id, undefined, { numeric: true });
}

/**
 * Groups register rows for the panel with strict precedence:
 * 1. terminal status (resolved/confirmed_unknown/dismissed/answered) -> history
 * 2. source 'reopen' -> needsAttention
 * 3. on the projected path open/taken_to_client -> active, off it -> later
 */
export function groupOpenQuestions(
  rows: OpenQuestionRow[],
  projectedQuestionIds: Set<string>,
): OpenQuestionGroups {
  const groups: OpenQuestionGroups = {
    needsAttention: [],
    active: [],
    later: [],
    history: [],
  };

  for (const row of rows) {
    if (HISTORY_STATUSES.has(row.status)) {
      groups.history.push(row);
    } else if (row.source === "reopen") {
      groups.needsAttention.push(row);
    } else if (isOnProjectedPath(row, projectedQuestionIds)) {
      groups.active.push(row);
    } else {
      groups.later.push(row);
    }
  }

  groups.needsAttention.sort(byUpdatedAtDesc);
  groups.history.sort(byUpdatedAtDesc);
  groups.active.sort(byQuestionIdNumeric);
  groups.later.sort(byQuestionIdNumeric);

  return groups;
}

/**
 * Badge count for the sub-header button. "Later" rows (off the projected
 * path) and history are excluded so rows that cannot block anything never
 * alarm the advisor.
 */
export function countActiveOpenQuestions(groups: OpenQuestionGroups): number {
  return groups.needsAttention.length + groups.active.length;
}

export interface RowActionVisibility {
  keepAsUnknown: boolean;
  notRelevant: boolean;
  markSentToClient: boolean;
  /** "What did the client say?" input for rows still in play. */
  clientAnswerInput: boolean;
  /** Edit affordance on the saved client answer of an answered row. */
  editClientAnswer: boolean;
  goToQuestion: boolean;
  /** Un-dismiss: move a dismissed row back to open. */
  restore: boolean;
}

/**
 * Which row actions a register row offers. Pure visibility rules:
 * - Keep as unknown: active rows without an answer row, or with an Unknown
 *   answer. Never for Yes/No-answered rows (reopen flags), where only
 *   editing the answer itself moves the gate. Keyed to answer-row presence,
 *   NOT the projected path: the on-path write path UPDATEs atad2_answers
 *   and would silently no-op for a projected-but-unanswered question.
 * - Not relevant: all active rows. Dismissing is register-only and never
 *   touches atad2_answers, so it can never close the final-memo gate.
 * - Mark as sent to client: only while the row is still open.
 * - Client answer input: active rows; answered rows get an edit affordance
 *   on the saved text instead.
 * - Go to question: only when an answer row exists (the ?q= deep link
 *   replays the answered flow), including answered history rows so the
 *   apply-it work is never lost.
 * - Restore: dismissed rows only (un-dismiss back to open).
 */
export function visibleActionsFor(
  row: OpenQuestionRow,
  onProjectedPath: boolean,
  answerForQuestion: string | undefined,
): RowActionVisibility {
  const active = row.status === "open" || row.status === "taken_to_client";
  const hasAnswerRow = answerForQuestion !== undefined;
  // The projected path drives grouping and the dismissed gate hint, not the
  // action set; the parameter stays so callers pass one consistent context.
  void onProjectedPath;
  return {
    keepAsUnknown: active && (!hasAnswerRow || answerForQuestion === "Unknown"),
    notRelevant: active,
    markSentToClient: row.status === "open",
    clientAnswerInput: active,
    editClientAnswer: row.status === "answered",
    goToQuestion: hasAnswerRow,
    restore: row.status === "dismissed",
  };
}

/**
 * Honesty hint for a dismissed row whose underlying question is still on the
 * projected path without a definitive answer. Dismissing only removes the
 * row from the worklist; the final-memo gate stays answers-based, so the
 * question itself still needs a Yes/No answer or a confirmed unknown.
 * Returns null when no hint is needed.
 */
export function dismissedGateHint(
  row: OpenQuestionRow,
  onProjectedPath: boolean,
  answerForQuestion: string | undefined,
): string | null {
  if (row.status !== "dismissed") return null;
  if (!onProjectedPath) return null;
  if (answerForQuestion === "Yes" || answerForQuestion === "No") return null;
  return "Dismissed from the list. The underlying question still needs an answer or a confirmed unknown before the final memo.";
}
