import { describe, it, expect } from "vitest";
import {
  buildMergedPoints,
  buildRawPoints,
  partitionPointsByPath,
  formatPointsList,
  formatClientMessage,
  decodeStoredDraftSubmit,
  deriveAnswerType,
  deriveMergedAnswerType,
  DRAFT_CONFIDENCE,
  encodeStoredDraftSubmit,
  letterIsStale,
  mapRowStatus,
  openCount,
  parseAnswer,
  planDraftWrites,
  pointsLeadIn,
  REOPEN_SAFE_CONFIDENCE,
  resolvedCount,
  serializeAnswer,
  stillOpenLabel,
  worklistFingerprint,
  type OpenPoint,
} from "../worklist";
import type { ComposedLetter } from "../letterShape";
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

const YESNO_BRANCHES: QuestionBranchRow[] = [
  { question_id: "1", answer_option: "Yes", next_question_id: "2" },
  { question_id: "1", answer_option: "No", next_question_id: "3" },
  { question_id: "2", answer_option: "Yes", next_question_id: null },
  { question_id: "2", answer_option: "No", next_question_id: null },
  { question_id: "4", answer_option: "Yes", next_question_id: null },
  { question_id: "4", answer_option: "No", next_question_id: null },
  { question_id: "4b", answer_option: "Yes", next_question_id: null },
  { question_id: "4b", answer_option: "No", next_question_id: null },
  // A text-only node: a single free-form option, no yes/no branch.
  { question_id: "30", answer_option: "Text", next_question_id: null },
];

function letterWith(
  questions: Array<{ question_ids: string[]; text: string }>,
): ComposedLetter {
  return {
    intro: "We understand that...",
    groups: [
      {
        title: "",
        questions: questions.map((q) => ({ ...q, table: null })),
      },
    ],
  };
}

const resolveText = (row: OpenQuestionRow) =>
  row.client_question ?? `Question ${row.question_id}`;

function rowMap(rows: OpenQuestionRow[]): Map<string, OpenQuestionRow> {
  return new Map(rows.map((row) => [row.question_id, row]));
}

describe("mapRowStatus", () => {
  it("maps the register lifecycle onto the advisor statuses", () => {
    expect(mapRowStatus(makeRow({ status: "open" }))).toBe("open");
    expect(mapRowStatus(makeRow({ status: "taken_to_client" }))).toBe(
      "sent_to_client",
    );
    expect(mapRowStatus(makeRow({ status: "answered" }))).toBe("answered");
    expect(mapRowStatus(makeRow({ status: "confirmed_unknown" }))).toBe("na");
    expect(mapRowStatus(makeRow({ status: "resolved" }))).toBe("answered");
  });

  it("treats an answered row that went to the client as a client answer", () => {
    expect(
      mapRowStatus(
        makeRow({ status: "answered", taken_to_client_at: "2026-06-02T00:00:00Z" }),
      ),
    ).toBe("answered_by_client");
  });
});

describe("answer types", () => {
  it("is yesno only when the node branches on Yes and No", () => {
    expect(deriveAnswerType(YESNO_BRANCHES, "1")).toBe("yesno");
    expect(deriveAnswerType(YESNO_BRANCHES, "30")).toBe("text");
    expect(deriveAnswerType(YESNO_BRANCHES, "99")).toBe("text");
  });

  it("a merged point is yesno only when every covered node is yesno", () => {
    expect(deriveMergedAnswerType(YESNO_BRANCHES, ["4", "4b"])).toBe("yesno");
    expect(deriveMergedAnswerType(YESNO_BRANCHES, ["4", "30"])).toBe("text");
  });
});

describe("serializeAnswer / parseAnswer", () => {
  it("round-trips yes/no with and without detail", () => {
    expect(parseAnswer(serializeAnswer("yes", ""))).toEqual({
      value: "yes",
      detail: null,
    });
    expect(parseAnswer(serializeAnswer("no", "per the 2025 annual report"))).toEqual(
      { value: "no", detail: "per the 2025 annual report" },
    );
  });

  it("treats free text as detail only", () => {
    expect(parseAnswer("The fund is transparent for US purposes.")).toEqual({
      value: null,
      detail: "The fund is transparent for US purposes.",
    });
    expect(parseAnswer(null)).toEqual({ value: null, detail: null });
  });

  it("does not mistake words starting with yes/no for an answer", () => {
    expect(parseAnswer("Nothing indicates a hybrid.").value).toBeNull();
    expect(parseAnswer("Yesterday's filing confirms it.").value).toBeNull();
  });

  it("never reads a yes/no out of free-text facts that merely start with the word", () => {
    // These are the realistic documents-step inputs that must NEVER become a
    // fabricated determination, and whose first word must NOT be dropped.
    for (const fact of [
      "No US check-the-box election was made.",
      "No, the entity is not hybrid.",
      "Yes the fund elected to be opaque.",
      "Yes, S4 is treated as transparent in the US.",
      "No double deduction arises here.",
    ]) {
      expect(parseAnswer(fact)).toEqual({ value: null, detail: fact });
    }
  });

  it("still reads the canonical serialized shapes", () => {
    expect(parseAnswer("Yes")).toEqual({ value: "yes", detail: null });
    expect(parseAnswer("No")).toEqual({ value: "no", detail: null });
    expect(parseAnswer("Yes. CTB filed.")).toEqual({
      value: "yes",
      detail: "CTB filed.",
    });
  });
});

describe("buildMergedPoints", () => {
  it("makes one numbered point per merged client question", () => {
    const rows = [
      makeRow({ id: "a", question_id: "4" }),
      makeRow({ id: "b", question_id: "4b" }),
      makeRow({ id: "c", question_id: "6" }),
    ];
    const letter = letterWith([
      { question_ids: ["4", "4b"], text: "Is S4 transparent for US tax?" },
      { question_ids: ["6"], text: "Is CCI a hybrid entity?" },
    ]);
    const points = buildMergedPoints(letter, rowMap(rows), YESNO_BRANCHES);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      number: 1,
      nodeIds: ["4", "4b"],
      questionText: "Is S4 transparent for US tax?",
      status: "open",
      answerType: "yesno",
    });
    expect(points[1].number).toBe(2);
    expect(points[0].coveredRows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("derives a resolved status when every covered row is resolved", () => {
    const rows = [
      makeRow({ id: "a", question_id: "4", status: "answered", client_answer: "Yes. CTB filed." }),
      makeRow({ id: "b", question_id: "4b", status: "answered", client_answer: "Yes. CTB filed." }),
    ];
    const letter = letterWith([
      { question_ids: ["4", "4b"], text: "Is S4 transparent?" },
    ]);
    const [point] = buildMergedPoints(letter, rowMap(rows), YESNO_BRANCHES);
    expect(point.status).toBe("answered");
    expect(point.answerValue).toBe("yes");
    expect(point.answerDetail).toBe("CTB filed.");
  });

  it("keeps a free-text answer starting with 'No' as detail-only (no fabricated yes/no)", () => {
    const rows = [
      makeRow({
        id: "a",
        question_id: "4",
        status: "answered",
        client_answer: "No US check-the-box election was made.",
      }),
    ];
    const letter = letterWith([{ question_ids: ["4"], text: "Is S4 transparent?" }]);
    const [point] = buildMergedPoints(letter, rowMap(rows), YESNO_BRANCHES);
    expect(point.answerValue).toBeNull();
    expect(point.answerDetail).toBe("No US check-the-box election was made.");

    // ...and on submit it drafts 'unknown', never a definitive 'no'.
    const plan = planDraftWrites(
      [point],
      new Map([["4", "p4"]]),
      new Map(),
    );
    expect(plan.writes[0].patch.suggested_answer).toBe("unknown");
    expect(plan.writes[0].patch.suggested_toelichting_unknown).toBe(
      "No US check-the-box election was made.",
    );
  });

  it("stays open when any covered row is still open", () => {
    const rows = [
      makeRow({ id: "a", question_id: "4", status: "answered", client_answer: "Yes" }),
      makeRow({ id: "b", question_id: "4b", status: "open" }),
    ];
    const letter = letterWith([
      { question_ids: ["4", "4b"], text: "Is S4 transparent?" },
    ]);
    const [point] = buildMergedPoints(letter, rowMap(rows), YESNO_BRANCHES);
    expect(point.status).toBe("open");
  });

  it("reports sent-to-client (reply pending) over an answered sibling", () => {
    const rows = [
      makeRow({ id: "a", question_id: "4", status: "taken_to_client", taken_to_client_at: "2026-06-02T00:00:00Z" }),
      makeRow({ id: "b", question_id: "4b", status: "answered", client_answer: "Yes" }),
    ];
    const letter = letterWith([
      { question_ids: ["4", "4b"], text: "Is S4 transparent?" },
    ]);
    const [point] = buildMergedPoints(letter, rowMap(rows), YESNO_BRANCHES);
    expect(point.status).toBe("sent_to_client");
  });

  it("surfaces needs-attention when a covered row was reopened", () => {
    const rows = [
      makeRow({ id: "a", question_id: "4", source: "reopen", reopen_reason: "Analysis contradicts." }),
    ];
    const letter = letterWith([{ question_ids: ["4"], text: "Is S4 transparent?" }]);
    const [point] = buildMergedPoints(letter, rowMap(rows), YESNO_BRANCHES);
    expect(point.needsAttention).toBe(true);
    expect(point.reopenReason).toBe("Analysis contradicts.");
  });

  it("drops a merged question whose covered rows no longer exist", () => {
    const letter = letterWith([{ question_ids: ["999"], text: "Gone." }]);
    expect(buildMergedPoints(letter, rowMap([]), YESNO_BRANCHES)).toEqual([]);
  });
});

describe("buildRawPoints", () => {
  it("makes one unnumbered point per off-path row", () => {
    const rows = [
      makeRow({ id: "a", question_id: "4", client_question: "Off path?" }),
    ];
    const points = buildRawPoints(rows, YESNO_BRANCHES, resolveText);
    expect(points[0]).toMatchObject({
      number: null,
      nodeIds: ["4"],
      questionText: "Off path?",
    });
  });
});

describe("partitionPointsByPath", () => {
  const letter = letterWith([
    { question_ids: ["4"], text: "gate" },
    { question_ids: ["4b"], text: "dependent" },
  ]);

  it("moves an open point off the path once its node is no longer reachable", () => {
    const merged = buildMergedPoints(
      letter,
      rowMap([
        makeRow({ id: "a", question_id: "4" }),
        makeRow({ id: "b", question_id: "4b" }),
      ]),
      YESNO_BRANCHES,
    );
    // Node 4b has dropped off the projected path (a gate routed away from it).
    const { pathPoints, offPathPoints } = partitionPointsByPath(
      merged,
      [],
      YESNO_BRANCHES,
      resolveText,
      new Set(["4"]),
    );
    expect(pathPoints.map((p) => p.nodeIds[0])).toEqual(["4"]);
    expect(offPathPoints.map((p) => p.nodeIds[0])).toEqual(["4b"]);
  });

  it("keeps a resolved point in the core list even when its node is off-path", () => {
    const merged = buildMergedPoints(
      letter,
      rowMap([
        makeRow({ id: "a", question_id: "4" }),
        makeRow({ id: "b", question_id: "4b", status: "answered", client_answer: "done" }),
      ]),
      YESNO_BRANCHES,
    );
    const { pathPoints } = partitionPointsByPath(
      merged,
      [],
      YESNO_BRANCHES,
      resolveText,
      new Set(["4"]), // 4b off-path, but it's answered
    );
    expect(pathPoints.map((p) => p.nodeIds[0]).sort()).toEqual(["4", "4b"]);
  });

  it("keeps a point with any node still on-path (the .some rule)", () => {
    const mixedLetter = letterWith([{ question_ids: ["4", "4b"], text: "merged" }]);
    const merged = buildMergedPoints(
      mixedLetter,
      rowMap([
        makeRow({ id: "a", question_id: "4" }),
        makeRow({ id: "b", question_id: "4b" }),
      ]),
      YESNO_BRANCHES,
    );
    const { pathPoints, offPathPoints } = partitionPointsByPath(
      merged,
      [],
      YESNO_BRANCHES,
      resolveText,
      new Set(["4"]), // only 4 reachable, but the point also covers 4b
    );
    expect(pathPoints).toHaveLength(1);
    expect(offPathPoints).toHaveLength(0);
  });

  it("never lists the same register row in both groups", () => {
    const merged = buildMergedPoints(
      letter,
      rowMap([makeRow({ id: "a", question_id: "4" })]),
      YESNO_BRANCHES,
    );
    // An off-path register row that the letter already covers must not be
    // duplicated into the extras.
    const { pathPoints, offPathPoints } = partitionPointsByPath(
      merged,
      [makeRow({ id: "a", question_id: "4" })],
      YESNO_BRANCHES,
      resolveText,
      new Set(["4"]),
    );
    const ids = [...pathPoints, ...offPathPoints].map((p) => p.nodeIds[0]);
    expect(ids).toEqual(["4"]);
  });
});

describe("counts and labels", () => {
  it("counts open and resolved points", () => {
    const rows = [
      makeRow({ id: "a", question_id: "4" }),
      makeRow({ id: "b", question_id: "6", status: "taken_to_client" }),
    ];
    const letter = letterWith([
      { question_ids: ["4"], text: "q1" },
      { question_ids: ["6"], text: "q2" },
    ]);
    const points = buildMergedPoints(letter, rowMap(rows), YESNO_BRANCHES);
    expect(openCount(points)).toBe(1);
    expect(resolvedCount(points)).toBe(1);
  });

  it("pluralizes the still-open label", () => {
    expect(stillOpenLabel(1)).toBe("1 still open");
    expect(stillOpenLabel(4)).toBe("4 still open");
  });
});

describe("worklistFingerprint", () => {
  it("is stable across order and changes with status", () => {
    const base = [
      makeRow({ id: "a", question_id: "4" }),
      makeRow({ id: "b", question_id: "6" }),
    ];
    const letter = letterWith([
      { question_ids: ["4"], text: "q1" },
      { question_ids: ["6"], text: "q2" },
    ]);
    const a = buildMergedPoints(letter, rowMap(base), YESNO_BRANCHES);
    const reordered = letterWith([
      { question_ids: ["6"], text: "q2" },
      { question_ids: ["4"], text: "q1" },
    ]);
    const b = buildMergedPoints(reordered, rowMap(base), YESNO_BRANCHES);
    expect(worklistFingerprint(a)).toBe(worklistFingerprint(b));

    const changed = buildMergedPoints(
      letter,
      rowMap([
        makeRow({ id: "a", question_id: "4", status: "taken_to_client" }),
        makeRow({ id: "b", question_id: "6" }),
      ]),
      YESNO_BRANCHES,
    );
    expect(worklistFingerprint(a)).not.toBe(worklistFingerprint(changed));
  });
});

describe("planDraftWrites", () => {
  function point(overrides: Partial<OpenPoint>): OpenPoint {
    return {
      id: "p",
      questionText: "q",
      number: 1,
      nodeIds: ["4"],
      answerType: "yesno",
      status: "open",
      answerValue: null,
      answerDetail: null,
      naReason: null,
      needsAttention: false,
      reopenReason: null,
      table: null,
      answeredAt: null,
      sentAt: null,
      coveredRows: [],
      ...overrides,
    };
  }

  const prefillIds = new Map([
    ["4", "p4"],
    ["4b", "p4b"],
    ["6", "p6"],
  ]);

  it("never plans writes for open points", () => {
    const plan = planDraftWrites([point({})], prefillIds, new Map());
    expect(plan.writes).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });

  it("writes the SAME draft to every covered node of a merged answer", () => {
    const plan = planDraftWrites(
      [
        point({
          status: "answered",
          nodeIds: ["4", "4b"],
          answerValue: "yes",
          answerDetail: "Confirmed in the LPA.",
        }),
      ],
      prefillIds,
      new Map(),
    );
    expect(plan.writes.map((w) => w.questionId)).toEqual(["4", "4b"]);
    for (const write of plan.writes) {
      expect(write.patch).toMatchObject({
        suggested_answer: "yes",
        confidence_pct: DRAFT_CONFIDENCE,
        suggested_toelichting: "Confirmed in the LPA.",
        user_action: "pending",
        committed_text: null,
      });
    }
  });

  it("holds confidence below the reopen threshold per contradicting node", () => {
    const plan = planDraftWrites(
      [point({ status: "answered", nodeIds: ["4", "4b"], answerValue: "no" })],
      prefillIds,
      new Map([["4", "Yes"]]), // node 4 has a recorded Yes; 4b has none
    );
    const byId = new Map(plan.writes.map((w) => [w.questionId, w.patch.confidence_pct]));
    expect(byId.get("4")).toBe(REOPEN_SAFE_CONFIDENCE);
    expect(byId.get("4b")).toBe(DRAFT_CONFIDENCE);
    expect(REOPEN_SAFE_CONFIDENCE).toBeLessThan(60);
    expect(REOPEN_SAFE_CONFIDENCE).toBeGreaterThanOrEqual(40);
  });

  it("clears a stale suggestion and carries a text answer on the unknown branch", () => {
    const plan = planDraftWrites(
      [point({ status: "answered", answerValue: null, answerDetail: "See the flowchart." })],
      prefillIds,
      new Map(),
    );
    expect(plan.writes[0].patch.suggested_answer).toBe("unknown");
    expect(plan.writes[0].patch.suggested_toelichting_unknown).toBe("See the flowchart.");
    expect(plan.writes[0].patch.user_action).toBe("pending");
    expect(plan.writes[0].patch.committed_text).toBeNull();
  });

  it("resets stale committed/dismissed state on a bare yes/no answer", () => {
    const plan = planDraftWrites(
      [point({ status: "answered", answerValue: "yes" })],
      prefillIds,
      new Map(),
    );
    expect(plan.writes[0].patch.suggested_answer).toBe("yes");
    expect(plan.writes[0].patch.user_action).toBe("pending");
    expect(plan.writes[0].patch.committed_text).toBeNull();
  });

  it("clamps a long note to the 4000-char column limit", () => {
    const plan = planDraftWrites(
      [point({ status: "answered", answerValue: "yes", answerDetail: "x".repeat(4500) })],
      prefillIds,
      new Map(),
    );
    expect(plan.writes[0].patch.suggested_toelichting!.length).toBeLessThanOrEqual(4000);
  });

  it("leaves the prefill untouched for points in the client letter and for n/a", () => {
    // Unknown outcomes must not overwrite the document analysis's suggestion
    // with a forced "unknown" at full confidence, nor wipe the earlier draft.
    const plan = planDraftWrites(
      [
        point({ status: "sent_to_client", nodeIds: ["4"] }),
        point({ status: "na", nodeIds: ["6"], naReason: "Outside the perimeter" }),
      ],
      prefillIds,
      new Map(),
    );
    expect(plan.writes).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });

  it("reports covered nodes without a prefill row as skipped", () => {
    const plan = planDraftWrites(
      [point({ status: "answered", nodeIds: ["4", "999"], answerValue: "yes" })],
      prefillIds,
      new Map(),
    );
    expect(plan.writes.map((w) => w.questionId)).toEqual(["4"]);
    expect(plan.skipped).toEqual([{ questionId: "999", reason: "no_prefill_row" }]);
  });

  it("keeps the rationale inside the 300-char column constraint", () => {
    const plan = planDraftWrites(
      [point({ status: "answered", answerValue: "yes" })],
      prefillIds,
      new Map(),
    );
    expect(plan.writes[0].patch.answer_rationale!.length).toBeLessThanOrEqual(300);
  });
});

describe("stored draft submit", () => {
  it("round-trips and fails closed on junk", () => {
    const record = {
      v: 1 as const,
      fingerprint: "f",
      submittedAt: "2026-06-12T10:00:00Z",
      written: 6,
    };
    expect(decodeStoredDraftSubmit(encodeStoredDraftSubmit(record))).toEqual(record);
    expect(decodeStoredDraftSubmit(null)).toBeNull();
    expect(decodeStoredDraftSubmit("not json")).toBeNull();
    expect(decodeStoredDraftSubmit('{"v":2}')).toBeNull();
  });
});

describe("formatPointsList", () => {
  const meta = { taxpayerName: "S4 Energy B.V.", fiscalYear: "2024" };
  const points = [
    { questionText: "Is S4 transparent for US tax?" },
    { questionText: "Is the interest included at CCI?" },
  ];

  it("renumbers the subset 1..N with a header", () => {
    const text = formatPointsList(points, meta, false);
    expect(text).toContain("Points to confirm, S4 Energy B.V. (FY 2024)");
    expect(text).toContain("1. Is S4 transparent for US tax?");
    expect(text).toContain("2. Is the interest included at CCI?");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("adds a client-ready intro line in the email-ready format", () => {
    const plain = formatPointsList(points, meta, false);
    const email = formatPointsList(points, meta, true);
    expect(email).toContain("we still need a few points confirmed");
    expect(plain).not.toContain("we still need a few points confirmed");
  });

  it("omits the FY suffix when no fiscal year is known", () => {
    expect(formatPointsList(points, { taxpayerName: "X", fiscalYear: "" }, false)).toContain(
      "Points to confirm, X\n",
    );
  });
});

describe("formatClientMessage", () => {
  const points = [
    { questionText: "Is S4 transparent for US tax?" },
    { questionText: "Is the interest included at CCI?" },
  ];

  it("leads with the client lead-in, then numbers the selected points", () => {
    const text = formatClientMessage(points);
    expect(
      text.startsWith("To finalise our assessment, could you confirm the following:"),
    ).toBe(true);
    expect(text).toContain("1. Is S4 transparent for US tax?");
    expect(text).toContain("2. Is the interest included at CCI?");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("carries no internal header (it is the client's message, not the advisor's)", () => {
    expect(formatClientMessage(points)).not.toContain("Points to confirm");
  });

  it("renumbers the subset from 1 regardless of input position", () => {
    const text = formatClientMessage([{ questionText: "Only one" }]);
    expect(text).toContain("1. Only one");
    expect(text).not.toContain("2.");
  });
});

describe("pointsLeadIn", () => {
  it("returns the stem for direct-clause points", () => {
    expect(
      pointsLeadIn([
        { questionText: "for each of CCI, how it classifies S4." },
        { questionText: "whether the interest is also deducted in the US." },
      ]),
    ).toBe("Could you please confirm:");
  });

  it("returns null when most points carry their own polite opener", () => {
    expect(
      pointsLeadIn([
        { questionText: "Could you please confirm whether S4 is transparent?" },
        { questionText: "Please share the residency certificate." },
        { questionText: "whether the interest is also deducted in the US." },
      ]),
    ).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pointsLeadIn([])).toBeNull();
  });

  it("keeps the stem on an exact half-polite split (not a majority)", () => {
    expect(
      pointsLeadIn([
        { questionText: "Could you please confirm X?" },
        { questionText: "whether Y applies." },
      ]),
    ).toBe("Could you please confirm:");
  });
});

describe("letterIsStale", () => {
  it("is stale only when an open path question is missing from the letter", () => {
    expect(letterIsStale(["4", "4b"], ["4"])).toBe(false); // resolved one left
    expect(letterIsStale(["4", "4b"], ["4", "4b"])).toBe(false);
    expect(letterIsStale(["4"], ["4", "6"])).toBe(true); // 6 reopened/new
    expect(letterIsStale([], [])).toBe(false);
  });
});
