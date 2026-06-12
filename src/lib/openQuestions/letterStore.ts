import type { ComposedLetter } from "./composeLetter";

/**
 * Pure string codec for the last composed client letter, persisted per
 * session under localStorage by the page layer. This file never touches
 * localStorage itself: encode/decode work on strings only, so the codec is
 * fully testable and storage-less browsers degrade gracefully at the caller.
 *
 * Decoding is fail-closed: ANY malformation returns null, which callers
 * treat as "no stored letter" (they recompose instead of crashing).
 */

/** Versioned envelope for a persisted letter. */
export interface StoredLetter {
  v: 1;
  letter: ComposedLetter;
  includedIds: string[];
  composedAt: string;
}

/** localStorage key for a session's last composed letter. */
export function letterStorageKey(sessionId: string): string {
  return `client-letter:${sessionId}`;
}

/** Serializes the v1 envelope. composedAt should be an ISO timestamp. */
export function encodeStoredLetter(
  letter: ComposedLetter,
  includedIds: string[],
  composedAt: string,
): string {
  const envelope: StoredLetter = { v: 1, letter, includedIds, composedAt };
  return JSON.stringify(envelope);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isComposedLetter(value: unknown): value is ComposedLetter {
  if (typeof value !== "object" || value === null) return false;
  const letter = value as Record<string, unknown>;
  if (!isStringArray(letter.understandings)) return false;
  if (!Array.isArray(letter.questions)) return false;
  return letter.questions.every((q) => {
    if (typeof q !== "object" || q === null) return false;
    const entry = q as Record<string, unknown>;
    return (
      typeof entry.question_id === "string" && typeof entry.text === "string"
    );
  });
}

/**
 * Parses a raw stored value back into the envelope. Returns null on: null
 * input, invalid JSON, a non-v1 envelope, a malformed letter, a non-string
 * includedIds array, or an unparseable composedAt.
 */
export function decodeStoredLetter(raw: string | null): StoredLetter | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const envelope = parsed as Record<string, unknown>;
  if (envelope.v !== 1) return null;
  if (!isComposedLetter(envelope.letter)) return null;
  if (!isStringArray(envelope.includedIds)) return null;
  if (typeof envelope.composedAt !== "string") return null;
  if (Number.isNaN(new Date(envelope.composedAt).getTime())) return null;
  return {
    v: 1,
    letter: envelope.letter,
    includedIds: envelope.includedIds,
    composedAt: envelope.composedAt,
  };
}

/**
 * The "Based on the worklist as of 11 June 2026, 14:32" line under the
 * letter. en-GB date plus a 24h clock, rendered in the viewer's local time.
 */
export function formatAsOfLine(composedAtIso: string): string {
  const date = new Date(composedAtIso);
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `Based on the worklist as of ${day}, ${time}`;
}
