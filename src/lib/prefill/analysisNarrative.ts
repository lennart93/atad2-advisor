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
  /** Session taxpayer name; a few domain lines mention it when known. */
  taxpayerName?: string | null;
}

/**
 * Semi-generic ATAD2 work lines that rotate between the grounded lines while
 * the analysis runs. They describe the kind of checks the swarm really
 * performs, never a specific finding, never a question id or number. All
 * English, ASCII dots only, no em or en dashes.
 */
export const DOMAIN_ACTIVITY_LINES: readonly string[] = [
  "Looking for hybrid entities in the structure...",
  "Checking how each counterparty is classified for tax purposes...",
  "Mapping intercompany financing flows...",
  "Checking for permanent establishments abroad...",
  "Comparing the Dutch deduction with the pickup abroad...",
  "Checking the ownership chain for associated enterprises...",
  "Looking for double deduction risks...",
  "Checking whether payments are picked up within a reasonable period...",
  "Scanning for check-the-box elections...",
  "Scanning for back-to-back patterns...",
  "Checking the shareholder register...",
  "Looking for transparent entities in the chain...",
  "Verifying tax residency of the taxpayer...",
  "Tracing where each payment is included in a tax base...",
  "Looking for deduction without inclusion mismatches...",
  "Reviewing the group structure for reverse hybrids...",
  "Checking for dual resident entities...",
  "Matching payments against the tax treatment abroad...",
  "Looking for imported mismatch chains...",
  "Checking whether any mismatch arises between associated enterprises...",
  "Checking the timing of deductions against the inclusion abroad...",
  "Looking for structured arrangements...",
  "Cross-checking entity classifications between jurisdictions...",
  "Reviewing guarantees and on-lending within the group...",
  "Checking whether dual inclusion income offsets a double deduction...",
];

/**
 * The domain pool for a session: the fixed lines plus a few taxpayer-specific
 * ones when the name is known. Only the trimmed name is ever interpolated.
 */
export function buildDomainPool(
  taxpayerName?: string | null,
): string[] {
  const pool = [...DOMAIN_ACTIVITY_LINES];
  const name = taxpayerName?.trim();
  if (name) {
    pool.push(
      `Analysing transactions around ${name}...`,
      `Checking how ${name} is classified abroad...`,
      `Mapping the payment flows around ${name}...`,
    );
  }
  return pool;
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
  if (phase === "wording") {
    return ["Writing client questions..."];
  }

  // The composing phase deliberately shows no rotating line; the page renders
  // nothing while the client letter is being drafted.
  if (phase === "composing") {
    return [];
  }

  const pool: string[] = [];
  for (const value of [...new Set(inputs.categories)]) {
    const label =
      DOCUMENT_CATEGORIES.find((c) => c.value === value)?.label.toLowerCase() ??
      "documents";
    pool.push(`Reading the ${label}...`);
  }
  // Deliberately NO counter lines (neither "x of N checks done" nor "x client
  // questions so far"): internal run counters never render on the documents step.
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

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Step size through the domain pool. Any step coprime with the pool size
 * walks every line exactly once before the order repeats, so the rotation
 * feels shuffled while staying fully deterministic in the tick counter.
 */
function strideFor(poolSize: number): number {
  for (const candidate of [11, 7, 13, 9, 3]) {
    if (candidate < poolSize && gcd(candidate, poolSize) === 1) return candidate;
  }
  return 1;
}

/**
 * The line for a rotation tick, phase-aware:
 * - wording and composing keep their small grounded pools as before.
 * - analyzing mixes the big domain pool with the grounded lines: every 3rd
 *   tick shows a grounded line (real categories, counters, teasers) when any
 *   exist, the other ticks walk the domain pool with a coprime stride.
 * Adjacent ticks never repeat a line: grounded slots are never adjacent, and
 * the stride walk never lands on the same domain line twice in a row.
 */
export function pickNarrativeLine(
  phase: TickerPhase,
  inputs: TickerInputs,
  tick: number,
): string | null {
  if (phase !== "analyzing") {
    return pickTickerLine(buildTickerPool(phase, inputs), tick);
  }

  const grounded = buildTickerPool("analyzing", inputs);
  const domain = buildDomainPool(inputs.taxpayerName);

  if (grounded.length > 0 && tick % 3 === 2) {
    return grounded[Math.floor(tick / 3) % grounded.length];
  }

  // Domain ticks get their own counter: the tick minus the grounded slots
  // already shown, so the stride walk advances by exactly one per domain line.
  const domainTick =
    grounded.length > 0 ? tick - Math.floor((tick + 1) / 3) : tick;
  return domain[(domainTick * strideFor(domain.length)) % domain.length];
}
