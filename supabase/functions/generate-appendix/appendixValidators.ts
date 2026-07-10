// Deterministic validation layer for the technical appendix (WP2).
//
// DUAL MAINTENANCE (Deno copy) — keep IN SYNC with the frontend canonical at
// src/lib/appendix/appendixValidators.ts (same rule as
// mootness.ts x2). Pure functions only, so both the frontend tests and the edge
// function share one source of truth.
//
// Each function is a guard that NEVER silently changes a substantive answer: it
// reports a warning, or (for the consistency check) degrades a self-contradicting
// row to "Insufficient information" so the advisor decides. Nothing flips a
// status to another substantive status.
//
// Pattern lists are DRAFT, pending tax review.

export type AppendixStatus = "Not triggered" | "N/A" | "Triggered" | "Insufficient information";

// ---- F1: coverage ----------------------------------------------------------

/** Skeleton rowIds of a section that the model did NOT return. Order-preserving. */
export function missingRowIds(skeletonRowIds: string[], returnedRowIds: string[]): string[] {
  const got = new Set(returnedRowIds);
  return skeletonRowIds.filter((id) => !got.has(id));
}

// ---- F4: status <-> reasoning consistency ----------------------------------

// Text that asserts the tested condition HOLDS.
const CONFIRM_PATTERNS: RegExp[] = [
  /\bconditions? (?:is|are) met\b/i,
  /\brequirement(?:s)? (?:is|are) (?:met|satisfied)\b/i,
  /\bis satisfied\b/i,
  /\bis triggered\b/i,
  /\bmismatch arises\b/i,
  /\bthere is a (?:deduction without inclusion|double deduction|non-inclusion)\b/i,
  /\bresults? in a (?:deduction without inclusion|double deduction|mismatch)\b/i,
  /\bthis (?:condition|requirement|provision) applies\b/i,
  /\bso this condition is met\b/i,
];

// Text that asserts the tested condition does NOT hold. Checked first so
// "does not apply" never trips the CONFIRM "applies" pattern.
const NEGATE_PATTERNS: RegExp[] = [
  /\bconditions? (?:is|are) not met\b/i,
  /\bdoes not apply\b/i,
  /\bis not (?:met|satisfied|triggered|applicable)\b/i,
  /\bno mismatch\b/i,
  /\bnot satisfied\b/i,
  /\bno (?:deduction without inclusion|double deduction|non-inclusion)\b/i,
  /\bthere is no mismatch\b/i,
];

type Lean = "met" | "not_met" | "neutral";

function reasoningLean(reasoning: string | null | undefined): Lean {
  const text = String(reasoning ?? "");
  if (!text.trim()) return "neutral";
  if (NEGATE_PATTERNS.some((re) => re.test(text))) return "not_met";
  if (CONFIRM_PATTERNS.some((re) => re.test(text))) return "met";
  return "neutral";
}

export interface ConsistencyResult {
  consistent: boolean;
  /** When inconsistent, the safe status to degrade to. Never a substantive flip. */
  degradeTo?: AppendixStatus;
  warning?: string;
}

/**
 * Flag a row whose status contradicts its own reasoning (F4, e.g. B.6.1:
 * status "Not triggered" while the text ends "...so this condition is met").
 * On a hard contradiction: degrade to "Insufficient information" (the advisor
 * decides the real answer); NEVER flip to the opposite substantive status.
 */
export function checkStatusReasoningConsistency(
  status: AppendixStatus,
  reasoning: string | null | undefined,
): ConsistencyResult {
  const lean = reasoningLean(reasoning);
  if (status === "Not triggered" && lean === "met") {
    return {
      consistent: false,
      degradeTo: "Insufficient information",
      warning: `Status "Not triggered" contradicts reasoning that concludes the condition is met.`,
    };
  }
  if (status === "Triggered" && lean === "not_met") {
    return {
      consistent: false,
      degradeTo: "Insufficient information",
      warning: `Status "Triggered" contradicts reasoning that concludes the condition is not met.`,
    };
  }
  return { consistent: true };
}

// ---- F6: ownership percentage sum-check ------------------------------------

const SUM_MIN = 95;
const SUM_MAX = 105;

/**
 * Warn when the direct shareholders of one entity carry percentages that do not
 * sum to ~100% (F6: a mis-read shareholder table where Jolivia got Fossatum's
 * 37.24%). Only fires with >=2 non-null shares. Returns null when fine.
 */
export function checkOwnershipSum(
  entityLabel: string,
  shares: Array<{ owner: string; pct: number | null }>,
): string | null {
  const known = shares.filter((s) => s.pct != null) as Array<{ owner: string; pct: number }>;
  if (known.length < 2) return null;
  const total = Math.round(known.reduce((s, x) => s + x.pct, 0) * 100) / 100;
  if (total >= SUM_MIN && total <= SUM_MAX) return null;
  return `Shareholder percentages of ${entityLabel} sum to ${total}% (expected ~100%): ${known.map((s) => `${s.owner} ${s.pct}%`).join(", ")}. Verify against the source.`;
}

// ---- F9a: TIN / alias duplicate detection ----------------------------------

function normName(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(b\s*v|n\s*v|ltd|limited|inc|corp|corporation|llc|dac|gmbh|ag|sa|sarl|plc)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normTin(tin: string | null | undefined): string {
  return String(tin ?? "").replace(/[\s.-]/g, "").toLowerCase();
}

export interface DedupEntity {
  id: string;
  name: string;
  tin?: string | null;
  aliases?: string[];
}

/**
 * Warn when two register entities are almost certainly the same (F9: WMC
 * Project Holding B.V. == Liminal Holding B.V. via RSIN 8652 85 135; WMC Energy
 * Corp == WMC USA Services Corp). Matches on identical TIN, or on a shared
 * normalised name/alias. Never merges automatically; returns advisory warnings.
 */
export function findDuplicateEntities(entities: DedupEntity[]): string[] {
  const warnings: string[] = [];

  // TIN collisions.
  const byTin = new Map<string, string[]>();
  for (const e of entities) {
    const t = normTin(e.tin);
    if (!t) continue;
    (byTin.get(t) ?? byTin.set(t, []).get(t)!).push(e.id);
  }
  for (const [tin, ids] of byTin) {
    if (ids.length > 1) {
      const names = ids.map((id) => entities.find((e) => e.id === id)!.name);
      warnings.push(`Entities ${ids.join(", ")} share the same TIN (${tin}) and are likely the same entity: ${names.join(" = ")}. Merge or hide one.`);
    }
  }

  // Name / alias collisions (only when not already flagged by TIN).
  const tinFlagged = new Set(Array.from(byTin.values()).filter((v) => v.length > 1).flat());
  const byName = new Map<string, Set<string>>();
  for (const e of entities) {
    const keys = new Set<string>();
    const nn = normName(e.name);
    if (nn) keys.add(nn);
    for (const a of e.aliases ?? []) { const na = normName(a); if (na) keys.add(na); }
    for (const k of keys) {
      (byName.get(k) ?? byName.set(k, new Set()).get(k)!).add(e.id);
    }
  }
  for (const [key, idSet] of byName) {
    const ids = [...idSet];
    if (ids.length > 1 && !ids.every((id) => tinFlagged.has(id))) {
      const names = ids.map((id) => entities.find((e) => e.id === id)!.name);
      warnings.push(`Entities ${ids.join(", ")} share the name/alias "${key}" and may be the same entity: ${names.join(" = ")}. Merge or hide one.`);
    }
  }

  return warnings;
}
