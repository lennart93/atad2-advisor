import { describe, it, expect } from "vitest";
import {
  selectComposeRows,
  selectComposeRowsFresh,
  buildComposeItems,
  filterLetterQuestions,
  formatComposedLetterText,
  flipIdsForLetter,
  isNotDeployedMessage,
  letterLeadIn,
  type ComposedLetter,
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

describe("letterLeadIn", () => {
  const v2Questions: ComposedLetter["questions"] = [
    { question_id: "3", text: "whether KyNexis Inc is treated as a corporation for US tax purposes." },
    { question_id: "4", text: "how S4 Energy B.V. classifies the loan for Dutch tax purposes." },
    { question_id: "5", text: "in which country the management fees are subject to tax." },
  ];
  const v1Questions: ComposedLetter["questions"] = [
    { question_id: "3", text: "Could you confirm the US tax classification of KyNexis Inc?" },
    { question_id: "4", text: "Could you confirm whether a CV/BV structure is present?" },
  ];

  it("returns the lead-in when the majority of included items are v2-style (no polite opener)", () => {
    const all = new Set(["3", "4", "5"]);
    expect(letterLeadIn(v2Questions, all)).toBe("Could you please confirm:");
  });

  it("returns null when the majority of included items begin with a polite opener (v1 legacy)", () => {
    const all = new Set(["3", "4"]);
    expect(letterLeadIn(v1Questions, all)).toBeNull();
  });

  it("returns null for an empty included set", () => {
    expect(letterLeadIn(v2Questions, new Set())).toBeNull();
  });

  it("only considers included questions for the majority calculation", () => {
    // Include only one v2-style item: 1 of 1 = 100% direct -> lead-in present.
    expect(letterLeadIn(v2Questions, new Set(["3"]))).toBe("Could you please confirm:");
    // Include only v1 items from a mixed list: majority polite -> no lead-in.
    const mixed: ComposedLetter["questions"] = [
      { question_id: "A", text: "whether the entity is a corporation." },
      { question_id: "B", text: "Could you confirm the tax treatment?" },
      { question_id: "C", text: "Could you confirm whether the loan is arm's length?" },
    ];
    // B and C are polite (2/2 included) -> legacy.
    expect(letterLeadIn(mixed, new Set(["B", "C"]))).toBeNull();
    // A and B: 1 direct / 1 polite = tied -> not a strict majority polite -> lead-in.
    expect(letterLeadIn(mixed, new Set(["A", "B"]))).toBe("Could you please confirm:");
  });

  it("is case-insensitive for the polite-opener detection", () => {
    const questions: ComposedLetter["questions"] = [
      { question_id: "1", text: "COULD YOU CONFIRM the amount?" },
      { question_id: "2", text: "CAN YOU confirm whether the rate applies?" },
    ];
    // Both are polite openers -> legacy -> null.
    expect(letterLeadIn(questions, new Set(["1", "2"]))).toBeNull();
  });

  it("treats 'Please confirm' at the start as a polite opener", () => {
    const questions: ComposedLetter["questions"] = [
      { question_id: "1", text: "Please confirm whether the entity is resident." },
      { question_id: "2", text: "Please confirm the interest rate." },
    ];
    expect(letterLeadIn(questions, new Set(["1", "2"]))).toBeNull();
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

  it("v1-style questions: no collective lead-in added (legacy behaviour unchanged)", () => {
    const out = formatComposedLetterText(letter, new Set(["3", "4"]), meta);
    expect(out).not.toContain("Could you please confirm:");
    // The individual questions are still present verbatim.
    expect(out).toContain("1. Could you confirm the US tax classification of KyNexis Inc?");
  });

  describe("v2-style questions (direct clauses)", () => {
    const v2Letter: ComposedLetter = {
      understandings: ["Kynexis BV holds 100% of KyNexis Inc."],
      questions: [
        { question_id: "3", text: "how Kynexis Inc is treated for US tax purposes." },
        { question_id: "4", text: "whether interest payments to Kynexis BV are deductible." },
      ],
    };

    it("inserts the collective lead-in before the numbered list", () => {
      const out = formatComposedLetterText(v2Letter, new Set(["3", "4"]), meta);
      expect(out).toContain("Could you please confirm:\n\n1. how Kynexis Inc");
    });

    it("full plain-text snapshot for v2 letter with understandings", () => {
      const out = formatComposedLetterText(v2Letter, new Set(["3", "4"]), meta);
      expect(out).toBe(
        "Questions for Camden B.V. (FY 2025)\n" +
          "Recorded on 11 June 2026\n" +
          "\n" +
          "We understand that:\n" +
          "- Kynexis BV holds 100% of KyNexis Inc.\n" +
          "\n" +
          "Could you please confirm:\n" +
          "\n" +
          "1. how Kynexis Inc is treated for US tax purposes.\n" +
          "\n" +
          "2. whether interest payments to Kynexis BV are deductible.\n",
      );
    });

    it("lead-in still present when no understandings", () => {
      const noUnder: ComposedLetter = { understandings: [], questions: v2Letter.questions };
      const out = formatComposedLetterText(noUnder, new Set(["3", "4"]), meta);
      expect(out).toContain("Could you please confirm:");
      expect(out).not.toContain("We understand that:");
    });

    it("lead-in absent after excluding all v2 items (empty included set gives no lead-in)", () => {
      const out = formatComposedLetterText(v2Letter, new Set(), meta);
      expect(out).not.toContain("Could you please confirm:");
    });
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
