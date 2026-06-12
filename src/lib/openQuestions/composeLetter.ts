import { groupOpenQuestions, type OpenQuestionGroups } from "./grouping";
import {
  computeProjectedPath,
  type QuestionBranchRow,
} from "./projectedPath";
import type { OpenQuestionExportMeta } from "./exportText";
import type { OpenQuestionRow } from "./types";

/** One worklist question as sent to the compose_client_letter action. */
export interface ComposeQuestionItem {
  question_id: string;
  client_question: string;
  why_it_matters: string | null;
}

/**
 * The composed letter returned by the compose_client_letter action: shared
 * facts merged across questions (each stated exactly once) plus the numbered
 * asks, which no longer repeat the merged context.
 */
export interface ComposedLetter {
  understandings: string[];
  questions: { question_id: string; text: string }[];
}

/**
 * Rows the letter is composed from: needsAttention then active, only
 * open/taken_to_client. Mirrors rowsToExportItems but never includes the
 * later group; the letter is scoped to the projected-path worklist.
 * Dismissed and answered rows are already excluded by grouping.
 */
export function selectComposeRows(groups: OpenQuestionGroups): OpenQuestionRow[] {
  return [...groups.needsAttention, ...groups.active].filter(
    (row) => row.status === "open" || row.status === "taken_to_client",
  );
}

/**
 * A fresh compose selection: the rows to compose from, plus the question ids
 * of the off-path rows that are only present because the advisor explicitly
 * added them. addedQuestionIds is the CLEANED set: extra ids that are
 * unknown, answered, dismissed or meanwhile on the projected path never
 * appear in it, so persisting it keeps the stored state tidy.
 */
export interface ComposeSelection {
  rows: OpenQuestionRow[];
  addedQuestionIds: string[];
}

/**
 * Same selection as selectComposeRows, but computed entirely from data the
 * caller fetched FRESH from the database: register rows, the recorded answer
 * map, the AI suggested-answer map and the questionnaire branch rows. Walks
 * the projected path from those maps and groups the rows on it, so a stale
 * react-query cache (whose missing suggestions would widen the path to
 * wildcards) can never put off-path questions into the letter.
 *
 * extraQuestionIds additionally pulls in off-path rows (the later group,
 * still open/taken_to_client) the advisor explicitly added to the letter.
 * Unknown ids are ignored, terminal rows stay dropped, and an extra id that
 * is meanwhile on the projected path is already in the base selection, so
 * the result never holds duplicates.
 */
export function selectComposeSelectionFresh(
  rows: OpenQuestionRow[],
  answers: Map<string, string>,
  suggestions: Map<string, string | null>,
  branches: QuestionBranchRow[],
  extraQuestionIds: string[] = [],
): ComposeSelection {
  const projectedIds = computeProjectedPath(branches, answers, suggestions);
  const groups = groupOpenQuestions(rows, projectedIds);
  const base = selectComposeRows(groups);
  const wanted = new Set(extraQuestionIds);
  const extras =
    wanted.size === 0
      ? []
      : groups.later.filter(
          (row) =>
            wanted.has(row.question_id) &&
            (row.status === "open" || row.status === "taken_to_client"),
        );
  return {
    rows: [...base, ...extras],
    addedQuestionIds: extras.map((row) => row.question_id),
  };
}

/** Row-only view of selectComposeSelectionFresh, for callers without extras. */
export function selectComposeRowsFresh(
  rows: OpenQuestionRow[],
  answers: Map<string, string>,
  suggestions: Map<string, string | null>,
  branches: QuestionBranchRow[],
  extraQuestionIds: string[] = [],
): OpenQuestionRow[] {
  return selectComposeSelectionFresh(
    rows,
    answers,
    suggestions,
    branches,
    extraQuestionIds,
  ).rows;
}

/**
 * Candidate rows for the "Add questions outside the expected path" section:
 * off-path (later group) rows that are still open/taken_to_client and not
 * already woven into the shown letter. Once a question is part of the letter
 * its include checkbox lives in the main list, so it never shows here twice.
 */
export function selectAddCandidates(
  later: OpenQuestionRow[],
  letterQuestionIds: Set<string>,
): OpenQuestionRow[] {
  return later.filter(
    (row) =>
      (row.status === "open" || row.status === "taken_to_client") &&
      !letterQuestionIds.has(row.question_id),
  );
}

/**
 * The addedQuestionIds to request on the next regenerate: previously added
 * ids that are still ticked in the main letter list, plus the newly staged
 * candidate ids, deduped in that order. Added ids the advisor unticked drop
 * out here, so the persisted state never accumulates dead entries.
 */
export function nextAddedQuestionIds(
  currentAdded: string[],
  includedIds: Set<string>,
  stagedIds: string[],
): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of currentAdded) {
    if (includedIds.has(id) && !seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  for (const id of stagedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  return next;
}

/**
 * Builds the request items for the compose call. resolveText already prefers
 * the AI-written client_question and falls back to the official question
 * text, so pre-v12 rows without AI wording still compose sensibly.
 */
export function buildComposeItems(
  rows: OpenQuestionRow[],
  resolveText: (row: OpenQuestionRow) => string,
): ComposeQuestionItem[] {
  return rows.map((row) => ({
    question_id: row.question_id,
    client_question: resolveText(row),
    why_it_matters: row.why_it_matters,
  }));
}

/**
 * Preview-side filter for the include/exclude checkboxes: drops excluded
 * questions and leaves understandings untouched. Understandings only change
 * on Regenerate, which re-runs the composition with the included rows.
 */
export function filterLetterQuestions(
  letter: ComposedLetter,
  includedIds: Set<string>,
): ComposedLetter {
  return {
    understandings: letter.understandings,
    questions: letter.questions.filter((q) => includedIds.has(q.question_id)),
  };
}

/** Regex that matches a polite-opener at the start of a question item. */
const POLITE_OPENER_RE = /^(could you|can you|please)\b/i;

/**
 * Returns "Could you please confirm:" when the majority of the included
 * questions do NOT start with a polite opener (i.e. v2-style direct clauses).
 * Returns null for legacy v1 letters where most items open with their own
 * polite phrase, so the lead-in is not rendered and the letter still reads
 * correctly without a clashing duplicate.
 *
 * Only included questions (those present in includedIds) are considered; the
 * majority is computed over that subset alone.
 */
export function letterLeadIn(
  questions: ComposedLetter["questions"],
  includedIds: Set<string>,
): string | null {
  const included = questions.filter((q) => includedIds.has(q.question_id));
  if (included.length === 0) return null;
  const politeCount = included.filter((q) =>
    POLITE_OPENER_RE.test(q.text.trimStart()),
  ).length;
  // Majority = strictly more than half start with a polite opener => legacy.
  return politeCount > included.length / 2 ? null : "Could you please confirm:";
}

/**
 * Plain-text letter for "Copy letter". Header, blank line, a bulleted
 * "We understand that:" block (omitted entirely when there are no non-blank
 * understandings), blank line, then an optional collective lead-in ("Could
 * you please confirm:") when the questions are v2-style direct clauses,
 * then the included questions renumbered 1..n with one blank line between
 * items. Joined with newlines and ending with exactly one trailing newline,
 * same convention as formatOpenQuestionsText.
 */
export function formatComposedLetterText(
  letter: ComposedLetter,
  includedIds: Set<string>,
  meta: OpenQuestionExportMeta,
): string {
  const lines: string[] = [
    `Questions for ${meta.taxpayerName} (FY ${meta.fiscalYear})`,
    `Recorded on ${meta.dateLong}`,
    "",
  ];

  const understandings = letter.understandings
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (understandings.length > 0) {
    lines.push("We understand that:");
    for (const entry of understandings) lines.push(`- ${entry}`);
    lines.push("");
  }

  const leadIn = letterLeadIn(letter.questions, includedIds);
  if (leadIn !== null) {
    lines.push(leadIn);
    lines.push("");
  }

  const included = letter.questions.filter((q) => includedIds.has(q.question_id));
  included.forEach((question, index) => {
    if (index > 0) lines.push("");
    lines.push(`${index + 1}. ${question.text}`);
  });

  return `${lines.join("\n")}\n`;
}

/**
 * Ids of the included rows that are still 'open': the set to flip to
 * taken_to_client after a successful copy. Mirrors the .in().eq('status',
 * 'open') flip set of the existing export, so rows already sent to the
 * client are never flipped twice.
 */
export function flipIdsForLetter(
  rows: OpenQuestionRow[],
  includedIds: Set<string>,
): string[] {
  return rows
    .filter((row) => includedIds.has(row.question_id) && row.status === "open")
    .map((row) => row.id);
}

/**
 * True when the error message means the compose action is simply not
 * deployed yet: the live index.ts default case returns "Unknown action: ..."
 * and loadActivePrompt throws "No active prompt for ...". The UI shows one
 * "Letter composition is not deployed yet" toast and does nothing else.
 */
export function isNotDeployedMessage(message: string): boolean {
  return /unknown action/i.test(message) || /no active prompt/i.test(message);
}
