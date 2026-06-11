import { DOCUMENT_CATEGORIES, type QuestionPrefill } from "@/lib/prefill/types";

/**
 * Pure helpers for the analysis narrative ticker shown under AnalyzeProgress.
 * Every line is derived from REAL prefill rows and REAL document categories;
 * nothing here fabricates progress. The component layer only decides when to
 * call these and how often to advance the rotation tick.
 */

/** Slice of a prefill row the narrative needs; keeps tests dependency-free. */
export type NarrativePrefill = Pick<
  QuestionPrefill,
  | "question_id"
  | "created_at"
  | "suggested_toelichting"
  | "contextual_hint"
  | "client_question"
  | "suggested_answer"
>;

/**
 * Trims and caps text for a single-height ticker line. Over the limit, cuts
 * at max minus 3 and appends three ASCII dots (house style: no ellipsis
 * character, no dashes in user-facing strings).
 */
export function truncateForTicker(text: string, max = 80): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 3) + "...";
}

/**
 * One narrative line for a landed prefill row, or null when the row carries
 * neither route's data yet.
 *
 * Route B (needs the client): contextual_hint is set. Shows the start of the
 * ready-to-send client question, falling back to the official question text.
 * Route A (answered from documents): a definitive suggestion landed.
 */
export function narrativeLineFor(
  p: NarrativePrefill,
  officialText: string | undefined,
): string | null {
  if (p.contextual_hint !== null) {
    const text = truncateForTicker(p.client_question ?? officialText ?? "");
    if (text.length === 0) return `Question ${p.question_id} needs the client`;
    return `Question ${p.question_id} needs the client: ${text}`;
  }
  if (p.suggested_toelichting !== null || p.suggested_answer !== null) {
    return `Looked into question ${p.question_id}: enough in the documents`;
  }
  return null;
}

/**
 * Narrative lines for the most recent prefill rows, oldest first, capped at
 * the last `limit` so the ticker block never grows past a fixed height.
 */
export function buildNarrativeLines(
  prefills: NarrativePrefill[],
  officialById: Map<string, string>,
  limit = 5,
): string[] {
  const lines = [...prefills]
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    .map((p) => narrativeLineFor(p, officialById.get(p.question_id)))
    .filter((line): line is string => line !== null);
  return lines.slice(-limit);
}

/**
 * Rotating "Now reading" line over the session's REAL document categories.
 * Order-preserving dedupe; unknown values fall back to "Documents". Pure in
 * (categories, tick) so the rotation is fully testable.
 */
export function nowReadingLine(
  categories: string[],
  tick: number,
): string | null {
  const unique = [...new Set(categories)];
  if (unique.length === 0) return null;
  const value = unique[tick % unique.length];
  const label =
    DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label ?? "Documents";
  return `Now reading: ${label}...`;
}
