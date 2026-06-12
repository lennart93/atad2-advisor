import { DOCUMENT_CATEGORIES } from "@/lib/prefill/types";

/**
 * Pure helpers for the single rotating narrative line shown during the
 * analysis wait and the follow-up letter pipeline. Every line is derived
 * from REAL inputs (document categories, prefill counts, client-question
 * teaser text); nothing here fabricates progress.
 *
 * By construction no line can leak a question id: TickerInputs carries no
 * id field, so the builder never even sees one.
 */

/** Pipeline phase the ticker narrates. */
export type TickerPhase = "analyzing" | "wording" | "composing";

/** Grounded, id-free inputs the ticker pool is built from. */
export interface TickerInputs {
  /** Raw category values of the session documents (may repeat). */
  categories: string[];
  /** Prefill rows landed so far. */
  prefillCount: number;
  /** Distinct questions in the questionnaire, null while loading. */
  totalQuestions: number | null;
  /** Route-B prefills so far (rows that need the client). */
  clientQuestionCount: number;
  /** Client-question text (or official fallback) of route-B rows, oldest first. */
  teasers: string[];
}

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
 * The pool of lines the ticker rotates through for a phase. All grounded:
 * analyzing names the REAL document categories and real counts, wording and
 * composing describe the step that is actually running. Empty pool means
 * there is nothing real to say yet; the component renders nothing.
 */
export function buildTickerPool(
  phase: TickerPhase,
  inputs: TickerInputs,
): string[] {
  const questionCounter =
    inputs.clientQuestionCount > 0
      ? `${inputs.clientQuestionCount} client question${
          inputs.clientQuestionCount === 1 ? "" : "s"
        } so far`
      : null;

  if (phase === "wording") {
    const pool = ["Writing client questions..."];
    if (questionCounter) pool.push(questionCounter);
    return pool;
  }

  if (phase === "composing") {
    return ["Merging shared context...", "Drafting your client letter..."];
  }

  const pool: string[] = [];
  for (const value of [...new Set(inputs.categories)]) {
    const label =
      DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label.toLowerCase() ??
      "documents";
    pool.push(`Reading the ${label}...`);
  }
  if (inputs.totalQuestions != null && inputs.prefillCount > 0) {
    pool.push(`${inputs.prefillCount} of ${inputs.totalQuestions} checks done`);
  }
  if (questionCounter) pool.push(questionCounter);
  const teasers = inputs.teasers
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(-3);
  for (const teaser of teasers) {
    pool.push(`Found something for the client: ${truncateForTicker(teaser)}`);
  }
  return pool;
}

/**
 * The single line to show for a rotation tick: pool[tick % length], null on
 * an empty pool. Pure in (pool, tick) so the rotation is fully testable.
 */
export function pickTickerLine(pool: string[], tick: number): string | null {
  if (pool.length === 0) return null;
  return pool[tick % pool.length];
}
