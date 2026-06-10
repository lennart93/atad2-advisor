import { describe, it, expect } from "vitest";
import {
  formatOpenQuestionsText,
  rowsToExportItems,
  buildClientResponsesDocument,
} from "../exportText";
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
  dateLong: "10 June 2026",
};

describe("formatOpenQuestionsText", () => {
  it("formats two items, one with and one without why it matters, exactly", () => {
    const out = formatOpenQuestionsText(
      [
        { question: "Is there a hybrid entity in the group?", whyItMatters: "Drives art. 12aa applicability." },
        { question: "Does the group prepare a local file?", whyItMatters: null },
      ],
      meta,
    );
    expect(out).toBe(
      "Open questions for Camden B.V. (FY 2025)\n" +
        "Recorded on 10 June 2026\n" +
        "\n" +
        "1. Is there a hybrid entity in the group?\n" +
        "   Why it matters: Drives art. 12aa applicability.\n" +
        "\n" +
        "2. Does the group prepare a local file?\n",
    );
  });

  it("numbers items sequentially and ends with a single trailing newline", () => {
    const out = formatOpenQuestionsText(
      [
        { question: "Q one", whyItMatters: null },
        { question: "Q two", whyItMatters: null },
        { question: "Q three", whyItMatters: null },
      ],
      meta,
    );
    expect(out).toMatch(/^Open questions for Camden B\.V\. \(FY 2025\)\n/);
    expect(out).toContain("\n1. Q one\n");
    expect(out).toContain("\n2. Q two\n");
    expect(out).toContain("\n3. Q three\n");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("contains no em-dash characters", () => {
    const out = formatOpenQuestionsText(
      [{ question: "Q one", whyItMatters: "Because." }],
      meta,
    );
    expect(out.includes("—")).toBe(false);
  });
});

describe("rowsToExportItems", () => {
  const rows = [
    makeRow({ id: "reopen-open", question_id: "2", source: "reopen", status: "open", why_it_matters: "Reopen reason." }),
    makeRow({ id: "active-open", question_id: "3", status: "open" }),
    makeRow({ id: "active-sent", question_id: "4", status: "taken_to_client" }),
    makeRow({ id: "later-open", question_id: "9", status: "open" }),
    makeRow({ id: "hist-resolved", question_id: "5", status: "resolved" }),
  ];
  const groups = groupOpenQuestions(rows, new Set(["2", "3", "4", "5"]));
  const resolveText = (row: OpenQuestionRow) => `Text for ${row.question_id}`;

  it("includes needsAttention and active in group order, excluding history", () => {
    const { items, flipRowIds } = rowsToExportItems(groups, resolveText, false);
    expect(items.map((i) => i.question)).toEqual([
      "Text for 2",
      "Text for 3",
      "Text for 4",
    ]);
    expect(items[0].whyItMatters).toBe("Reopen reason.");
    expect(flipRowIds.sort()).toEqual(["active-open", "reopen-open"]);
  });

  it("appends the later group when includeLater is true", () => {
    const { items, flipRowIds } = rowsToExportItems(groups, resolveText, true);
    expect(items.map((i) => i.question)).toEqual([
      "Text for 2",
      "Text for 3",
      "Text for 4",
      "Text for 9",
    ]);
    expect(flipRowIds.sort()).toEqual(["active-open", "later-open", "reopen-open"]);
  });

  it("only returns flip ids for rows whose status is open, never taken_to_client", () => {
    const { flipRowIds } = rowsToExportItems(groups, resolveText, true);
    expect(flipRowIds).not.toContain("active-sent");
    expect(flipRowIds).not.toContain("hist-resolved");
  });

  it("excludes answered rows even when they carry a saved client answer", () => {
    const withAnswered = [
      ...rows,
      makeRow({
        id: "hist-answered",
        question_id: "6",
        status: "answered",
        client_answer: "Yes, the US LLC.",
      }),
    ];
    const g = groupOpenQuestions(withAnswered, new Set(["2", "3", "4", "5", "6"]));
    const { items, flipRowIds } = rowsToExportItems(g, resolveText, true);
    expect(items.map((i) => i.question)).not.toContain("Text for 6");
    expect(flipRowIds).not.toContain("hist-answered");
  });

  it("returns the selected rows in export order for per-row audit logging", () => {
    const { rows: selectedRows } = rowsToExportItems(groups, resolveText, false);
    expect(selectedRows.map((r) => r.id)).toEqual([
      "reopen-open",
      "active-open",
      "active-sent",
    ]);
  });

  it("keeps items, rows and numbering aligned when later rows are included", () => {
    const { items, rows: selectedRows } = rowsToExportItems(groups, resolveText, true);
    expect(selectedRows).toHaveLength(items.length);
    expect(selectedRows.map((r) => `Text for ${r.question_id}`)).toEqual(
      items.map((i) => i.question),
    );
  });
});

describe("buildClientResponsesDocument", () => {
  it("builds the document with title, blank line, and blank-line separated entries", () => {
    const out = buildClientResponsesDocument(
      [
        { questionId: "3", question: "Is there a hybrid entity?", clientAnswer: "Yes, the US LLC." },
        { questionId: "7", question: "Is a CV/BV structure present?", clientAnswer: "No." },
      ],
      "10 June 2026",
    );
    expect(out).toBe(
      "Client responses recorded by the advisor on 10 June 2026\n" +
        "\n" +
        "Question 3: Is there a hybrid entity?\n" +
        "Client response: Yes, the US LLC.\n" +
        "\n" +
        "Question 7: Is a CV/BV structure present?\n" +
        "Client response: No.\n",
    );
  });

  it("returns an empty string for empty entries", () => {
    expect(buildClientResponsesDocument([], "10 June 2026")).toBe("");
  });

  it("contains no em-dash characters", () => {
    const out = buildClientResponsesDocument(
      [{ questionId: "1", question: "Q", clientAnswer: "A" }],
      "10 June 2026",
    );
    expect(out.includes("—")).toBe(false);
  });
});
