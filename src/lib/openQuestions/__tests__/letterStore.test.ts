import { describe, it, expect } from "vitest";
import {
  letterStorageKey,
  encodeStoredLetter,
  decodeStoredLetter,
  formatAsOfLine,
  type StoredLetter,
} from "../letterStore";
import type { ComposedLetter } from "../composeLetter";

const letter: ComposedLetter = {
  understandings: ["The BV holds the loan.", "The CV is US-owned."],
  questions: [
    { question_id: "3", text: "Could you please confirm the loan terms?" },
    { question_id: "7", text: "Is the CV treated as transparent in the US?" },
  ],
};

describe("letterStorageKey", () => {
  it("namespaces by session id", () => {
    expect(letterStorageKey("abc-123")).toBe("client-letter:abc-123");
  });
});

describe("encode/decode round-trip", () => {
  it("preserves all fields through the v2 envelope", () => {
    const raw = encodeStoredLetter(
      letter,
      ["3"],
      ["7"],
      "2026-06-11T14:32:00.000Z",
    );
    const decoded = decodeStoredLetter(raw);
    expect(decoded).toEqual({
      v: 2,
      letter,
      includedIds: ["3"],
      addedQuestionIds: ["7"],
      composedAt: "2026-06-11T14:32:00.000Z",
    } satisfies StoredLetter);
  });

  it("round-trips an empty letter", () => {
    const empty: ComposedLetter = { understandings: [], questions: [] };
    const decoded = decodeStoredLetter(
      encodeStoredLetter(empty, [], [], "2026-06-11T14:32:00.000Z"),
    );
    expect(decoded?.letter).toEqual(empty);
    expect(decoded?.includedIds).toEqual([]);
    expect(decoded?.addedQuestionIds).toEqual([]);
  });

  it("decodes a legacy v1 envelope with empty addedQuestionIds", () => {
    const v1 = JSON.stringify({
      v: 1,
      letter,
      includedIds: ["3"],
      composedAt: "2026-06-11T14:32:00.000Z",
    });
    expect(decodeStoredLetter(v1)).toEqual({
      v: 2,
      letter,
      includedIds: ["3"],
      addedQuestionIds: [],
      composedAt: "2026-06-11T14:32:00.000Z",
    } satisfies StoredLetter);
  });

  it("a v1 envelope with a stray addedQuestionIds field still decodes as empty", () => {
    const v1 = JSON.stringify({
      v: 1,
      letter,
      includedIds: ["3"],
      addedQuestionIds: ["7"],
      composedAt: "2026-06-11T14:32:00.000Z",
    });
    expect(decodeStoredLetter(v1)?.addedQuestionIds).toEqual([]);
  });
});

describe("decodeStoredLetter fail-closed", () => {
  const valid = (): Record<string, unknown> => ({
    v: 2,
    letter,
    includedIds: ["3"],
    addedQuestionIds: [],
    composedAt: "2026-06-11T14:32:00.000Z",
  });

  it("returns null for null input", () => {
    expect(decodeStoredLetter(null)).toBeNull();
  });

  it("returns null for garbage JSON", () => {
    expect(decodeStoredLetter("{not json")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(decodeStoredLetter('"a string"')).toBeNull();
    expect(decodeStoredLetter("null")).toBeNull();
  });

  it("returns null for an unknown envelope version", () => {
    expect(decodeStoredLetter(JSON.stringify({ ...valid(), v: 3 }))).toBeNull();
    expect(decodeStoredLetter(JSON.stringify({ ...valid(), v: "2" }))).toBeNull();
  });

  it("returns null for a v2 envelope whose addedQuestionIds is not a string array", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), addedQuestionIds: "7" })),
    ).toBeNull();
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), addedQuestionIds: [7] })),
    ).toBeNull();
    const missing = valid();
    delete missing.addedQuestionIds;
    expect(decodeStoredLetter(JSON.stringify(missing))).toBeNull();
  });

  it("returns null when the letter is missing or malformed", () => {
    const noLetter = valid();
    delete noLetter.letter;
    expect(decodeStoredLetter(JSON.stringify(noLetter))).toBeNull();
    expect(
      decodeStoredLetter(
        JSON.stringify({ ...valid(), letter: { understandings: "x", questions: [] } }),
      ),
    ).toBeNull();
    expect(
      decodeStoredLetter(
        JSON.stringify({ ...valid(), letter: { understandings: [], questions: "x" } }),
      ),
    ).toBeNull();
  });

  it("returns null when a question entry misses string question_id or text", () => {
    expect(
      decodeStoredLetter(
        JSON.stringify({
          ...valid(),
          letter: { understandings: [], questions: [{ question_id: 3, text: "t" }] },
        }),
      ),
    ).toBeNull();
    expect(
      decodeStoredLetter(
        JSON.stringify({
          ...valid(),
          letter: { understandings: [], questions: [{ question_id: "3" }] },
        }),
      ),
    ).toBeNull();
  });

  it("returns null when includedIds is not a string array", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), includedIds: "3" })),
    ).toBeNull();
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), includedIds: [3] })),
    ).toBeNull();
  });

  it("returns null when composedAt is not a parseable date", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), composedAt: "not a date" })),
    ).toBeNull();
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), composedAt: 123 })),
    ).toBeNull();
  });
});

describe("formatAsOfLine", () => {
  it("formats a fixed local timestamp as an en-GB worklist line", () => {
    // Timezone-less ISO string parses as local time, so the expected output
    // is deterministic on any machine.
    expect(formatAsOfLine("2026-06-11T14:32:00")).toBe(
      "Based on the worklist as of 11 June 2026, 14:32",
    );
  });

  it("zero-pads hours and minutes", () => {
    expect(formatAsOfLine("2026-01-05T08:05:00")).toBe(
      "Based on the worklist as of 5 January 2026, 08:05",
    );
  });
});
