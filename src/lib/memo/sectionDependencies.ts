/**
 * Which memo section depends on which dossier inputs, plus the stable
 * fingerprint used to decide which sections must regenerate after inputs
 * change ("Update memorandum", spec 2026-06-10-integral-dossier-platform-design
 * section 5). v1 granularity is per input GROUP; per-question mapping can be
 * added when the section prompts ship (slice 10).
 *
 * NOTE: when the generate-report edge function lands (slice 10) this file gets
 * a Deno mirror under supabase/functions/generate-report/. Keep both in sync.
 */

export const MEMO_SECTIONS = [
  "introduction",
  "risk_outcome",
  "executive_summary",
  "general_background",
  "technical_assessment",
  "conclusion",
] as const;

export type MemoSection = (typeof MEMO_SECTIONS)[number];

/** Regenerated together, always, so the memo cannot contradict its own outcome. */
export const RISK_TRIO: readonly MemoSection[] = [
  "risk_outcome",
  "executive_summary",
  "conclusion",
];

export type SectionInputSource =
  | "session_meta"
  | "documents"
  | "structure"
  | "answers"
  | "outcome"
  | "appendix";

export interface SectionInputs {
  session_meta: unknown;
  documents: unknown;
  structure: unknown;
  answers: unknown;
  outcome: unknown;
  appendix: unknown;
}

export const SECTION_DEPENDENCIES: Record<MemoSection, readonly SectionInputSource[]> = {
  introduction: ["session_meta", "documents"],
  general_background: ["session_meta", "documents", "structure"],
  technical_assessment: ["answers", "structure", "appendix", "documents"],
  risk_outcome: ["answers", "outcome", "appendix"],
  executive_summary: ["answers", "outcome", "appendix"],
  conclusion: ["answers", "outcome", "appendix"],
};

/** JSON.stringify with recursively sorted object keys, so logically equal
 * inputs always serialize identically. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** FNV-1a 32-bit, hex. Fingerprint only; no cryptographic strength needed.
 * Hashes UTF-16 char codes (charCodeAt), NOT UTF-8 bytes: the future Deno
 * mirror must use the same convention or hashes diverge on non-ASCII input. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hashSectionInputs(section: MemoSection, inputs: SectionInputs): string {
  const relevant = SECTION_DEPENDENCIES[section].map((source) => [source, inputs[source]]);
  return fnv1a(stableStringify(relevant));
}

/**
 * Which sections must regenerate, given the hashes stored with the previous
 * report and the current inputs. Any stale risk-trio member pulls in the whole
 * trio. Sections without a stored hash count as stale.
 */
export function staleSections(
  previousHashes: Partial<Record<MemoSection, string>>,
  inputs: SectionInputs,
): MemoSection[] {
  const stale = new Set<MemoSection>();
  for (const section of MEMO_SECTIONS) {
    if (previousHashes[section] !== hashSectionInputs(section, inputs)) stale.add(section);
  }
  if (RISK_TRIO.some((s) => stale.has(s))) RISK_TRIO.forEach((s) => stale.add(s));
  return MEMO_SECTIONS.filter((s) => stale.has(s));
}
