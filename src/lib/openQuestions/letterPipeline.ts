import type { OpenQuestionRow } from "./types";
import type { StoredLetter } from "./letterShape";

/**
 * Pure decision logic for the letter-first analysis page pipeline: after the
 * document analysis completes, the page runs an optional wording round (AI
 * writes client_question text for rows that miss it) and then composes the
 * client letter. This module decides WHAT to run; the hook layer runs it.
 */

/**
 * Minimum prefill_swarm_system prompt version that writes client_question
 * wording. Below this (or when the version RPC is unavailable) the wording
 * round is skipped silently and the letter composes from the official
 * question text fallback.
 */
export const WORDING_PROMPT_VERSION = 12;

/** UI phase of the letter pipeline on the analysis page. */
export type LetterPipelinePhase =
  | "analyzing"
  | "wording"
  | "composing"
  | "letter"
  | "empty"
  | "error";

/** A pipeline failure surfaced to the page. notDeployed errors get no retry. */
export interface PipelineError {
  message: string;
  notDeployed: boolean;
}

/**
 * True when a row has no usable AI-written client question yet. No status
 * check: callers pass selectComposeRows output, which is already limited to
 * open/taken_to_client rows on the projected path.
 */
export function missingClientWording(row: OpenQuestionRow): boolean {
  return (row.client_question ?? "").trim().length === 0;
}

/** First pipeline action to take when the page settles after completion. */
export type PipelineStart =
  | { kind: "empty" }
  | { kind: "letter"; stored: StoredLetter }
  | { kind: "wording"; targetIds: string[] }
  | { kind: "compose" };

/**
 * Decides the pipeline's first step. Rules, in order:
 * 1. No compose rows: the documents covered everything; never compose.
 * 2. Plain visit with a stored letter: show it, no calls.
 * 3. Rows missing wording AND the wording prompt is live: wording round first.
 * 4. Otherwise compose directly (below-version or unknown prompt version
 *    skips wording silently; the official-text fallback covers those rows).
 */
export function decidePipelineStart(args: {
  completionTransition: boolean;
  storedLetter: StoredLetter | null;
  composeRows: OpenQuestionRow[];
  promptVersion: number | null;
}): PipelineStart {
  if (args.composeRows.length === 0) return { kind: "empty" };
  if (!args.completionTransition && args.storedLetter) {
    return { kind: "letter", stored: args.storedLetter };
  }
  const targets = args.composeRows.filter(missingClientWording);
  if (
    targets.length > 0 &&
    (args.promptVersion ?? 0) >= WORDING_PROMPT_VERSION
  ) {
    return { kind: "wording", targetIds: targets.map((r) => r.question_id) };
  }
  return { kind: "compose" };
}

/**
 * Merges freshly fetched client_question wording (selected from the DB after
 * the wording round, never from mid-run query cache) into the compose rows.
 * Only non-empty trimmed values overwrite; rows without a fresh value keep
 * what they had. Returns new row objects; never mutates the input.
 */
export function mergeFreshWording(
  rows: OpenQuestionRow[],
  freshById: Map<string, string | null>,
): OpenQuestionRow[] {
  return rows.map((row) => {
    const fresh = freshById.get(row.question_id);
    if (typeof fresh === "string" && fresh.trim().length > 0) {
      return { ...row, client_question: fresh };
    }
    return row;
  });
}
