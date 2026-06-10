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
  /** On-path open/taken_to_client rows (an answer row exists this session). */
  active: OpenQuestionRow[];
  /** Off-path open/taken_to_client rows ("May become relevant later"). */
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
 * A row is on-path when the question is part of the answered question path,
 * i.e. an atad2_answers row exists for it in this session.
 */
export function isOnPath(
  row: OpenQuestionRow,
  answeredQuestionIds: Set<string>,
): boolean {
  return answeredQuestionIds.has(row.question_id);
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
 * 3. on-path open/taken_to_client -> active, off-path -> later
 */
export function groupOpenQuestions(
  rows: OpenQuestionRow[],
  answeredQuestionIds: Set<string>,
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
    } else if (isOnPath(row, answeredQuestionIds)) {
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
 * Badge count for the sub-header button. Off-path "later" rows and history
 * are excluded so rows that cannot block anything never alarm the advisor.
 */
export function countActiveOpenQuestions(groups: OpenQuestionGroups): number {
  return groups.needsAttention.length + groups.active.length;
}
