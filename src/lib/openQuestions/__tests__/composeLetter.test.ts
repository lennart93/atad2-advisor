import { describe, it, expect } from "vitest";
import {
  selectComposeRows,
  selectComposeRowsFresh,
  selectComposeSelectionFresh,
  selectAddCandidates,
  nextAddedQuestionIds,
  buildComposeItems,
  flipIdsForLetter,
  isNotDeployedMessage,
} from "../composeLetter";
import { groupOpenQuestions } from "../grouping";
import type { QuestionBranchRow } from "../projectedPath";
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

describe("selectComposeRows", () => {
  const rows = [
    makeRow({ id: "reopen-open", question_id: "2", source: "reopen", status: "open" }),
    makeRow({ id: "active-open", question_id: "3", status: "open" }),
    makeRow({ id: "active-sent", question_id: "4", status: "taken_to_client" }),
    makeRow({ id: "later-open", question_id: "9", status: "open" }),
    makeRow({ id: "hist-resolved", question_id: "5", status: "resolved" }),
    makeRow({ id: "hist-dismissed", question_id: "6", status: "dismissed" }),
    makeRow({ id: "hist-answered", question_id: "7", status: "answered", client_answer: "Yes." }),
  ];
  const groups = groupOpenQuestions(rows, new Set(["2", "3", "4", "5", "6", "7"]));

  it("includes needsAttention and active open/taken_to_client rows in group order", () => {
    const selected = selectComposeRows(groups);
    expect(selected.map((r) => r.id)).toEqual([
      "reopen-open",
      "active-open",
      "active-sent",
    ]);
  });

  it("never includes the later group, even though those rows are open", () => {
    const selected = selectComposeRows(groups);
    expect(selected.map((r) => r.id)).not.toContain("later-open");
  });

  it("excludes resolved, dismissed and answered rows", () => {
    const selected = selectComposeRows(groups);
    const ids = selected.map((r) => r.id);
    expect(ids).not.toContain("hist-resolved");
    expect(ids).not.toContain("hist-dismissed");
    expect(ids).not.toContain("hist-answered");
  });
});

describe("selectComposeRowsFresh", () => {
  // Questionnaire: 1 -yes-> 2, 1 -no-> 3; 2 and 3 both end.
  const branches: QuestionBranchRow[] = [
    { question_id: "1", answer_option: "Yes", next_question_id: "2" },
    { question_id: "1", answer_option: "No", next_question_id: "3" },
    { question_id: "2", answer_option: "Yes", next_question_id: "end" },
    { question_id: "2", answer_option: "No", next_question_id: "end" },
    { question_id: "3", answer_option: "Yes", next_question_id: "end" },
    { question_id: "3", answer_option: "No", next_question_id: "end" },
  ];
  const rows = [
    makeRow({ id: "row-2", question_id: "2", status: "open" }),
    makeRow({ id: "row-3", question_id: "3", status: "open" }),
  ];

  it("keeps only rows on the path projected from the fresh suggestions", () => {
    const selected = selectComposeRowsFresh(
      rows,
      new Map(),
      new Map([["1", "yes"]]),
      branches,
    );
    expect(selected.map((r) => r.id)).toEqual(["row-2"]);
  });

  it("a recorded answer beats the suggestion when steering the path", () => {
    const selected = selectComposeRowsFresh(
      rows,
      new Map([["1", "No"]]),
      new Map([["1", "yes"]]),
      branches,
    );
    expect(selected.map((r) => r.id)).toEqual(["row-3"]);
  });

  it("missing suggestions widen to wildcards: the off-path bug mechanics", () => {
    // This is exactly what the stale query cache produced at the completion
    // transition: no suggestions yet, every branch explored, every question
    // "active". The fix is feeding this function FRESH maps, not changing
    // the walk.
    const selected = selectComposeRowsFresh(rows, new Map(), new Map(), branches);
    expect(selected.map((r) => r.id)).toEqual(["row-2", "row-3"]);
  });

  it("reopen rows stay selected even when off the projected path", () => {
    const withReopen = [
      ...rows,
      makeRow({ id: "row-reopen", question_id: "3", source: "reopen" }),
    ];
    const selected = selectComposeRowsFresh(
      withReopen,
      new Map(),
      new Map([["1", "yes"]]),
      branches,
    );
    expect(selected.map((r) => r.id)).toEqual(["row-reopen", "row-2"]);
  });

  it("excludes terminal rows regardless of the path", () => {
    const withHistory = [
      ...rows,
      makeRow({ id: "row-done", question_id: "2", status: "answered" }),
      makeRow({ id: "row-gone", question_id: "2", status: "dismissed" }),
    ];
    const selected = selectComposeRowsFresh(
      withHistory,
      new Map(),
      new Map([["1", "yes"]]),
      branches,
    );
    expect(selected.map((r) => r.id)).toEqual(["row-2"]);
  });

  it("returns empty for genuinely empty fresh rows", () => {
    expect(selectComposeRowsFresh([], new Map(), new Map(), branches)).toEqual([]);
  });

  describe("with extraQuestionIds (advisor-added off-path questions)", () => {
    // Suggestion 1=yes puts question 2 on the path; question 3 is off-path.

    it("additionally includes the targeted off-path open row, after the base", () => {
      const selected = selectComposeRowsFresh(
        rows,
        new Map(),
        new Map([["1", "yes"]]),
        branches,
        ["3"],
      );
      expect(selected.map((r) => r.id)).toEqual(["row-2", "row-3"]);
    });

    it("includes an added off-path row that is already taken_to_client", () => {
      const withSent = [
        rows[0],
        makeRow({ id: "row-3-sent", question_id: "3", status: "taken_to_client" }),
      ];
      const selected = selectComposeRowsFresh(
        withSent,
        new Map(),
        new Map([["1", "yes"]]),
        branches,
        ["3"],
      );
      expect(selected.map((r) => r.id)).toEqual(["row-2", "row-3-sent"]);
    });

    it("ignores unknown ids", () => {
      const selected = selectComposeRowsFresh(
        rows,
        new Map(),
        new Map([["1", "yes"]]),
        branches,
        ["99"],
      );
      expect(selected.map((r) => r.id)).toEqual(["row-2"]);
    });

    it("drops added ids whose row is meanwhile answered or dismissed", () => {
      const settled = [
        rows[0],
        makeRow({ id: "row-3-done", question_id: "3", status: "answered" }),
        makeRow({ id: "row-4-gone", question_id: "4", status: "dismissed" }),
      ];
      const selected = selectComposeRowsFresh(
        settled,
        new Map(),
        new Map([["1", "yes"]]),
        branches,
        ["3", "4"],
      );
      expect(selected.map((r) => r.id)).toEqual(["row-2"]);
    });

    it("never duplicates a row when an extra id is meanwhile on-path", () => {
      const selected = selectComposeRowsFresh(
        rows,
        new Map(),
        new Map([["1", "yes"]]),
        branches,
        ["2"],
      );
      expect(selected.map((r) => r.id)).toEqual(["row-2"]);
    });
  });
});

describe("selectComposeSelectionFresh", () => {
  const branches: QuestionBranchRow[] = [
    { question_id: "1", answer_option: "Yes", next_question_id: "2" },
    { question_id: "1", answer_option: "No", next_question_id: "3" },
    { question_id: "2", answer_option: "Yes", next_question_id: "end" },
    { question_id: "2", answer_option: "No", next_question_id: "end" },
    { question_id: "3", answer_option: "Yes", next_question_id: "end" },
    { question_id: "3", answer_option: "No", next_question_id: "end" },
  ];
  const rows = [
    makeRow({ id: "row-2", question_id: "2", status: "open" }),
    makeRow({ id: "row-3", question_id: "3", status: "open" }),
  ];

  it("reports only the extras that actually landed off-path and open", () => {
    const selection = selectComposeSelectionFresh(
      rows,
      new Map(),
      new Map([["1", "yes"]]),
      branches,
      ["3", "2", "99"],
    );
    expect(selection.rows.map((r) => r.id)).toEqual(["row-2", "row-3"]);
    // "2" is on-path (already in the base) and "99" is unknown: both cleaned.
    expect(selection.addedQuestionIds).toEqual(["3"]);
  });

  it("reports no added ids without extras", () => {
    const selection = selectComposeSelectionFresh(
      rows,
      new Map(),
      new Map([["1", "yes"]]),
      branches,
    );
    expect(selection.rows.map((r) => r.id)).toEqual(["row-2"]);
    expect(selection.addedQuestionIds).toEqual([]);
  });
});

describe("selectAddCandidates", () => {
  const later = [
    makeRow({ id: "cand-open", question_id: "8", status: "open" }),
    makeRow({ id: "cand-sent", question_id: "9", status: "taken_to_client" }),
    makeRow({ id: "cand-in-letter", question_id: "10", status: "open" }),
  ];

  it("offers off-path open and taken_to_client rows not already in the letter", () => {
    const candidates = selectAddCandidates(later, new Set(["10"]));
    expect(candidates.map((r) => r.id)).toEqual(["cand-open", "cand-sent"]);
  });

  it("offers everything when the letter holds none of them", () => {
    expect(selectAddCandidates(later, new Set()).map((r) => r.id)).toEqual([
      "cand-open",
      "cand-sent",
      "cand-in-letter",
    ]);
  });

  it("defensively drops rows in other statuses", () => {
    const mixed = [
      ...later,
      makeRow({ id: "cand-done", question_id: "11", status: "answered" }),
    ];
    expect(selectAddCandidates(mixed, new Set()).map((r) => r.id)).not.toContain(
      "cand-done",
    );
  });

  it("returns empty for an empty later group", () => {
    expect(selectAddCandidates([], new Set())).toEqual([]);
  });
});

describe("nextAddedQuestionIds", () => {
  it("keeps still-ticked added ids and appends the staged ids", () => {
    expect(
      nextAddedQuestionIds(["8", "9"], new Set(["8", "9", "3"]), ["10"]),
    ).toEqual(["8", "9", "10"]);
  });

  it("drops added ids the advisor unticked in the main list", () => {
    expect(nextAddedQuestionIds(["8", "9"], new Set(["9"]), [])).toEqual(["9"]);
  });

  it("dedupes a staged id that is already among the kept added ids", () => {
    expect(nextAddedQuestionIds(["8"], new Set(["8"]), ["8", "10"])).toEqual([
      "8",
      "10",
    ]);
  });

  it("dedupes duplicates inside the inputs themselves", () => {
    expect(
      nextAddedQuestionIds(["8", "8"], new Set(["8"]), ["10", "10"]),
    ).toEqual(["8", "10"]);
  });

  it("returns just the staged ids when nothing was added before", () => {
    expect(nextAddedQuestionIds([], new Set(["3"]), ["8"])).toEqual(["8"]);
  });
});

describe("buildComposeItems", () => {
  it("uses resolveText output as client_question and carries why_it_matters", () => {
    const rows = [
      makeRow({ id: "a", question_id: "3", why_it_matters: "Drives art. 12aa." }),
      makeRow({ id: "b", question_id: "4", why_it_matters: null }),
    ];
    const items = buildComposeItems(rows, (row) => `Text for ${row.question_id}`);
    expect(items).toEqual([
      { question_id: "3", client_question: "Text for 3", why_it_matters: "Drives art. 12aa." },
      { question_id: "4", client_question: "Text for 4", why_it_matters: null },
    ]);
  });
});

describe("flipIdsForLetter", () => {
  // The Set holds REGISTER question ids: for a grouped letter, the union of
  // question_ids over the included output questions (covered ids in, row ids
  // out).
  const rows = [
    makeRow({ id: "open-covered", question_id: "3", status: "open" }),
    makeRow({ id: "sent-covered", question_id: "4", status: "taken_to_client" }),
    makeRow({ id: "open-uncovered", question_id: "5", status: "open" }),
  ];

  it("returns only covered rows that are still open", () => {
    expect(flipIdsForLetter(rows, new Set(["3", "4"]))).toEqual(["open-covered"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(flipIdsForLetter(rows, new Set(["4"]))).toEqual([]);
  });
});

describe("isNotDeployedMessage", () => {
  it("matches the deployed index.ts unknown-action signature", () => {
    expect(isNotDeployedMessage("Unknown action: compose_client_letter")).toBe(true);
  });

  it("matches the missing-prompt signature from loadActivePrompt", () => {
    expect(
      isNotDeployedMessage(
        "No active prompt for compose_client_letter. Seed migration not run?",
      ),
    ).toBe(true);
  });

  it("does not match other errors", () => {
    expect(isNotDeployedMessage("Internal error")).toBe(false);
  });
});
