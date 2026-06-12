import { describe, it, expect } from "vitest";
import {
  WORDING_PROMPT_VERSION,
  missingClientWording,
  decidePipelineStart,
  mergeFreshWording,
} from "../letterPipeline";
import type { StoredLetter } from "../letterStore";
import type { OpenQuestionRow } from "../types";

function makeRow(overrides: Partial<OpenQuestionRow> = {}): OpenQuestionRow {
  return {
    client_answer: null,
    client_answer_at: null,
    client_question: null,
    created_at: "2026-06-01T00:00:00Z",
    id: "row-default",
    question_id: "1",
    reopen_reason: null,
    resolution_note: null,
    resolved_at: null,
    session_id: "session-1",
    source: "swarm",
    status: "open",
    taken_to_client_at: null,
    updated_at: "2026-06-01T00:00:00Z",
    why_it_matters: null,
    ...overrides,
  };
}

const stored: StoredLetter = {
  v: 1,
  letter: {
    understandings: ["The BV holds the loan."],
    questions: [{ question_id: "3", text: "Could you confirm the terms?" }],
  },
  includedIds: ["3"],
  composedAt: "2026-06-11T14:32:00.000Z",
};

describe("missingClientWording", () => {
  it("is true for null, empty and whitespace-only client_question", () => {
    expect(missingClientWording(makeRow({ client_question: null }))).toBe(true);
    expect(missingClientWording(makeRow({ client_question: "" }))).toBe(true);
    expect(missingClientWording(makeRow({ client_question: "   " }))).toBe(true);
  });

  it("is false once real wording exists", () => {
    expect(
      missingClientWording(makeRow({ client_question: "Could you confirm?" })),
    ).toBe(false);
  });
});

describe("decidePipelineStart", () => {
  const worded = makeRow({
    id: "a",
    question_id: "3",
    client_question: "Could you confirm?",
  });
  const unworded = makeRow({ id: "b", question_id: "7" });

  it("returns empty when there are no compose rows, even on transition", () => {
    expect(
      decidePipelineStart({
        completionTransition: true,
        storedLetter: null,
        composeRows: [],
        promptVersion: WORDING_PROMPT_VERSION,
      }),
    ).toEqual({ kind: "empty" });
  });

  it("empty beats a stored letter", () => {
    expect(
      decidePipelineStart({
        completionTransition: false,
        storedLetter: stored,
        composeRows: [],
        promptVersion: WORDING_PROMPT_VERSION,
      }),
    ).toEqual({ kind: "empty" });
  });

  it("a visit with a stored letter shows the stored letter", () => {
    expect(
      decidePipelineStart({
        completionTransition: false,
        storedLetter: stored,
        composeRows: [unworded],
        promptVersion: WORDING_PROMPT_VERSION,
      }),
    ).toEqual({ kind: "letter", stored });
  });

  it("a completion transition with a stored letter recomposes anyway", () => {
    const start = decidePipelineStart({
      completionTransition: true,
      storedLetter: stored,
      composeRows: [worded],
      promptVersion: WORDING_PROMPT_VERSION,
    });
    expect(start).toEqual({ kind: "compose" });
  });

  it("words first when rows miss wording and the prompt is live", () => {
    expect(
      decidePipelineStart({
        completionTransition: true,
        storedLetter: null,
        composeRows: [worded, unworded],
        promptVersion: WORDING_PROMPT_VERSION,
      }),
    ).toEqual({ kind: "wording", targetIds: ["7"] });
  });

  it("skips wording silently when the prompt version is below 12", () => {
    expect(
      decidePipelineStart({
        completionTransition: true,
        storedLetter: null,
        composeRows: [unworded],
        promptVersion: 11,
      }),
    ).toEqual({ kind: "compose" });
  });

  it("skips wording silently when the prompt version is null", () => {
    expect(
      decidePipelineStart({
        completionTransition: true,
        storedLetter: null,
        composeRows: [unworded],
        promptVersion: null,
      }),
    ).toEqual({ kind: "compose" });
  });

  it("composes directly when every row already has wording", () => {
    expect(
      decidePipelineStart({
        completionTransition: true,
        storedLetter: null,
        composeRows: [worded],
        promptVersion: WORDING_PROMPT_VERSION,
      }),
    ).toEqual({ kind: "compose" });
  });

  it("composes on a first visit without a stored letter", () => {
    expect(
      decidePipelineStart({
        completionTransition: false,
        storedLetter: null,
        composeRows: [worded],
        promptVersion: WORDING_PROMPT_VERSION,
      }),
    ).toEqual({ kind: "compose" });
  });
});

describe("mergeFreshWording", () => {
  const rows = [
    makeRow({ id: "a", question_id: "3", client_question: "Old wording" }),
    makeRow({ id: "b", question_id: "7", client_question: null }),
  ];

  it("overwrites client_question when the map holds fresh non-empty text", () => {
    const merged = mergeFreshWording(
      rows,
      new Map([
        ["3", "New wording"],
        ["7", "Fresh question"],
      ]),
    );
    expect(merged.map((r) => r.client_question)).toEqual([
      "New wording",
      "Fresh question",
    ]);
  });

  it("keeps rows untouched when the map has no entry for them", () => {
    const merged = mergeFreshWording(rows, new Map([["7", "Fresh question"]]));
    expect(merged[0].client_question).toBe("Old wording");
    expect(merged[1].client_question).toBe("Fresh question");
  });

  it("ignores null and whitespace-only map values", () => {
    const merged = mergeFreshWording(
      rows,
      new Map<string, string | null>([
        ["3", null],
        ["7", "   "],
      ]),
    );
    expect(merged[0].client_question).toBe("Old wording");
    expect(merged[1].client_question).toBeNull();
  });

  it("does not mutate the input rows", () => {
    mergeFreshWording(rows, new Map([["3", "New wording"]]));
    expect(rows[0].client_question).toBe("Old wording");
  });
});
