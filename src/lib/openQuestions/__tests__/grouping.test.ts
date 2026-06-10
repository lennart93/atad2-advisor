import { describe, it, expect } from "vitest";
import {
  groupOpenQuestions,
  countActiveOpenQuestions,
  resolveClientQuestion,
  isOnProjectedPath,
  visibleActionsFor,
  dismissedGateHint,
} from "../grouping";
import { FALLBACK_QUESTION_SENTENCE, type OpenQuestionRow } from "../types";

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

describe("groupOpenQuestions", () => {
  it("puts terminal statuses in history even when source is reopen", () => {
    const rows = [
      makeRow({ id: "a", status: "answered", source: "reopen" }),
      makeRow({ id: "b", status: "resolved", source: "reopen" }),
      makeRow({ id: "c", status: "confirmed_unknown", source: "reopen" }),
      makeRow({ id: "d", status: "dismissed", source: "reopen" }),
    ];
    const groups = groupOpenQuestions(rows, new Set());
    expect(groups.history.map((r) => r.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(groups.needsAttention).toHaveLength(0);
    expect(groups.active).toHaveLength(0);
    expect(groups.later).toHaveLength(0);
  });

  it("routes reopen rows with status open to needsAttention", () => {
    const groups = groupOpenQuestions(
      [makeRow({ id: "a", status: "open", source: "reopen" })],
      new Set(),
    );
    expect(groups.needsAttention.map((r) => r.id)).toEqual(["a"]);
  });

  it("routes reopen rows with status taken_to_client to needsAttention", () => {
    const groups = groupOpenQuestions(
      [makeRow({ id: "a", status: "taken_to_client", source: "reopen" })],
      new Set(),
    );
    expect(groups.needsAttention.map((r) => r.id)).toEqual(["a"]);
  });

  it("splits open rows into active (on projected path) and later (off projected path)", () => {
    const rows = [
      makeRow({ id: "on", question_id: "3", status: "open" }),
      makeRow({ id: "off", question_id: "7", status: "open" }),
    ];
    const groups = groupOpenQuestions(rows, new Set(["3"]));
    expect(groups.active.map((r) => r.id)).toEqual(["on"]);
    expect(groups.later.map((r) => r.id)).toEqual(["off"]);
  });

  it("splits taken_to_client rows into active (on projected path) and later (off projected path)", () => {
    const rows = [
      makeRow({ id: "on", question_id: "3", status: "taken_to_client" }),
      makeRow({ id: "off", question_id: "7", status: "taken_to_client" }),
    ];
    const groups = groupOpenQuestions(rows, new Set(["3"]));
    expect(groups.active.map((r) => r.id)).toEqual(["on"]);
    expect(groups.later.map((r) => r.id)).toEqual(["off"]);
  });

  it("sorts active and later numerically by question_id ('2' before '10')", () => {
    const rows = [
      makeRow({ id: "a", question_id: "10", status: "open" }),
      makeRow({ id: "b", question_id: "2", status: "open" }),
      makeRow({ id: "c", question_id: "10", status: "open" }),
      makeRow({ id: "d", question_id: "2", status: "open" }),
    ];
    const groups = groupOpenQuestions(rows, new Set(["10", "2"]));
    // a,b on-path; c,d off-path is not the setup here: all four share question ids.
    expect(groups.active.map((r) => r.question_id)).toEqual(["2", "2", "10", "10"]);
  });

  it("sorts later numerically by question_id when off the projected path", () => {
    const rows = [
      makeRow({ id: "a", question_id: "12", status: "open" }),
      makeRow({ id: "b", question_id: "9", status: "open" }),
    ];
    const groups = groupOpenQuestions(rows, new Set());
    expect(groups.later.map((r) => r.question_id)).toEqual(["9", "12"]);
  });

  it("sorts needsAttention and history by updated_at descending", () => {
    const rows = [
      makeRow({ id: "old-reopen", source: "reopen", updated_at: "2026-06-01T00:00:00Z" }),
      makeRow({ id: "new-reopen", source: "reopen", updated_at: "2026-06-09T00:00:00Z" }),
      makeRow({ id: "old-hist", status: "resolved", updated_at: "2026-06-02T00:00:00Z" }),
      makeRow({ id: "new-hist", status: "answered", updated_at: "2026-06-08T00:00:00Z" }),
    ];
    const groups = groupOpenQuestions(rows, new Set());
    expect(groups.needsAttention.map((r) => r.id)).toEqual(["new-reopen", "old-reopen"]);
    expect(groups.history.map((r) => r.id)).toEqual(["new-hist", "old-hist"]);
  });
});

describe("countActiveOpenQuestions", () => {
  it("counts needsAttention plus active only, excluding later and history", () => {
    const rows = [
      makeRow({ id: "a", source: "reopen", status: "open" }),
      makeRow({ id: "b", question_id: "2", status: "open" }),
      makeRow({ id: "c", question_id: "99", status: "open" }),
      makeRow({ id: "d", status: "resolved" }),
      makeRow({ id: "e", status: "answered" }),
    ];
    const groups = groupOpenQuestions(rows, new Set(["1", "2"]));
    expect(countActiveOpenQuestions(groups)).toBe(2);
  });
});

describe("isOnProjectedPath", () => {
  it("is true when the question is in the projected path set", () => {
    expect(isOnProjectedPath(makeRow({ question_id: "4" }), new Set(["4"]))).toBe(true);
    expect(isOnProjectedPath(makeRow({ question_id: "4" }), new Set(["5"]))).toBe(false);
  });
});

describe("visibleActionsFor", () => {
  it("offers keep-as-unknown for active rows without an answer row regardless of path", () => {
    for (const status of ["open", "taken_to_client"]) {
      expect(visibleActionsFor(makeRow({ status }), false, undefined).keepAsUnknown).toBe(true);
      // Projected-but-unanswered: the write path falls back to the register.
      expect(visibleActionsFor(makeRow({ status }), true, undefined).keepAsUnknown).toBe(true);
    }
  });

  it("offers keep-as-unknown for answered active rows only when the answer is Unknown", () => {
    expect(visibleActionsFor(makeRow({ status: "open" }), true, "Unknown").keepAsUnknown).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "taken_to_client" }), true, "Unknown").keepAsUnknown).toBe(true);
    // Yes/No-answered rows are reopen flags: only editing the answer moves the gate.
    expect(visibleActionsFor(makeRow({ status: "open" }), true, "Yes").keepAsUnknown).toBe(false);
    expect(visibleActionsFor(makeRow({ status: "open" }), true, "No").keepAsUnknown).toBe(false);
  });

  it("never offers keep-as-unknown on terminal rows", () => {
    for (const status of ["answered", "resolved", "confirmed_unknown", "dismissed"]) {
      expect(visibleActionsFor(makeRow({ status }), false, undefined).keepAsUnknown).toBe(false);
    }
  });

  it("offers not-relevant for all active rows regardless of path", () => {
    expect(visibleActionsFor(makeRow({ status: "open" }), false, undefined).notRelevant).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "taken_to_client" }), false, undefined).notRelevant).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "open" }), true, "Unknown").notRelevant).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "open" }), true, undefined).notRelevant).toBe(true);
  });

  it("never offers not-relevant on terminal rows", () => {
    for (const status of ["answered", "resolved", "confirmed_unknown", "dismissed"]) {
      expect(visibleActionsFor(makeRow({ status }), true, undefined).notRelevant).toBe(false);
    }
  });

  it("offers restore only for dismissed rows", () => {
    expect(visibleActionsFor(makeRow({ status: "dismissed" }), false, undefined).restore).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "dismissed" }), true, "Unknown").restore).toBe(true);
    for (const status of ["open", "taken_to_client", "answered", "resolved", "confirmed_unknown"]) {
      expect(visibleActionsFor(makeRow({ status }), false, undefined).restore).toBe(false);
    }
  });

  it("offers mark-as-sent only while the row is still open", () => {
    expect(visibleActionsFor(makeRow({ status: "open" }), false, undefined).markSentToClient).toBe(true);
    for (const status of ["taken_to_client", "answered", "resolved", "confirmed_unknown", "dismissed"]) {
      expect(visibleActionsFor(makeRow({ status }), false, undefined).markSentToClient).toBe(false);
    }
  });

  it("offers the client-answer input for active rows and the edit affordance for answered rows", () => {
    expect(visibleActionsFor(makeRow({ status: "open" }), false, undefined).clientAnswerInput).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "taken_to_client" }), false, undefined).clientAnswerInput).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "answered" }), false, undefined).clientAnswerInput).toBe(false);
    expect(visibleActionsFor(makeRow({ status: "answered" }), false, undefined).editClientAnswer).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "resolved" }), false, undefined).editClientAnswer).toBe(false);
  });

  it("offers go-to-question only when an answer row exists, including answered history rows", () => {
    expect(visibleActionsFor(makeRow({ status: "open" }), true, "Unknown").goToQuestion).toBe(true);
    expect(visibleActionsFor(makeRow({ status: "answered" }), true, "Unknown").goToQuestion).toBe(true);
    // Projected but never answered: the ?q= deep link cannot replay there yet.
    expect(visibleActionsFor(makeRow({ status: "open" }), true, undefined).goToQuestion).toBe(false);
    expect(visibleActionsFor(makeRow({ status: "open" }), false, undefined).goToQuestion).toBe(false);
  });
});

describe("dismissedGateHint", () => {
  it("returns the hint for a dismissed projected-path row without a definitive answer", () => {
    const hintNoAnswer = dismissedGateHint(makeRow({ status: "dismissed" }), true, undefined);
    expect(hintNoAnswer).toMatch(/answer or a confirmed unknown/);
    const hintUnknown = dismissedGateHint(makeRow({ status: "dismissed" }), true, "Unknown");
    expect(hintUnknown).toMatch(/final memo/);
  });

  it("returns null when the underlying question already has a Yes or No answer", () => {
    expect(dismissedGateHint(makeRow({ status: "dismissed" }), true, "Yes")).toBeNull();
    expect(dismissedGateHint(makeRow({ status: "dismissed" }), true, "No")).toBeNull();
  });

  it("returns null for non-dismissed rows", () => {
    for (const status of ["open", "taken_to_client", "answered", "resolved", "confirmed_unknown"]) {
      expect(dismissedGateHint(makeRow({ status }), true, undefined)).toBeNull();
    }
  });

  it("returns null for dismissed rows off the projected path", () => {
    expect(dismissedGateHint(makeRow({ status: "dismissed" }), false, undefined)).toBeNull();
  });

  it("never contains an em-dash", () => {
    const hint = dismissedGateHint(makeRow({ status: "dismissed" }), true, undefined);
    expect(hint).not.toContain("—");
  });
});

describe("resolveClientQuestion", () => {
  const official = new Map([["3", "Does the group include a hybrid entity?"]]);

  it("returns the trimmed client_question when present", () => {
    const row = makeRow({ question_id: "3", client_question: "  What did the client agree?  " });
    expect(resolveClientQuestion(row, official)).toBe("What did the client agree?");
  });

  it("falls back to the official question text when client_question is null", () => {
    const row = makeRow({ question_id: "3", client_question: null });
    expect(resolveClientQuestion(row, official)).toBe(
      "Does the group include a hybrid entity?",
    );
  });

  it("treats a whitespace-only client_question as missing", () => {
    const row = makeRow({ question_id: "3", client_question: "   " });
    expect(resolveClientQuestion(row, official)).toBe(
      "Does the group include a hybrid entity?",
    );
  });

  it("returns the fixed sentence when no official text exists either", () => {
    const row = makeRow({ question_id: "404", client_question: null });
    expect(resolveClientQuestion(row, official)).toBe(FALLBACK_QUESTION_SENTENCE);
  });
});
