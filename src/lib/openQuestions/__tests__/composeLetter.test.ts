import { describe, it, expect } from "vitest";
import {
  selectComposeRows,
  buildComposeItems,
  filterLetterQuestions,
  formatComposedLetterText,
  flipIdsForLetter,
  isNotDeployedMessage,
  type ComposedLetter,
} from "../composeLetter";
import { groupOpenQuestions } from "../grouping";
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

const meta = {
  taxpayerName: "Camden B.V.",
  fiscalYear: "2025",
  dateLong: "11 June 2026",
};

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

describe("filterLetterQuestions", () => {
  const letter: ComposedLetter = {
    understandings: ["Kynexis BV holds 100% of KyNexis Inc."],
    questions: [
      { question_id: "3", text: "Could you confirm the US tax classification?" },
      { question_id: "4", text: "Could you confirm the CV/BV setup?" },
    ],
  };

  it("drops excluded question ids and keeps understandings untouched", () => {
    const out = filterLetterQuestions(letter, new Set(["4"]));
    expect(out.questions.map((q) => q.question_id)).toEqual(["4"]);
    expect(out.understandings).toEqual(letter.understandings);
  });

  it("keeps everything when all ids are included", () => {
    const out = filterLetterQuestions(letter, new Set(["3", "4"]));
    expect(out.questions).toHaveLength(2);
  });
});

describe("formatComposedLetterText", () => {
  const letter: ComposedLetter = {
    understandings: [
      "Kynexis BV holds 100% of KyNexis Inc.",
      "The group prepares consolidated accounts under IFRS.",
    ],
    questions: [
      { question_id: "3", text: "Could you confirm the US tax classification of KyNexis Inc?" },
      { question_id: "4", text: "Could you confirm whether a CV/BV structure is present?" },
    ],
  };

  it("renders header, bulleted understandings and numbered questions exactly", () => {
    const out = formatComposedLetterText(letter, new Set(["3", "4"]), meta);
    expect(out).toBe(
      "Questions for Camden B.V. (FY 2025)\n" +
        "Recorded on 11 June 2026\n" +
        "\n" +
        "We understand that:\n" +
        "- Kynexis BV holds 100% of KyNexis Inc.\n" +
        "- The group prepares consolidated accounts under IFRS.\n" +
        "\n" +
        "1. Could you confirm the US tax classification of KyNexis Inc?\n" +
        "\n" +
        "2. Could you confirm whether a CV/BV structure is present?\n",
    );
  });

  it("omits the understandings block, including its heading, when empty", () => {
    const out = formatComposedLetterText(
      { understandings: [], questions: letter.questions },
      new Set(["3", "4"]),
      meta,
    );
    expect(out).not.toContain("We understand that:");
    expect(out).toBe(
      "Questions for Camden B.V. (FY 2025)\n" +
        "Recorded on 11 June 2026\n" +
        "\n" +
        "1. Could you confirm the US tax classification of KyNexis Inc?\n" +
        "\n" +
        "2. Could you confirm whether a CV/BV structure is present?\n",
    );
  });

  it("treats whitespace-only understandings as empty", () => {
    const out = formatComposedLetterText(
      { understandings: ["   ", ""], questions: letter.questions },
      new Set(["3", "4"]),
      meta,
    );
    expect(out).not.toContain("We understand that:");
  });

  it("renumbers 1..n after an exclusion", () => {
    const out = formatComposedLetterText(letter, new Set(["4"]), meta);
    expect(out).toContain("1. Could you confirm whether a CV/BV structure is present?");
    expect(out).not.toContain("2. ");
    expect(out).not.toContain("US tax classification");
  });

  it("contains no em-dash or en-dash characters", () => {
    const out = formatComposedLetterText(letter, new Set(["3", "4"]), meta);
    expect(out.includes("—")).toBe(false);
    expect(out.includes("–")).toBe(false);
  });

  it("ends with exactly one trailing newline", () => {
    const out = formatComposedLetterText(letter, new Set(["3", "4"]), meta);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});

describe("flipIdsForLetter", () => {
  const rows = [
    makeRow({ id: "open-included", question_id: "3", status: "open" }),
    makeRow({ id: "sent-included", question_id: "4", status: "taken_to_client" }),
    makeRow({ id: "open-excluded", question_id: "5", status: "open" }),
  ];

  it("returns only included rows that are still open", () => {
    expect(flipIdsForLetter(rows, new Set(["3", "4"]))).toEqual(["open-included"]);
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
