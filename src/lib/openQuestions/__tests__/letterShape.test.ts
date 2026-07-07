import { describe, it, expect } from "vitest";
import {
  questionKey,
  allQuestionKeys,
  normalizeComposedLetter,
  coveredQuestionIds,
  letterGroupViews,
  letterLeadIn,
  formatComposedLetterText,
  letterStorageKey,
  encodeStoredLetter,
  decodeStoredLetter,
  formatAsOfLine,
  type ComposedLetter,
  type LetterQuestion,
  type LetterTable,
  type StoredLetter,
} from "../letterShape";

function q(
  ids: string[],
  text: string,
  table: LetterTable | null = null,
): LetterQuestion {
  return { question_ids: ids, text, table };
}

const meta = {
  taxpayerName: "Camden B.V.",
  fiscalYear: "2025",
  dateLong: "11 June 2026",
};

/** A schema-v2 letter: two groups, a merged question and a per-entity table. */
const newLetter: ComposedLetter = {
  intro: 'S4 Energy B.V. ("S4") borrowed from three Dutch lenders.',
  groups: [
    {
      title: "US treatment of S4",
      questions: [
        q(["3"], "whether the loan is held to maturity."),
        q(["7", "9"], "how the US treats S4 for tax purposes."),
      ],
    },
    {
      title: "Flow of funds",
      questions: [
        q(["12"], "whether interest was actually paid in FY 2025.", {
          columns: ["Entity", "Interest paid"],
          rows: [
            ["A BV", "Yes"],
            ["B BV", "No"],
          ],
        }),
      ],
    },
  ],
};

const allKeys = new Set(["3", "7+9", "12"]);

/** The old shape as the deployed edge / v1+v2 envelopes carry it. */
const oldShape = {
  understandings: ["The BV holds the loan.", "The CV is US-owned."],
  questions: [
    { question_id: "3", text: "Could you please confirm the loan terms?" },
    { question_id: "7", text: "Could you please describe the US treatment?" },
  ],
};

describe("questionKey", () => {
  it("equals the register id for a single-id question", () => {
    expect(questionKey(q(["3"], "t"))).toBe("3");
  });

  it("joins merged ids with +", () => {
    expect(questionKey(q(["7", "9"], "t"))).toBe("7+9");
  });
});

describe("allQuestionKeys", () => {
  it("flattens keys across groups in group order", () => {
    expect(allQuestionKeys(newLetter)).toEqual(["3", "7+9", "12"]);
  });
});

describe("normalizeComposedLetter: new shape", () => {
  it("accepts a valid grouped letter unchanged", () => {
    expect(normalizeComposedLetter(newLetter)).toEqual(newLetter);
  });

  it("normalizes an absent table to null", () => {
    const value = {
      intro: "",
      groups: [
        { title: "T", questions: [{ question_ids: ["1"], text: "t" }] },
      ],
    };
    expect(normalizeComposedLetter(value)).toEqual({
      intro: "",
      groups: [{ title: "T", questions: [q(["1"], "t")] }],
    });
  });

  it("keeps an explicit null table as null", () => {
    const value = {
      intro: "",
      groups: [
        { title: "T", questions: [{ question_ids: ["1"], text: "t", table: null }] },
      ],
    };
    expect(normalizeComposedLetter(value)?.groups[0].questions[0].table).toBeNull();
  });

  it("accepts an empty-string group title", () => {
    const value = {
      intro: "",
      groups: [{ title: "", questions: [{ question_ids: ["1"], text: "t" }] }],
    };
    expect(normalizeComposedLetter(value)).not.toBeNull();
  });

  it.each([
    ["missing intro", { groups: newLetter.groups }],
    ["non-string intro", { intro: 5, groups: newLetter.groups }],
    ["missing groups", { intro: "" }],
    ["empty groups", { intro: "", groups: [] }],
    ["non-array groups", { intro: "", groups: "x" }],
    ["non-object group", { intro: "", groups: ["x"] }],
    ["non-string title", { intro: "", groups: [{ title: 1, questions: [q(["1"], "t")] }] }],
    ["empty questions", { intro: "", groups: [{ title: "T", questions: [] }] }],
    ["non-array questions", { intro: "", groups: [{ title: "T", questions: "x" }] }],
    ["non-object question", { intro: "", groups: [{ title: "T", questions: ["x"] }] }],
    [
      "empty question_ids",
      { intro: "", groups: [{ title: "T", questions: [{ question_ids: [], text: "t" }] }] },
    ],
    [
      "non-array question_ids",
      { intro: "", groups: [{ title: "T", questions: [{ question_ids: "1", text: "t" }] }] },
    ],
    [
      "non-string id in question_ids",
      { intro: "", groups: [{ title: "T", questions: [{ question_ids: [1], text: "t" }] }] },
    ],
    [
      "blank id in question_ids",
      { intro: "", groups: [{ title: "T", questions: [{ question_ids: [""], text: "t" }] }] },
    ],
    [
      "missing text",
      { intro: "", groups: [{ title: "T", questions: [{ question_ids: ["1"] }] }] },
    ],
    [
      "empty text",
      { intro: "", groups: [{ title: "T", questions: [{ question_ids: ["1"], text: "" }] }] },
    ],
    [
      "non-string text",
      { intro: "", groups: [{ title: "T", questions: [{ question_ids: ["1"], text: 1 }] }] },
    ],
    [
      "table is a string",
      {
        intro: "",
        groups: [{ title: "T", questions: [{ question_ids: ["1"], text: "t", table: "x" }] }],
      },
    ],
    [
      "table with empty columns",
      {
        intro: "",
        groups: [
          {
            title: "T",
            questions: [
              { question_ids: ["1"], text: "t", table: { columns: [], rows: [] } },
            ],
          },
        ],
      },
    ],
    [
      "table with non-string column",
      {
        intro: "",
        groups: [
          {
            title: "T",
            questions: [
              { question_ids: ["1"], text: "t", table: { columns: [1], rows: [] } },
            ],
          },
        ],
      },
    ],
    [
      "table with non-array rows",
      {
        intro: "",
        groups: [
          {
            title: "T",
            questions: [
              { question_ids: ["1"], text: "t", table: { columns: ["A"], rows: "x" } },
            ],
          },
        ],
      },
    ],
    [
      "table with a non-array row",
      {
        intro: "",
        groups: [
          {
            title: "T",
            questions: [
              { question_ids: ["1"], text: "t", table: { columns: ["A"], rows: ["x"] } },
            ],
          },
        ],
      },
    ],
    [
      "table with a non-string cell",
      {
        intro: "",
        groups: [
          {
            title: "T",
            questions: [
              { question_ids: ["1"], text: "t", table: { columns: ["A"], rows: [[1]] } },
            ],
          },
        ],
      },
    ],
  ])("rejects new-shape malformation: %s", (_label, value) => {
    expect(normalizeComposedLetter(value)).toBeNull();
  });
});

describe("normalizeComposedLetter: old shape", () => {
  it("converts to one unnamed group with single-id questions and a bullet intro", () => {
    expect(normalizeComposedLetter(oldShape)).toEqual({
      intro: "We understand that:\n- The BV holds the loan.\n- The CV is US-owned.",
      groups: [
        {
          title: "",
          questions: [
            q(["3"], "Could you please confirm the loan terms?"),
            q(["7"], "Could you please describe the US treatment?"),
          ],
        },
      ],
    });
  });

  it("trims understandings and drops blank ones from the intro", () => {
    const result = normalizeComposedLetter({
      understandings: ["  spaced  ", "   ", ""],
      questions: oldShape.questions,
    });
    expect(result?.intro).toBe("We understand that:\n- spaced");
  });

  it("maps no/all-blank understandings to an empty intro", () => {
    expect(
      normalizeComposedLetter({ understandings: [], questions: oldShape.questions })?.intro,
    ).toBe("");
    expect(
      normalizeComposedLetter({ understandings: ["  "], questions: oldShape.questions })
        ?.intro,
    ).toBe("");
  });

  it.each([
    ["empty questions", { understandings: [], questions: [] }],
    ["non-array questions", { understandings: [], questions: "x" }],
    ["non-string understandings entry", { understandings: [1], questions: oldShape.questions }],
    ["non-array understandings", { understandings: "x", questions: oldShape.questions }],
    [
      "non-string question_id",
      { understandings: [], questions: [{ question_id: 3, text: "t" }] },
    ],
    ["missing text", { understandings: [], questions: [{ question_id: "3" }] }],
  ])("rejects old-shape malformation: %s", (_label, value) => {
    expect(normalizeComposedLetter(value)).toBeNull();
  });
});

describe("normalizeComposedLetter: fail-closed on garbage", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "letter"],
    ["a number", 7],
    ["an array", []],
    ["an empty object", {}],
    ["a partial object", { intro: "x" }],
  ])("returns null for %s", (_label, value) => {
    expect(normalizeComposedLetter(value)).toBeNull();
  });
});

describe("coveredQuestionIds", () => {
  it("unions ids over included questions in appearance order", () => {
    expect(coveredQuestionIds(newLetter, allKeys)).toEqual(["3", "7", "9", "12"]);
  });

  it("dropping a merged question drops ALL its ids", () => {
    expect(coveredQuestionIds(newLetter, new Set(["3", "12"]))).toEqual(["3", "12"]);
  });

  it("dedupes ids that appear in more than one included question", () => {
    const overlapping: ComposedLetter = {
      intro: "",
      groups: [
        { title: "", questions: [q(["3", "7"], "a"), q(["7", "9"], "b")] },
      ],
    };
    expect(
      coveredQuestionIds(overlapping, new Set(["3+7", "7+9"])),
    ).toEqual(["3", "7", "9"]);
  });

  it("returns [] when nothing is included", () => {
    expect(coveredQuestionIds(newLetter, new Set())).toEqual([]);
  });
});

describe("letterGroupViews", () => {
  it("numbers included questions continuously across groups", () => {
    const views = letterGroupViews(newLetter, allKeys);
    expect(views[0].questions.map((v) => v.number)).toEqual([1, 2]);
    expect(views[1].questions.map((v) => v.number)).toEqual([3]);
    expect(views[0].label).toBe("A");
    expect(views[1].label).toBe("B");
  });

  it("an excluded question mid-letter gets number null and later questions close the gap", () => {
    const views = letterGroupViews(newLetter, new Set(["3", "12"]));
    expect(views[0].questions.map((v) => v.number)).toEqual([1, null]);
    expect(views[0].questions[1].included).toBe(false);
    expect(views[1].questions.map((v) => v.number)).toEqual([2]);
  });

  it("a fully-excluded group gets label null and does not consume a letter", () => {
    const views = letterGroupViews(newLetter, new Set(["12"]));
    expect(views[0].label).toBeNull();
    expect(views[1].label).toBe("A");
    expect(views[1].questions[0].number).toBe(1);
  });

  it("the single unnamed legacy group gets label null even with included questions", () => {
    const legacy = normalizeComposedLetter(oldShape)!;
    const views = letterGroupViews(legacy, new Set(["3", "7"]));
    expect(views).toHaveLength(1);
    expect(views[0].label).toBeNull();
    expect(views[0].questions.map((v) => v.number)).toEqual([1, 2]);
  });

  it("a single group WITH a title still gets label A", () => {
    const single: ComposedLetter = {
      intro: "",
      groups: [{ title: "Only topic", questions: [q(["1"], "t")] }],
    };
    expect(letterGroupViews(single, new Set(["1"]))[0].label).toBe("A");
  });

  it("exposes key, text and table on each question view", () => {
    const views = letterGroupViews(newLetter, allKeys);
    expect(views[0].questions[1].key).toBe("7+9");
    expect(views[1].questions[0].table).toEqual(newLetter.groups[1].questions[0].table);
    expect(views[0].questions[0].text).toBe("whether the loan is held to maturity.");
  });
});

describe("letterLeadIn", () => {
  it("returns the lead-in for direct-clause questions", () => {
    expect(letterLeadIn(newLetter, allKeys)).toBe("Could you please confirm:");
  });

  it("returns null when the polite majority signals a legacy letter", () => {
    const legacy = normalizeComposedLetter(oldShape)!;
    expect(letterLeadIn(legacy, new Set(["3", "7"]))).toBeNull();
  });

  it("returns null for an empty included set", () => {
    expect(letterLeadIn(newLetter, new Set())).toBeNull();
  });

  it("only counts INCLUDED questions across all groups", () => {
    const mixed: ComposedLetter = {
      intro: "",
      groups: [
        { title: "T1", questions: [q(["1"], "Could you please confirm X?")] },
        { title: "T2", questions: [q(["2"], "whether Y applies.")] },
      ],
    };
    // The polite question is excluded; the included remainder is direct.
    expect(letterLeadIn(mixed, new Set(["2"]))).toBe("Could you please confirm:");
  });

  it("an exact half polite split is not a majority, so the lead-in stays", () => {
    const half: ComposedLetter = {
      intro: "",
      groups: [
        {
          title: "",
          questions: [q(["1"], "Could you please confirm X?"), q(["2"], "whether Y applies.")],
        },
      ],
    };
    expect(letterLeadIn(half, new Set(["1", "2"]))).toBe("Could you please confirm:");
  });

  it("drops the stem for v11 two-sentence items that carry their own ask mid-text", () => {
    const v11: ComposedLetter = {
      intro: "",
      groups: [
        {
          title: "US treatment",
          questions: [
            q(
              ["1"],
              "WMC Energy B.V. is treated as transparent for US tax. Could you confirm whether its income is taxed in the US?",
            ),
            q(["2"], "Could you clarify in which country WMC Energy Corp is resident?"),
          ],
        },
      ],
    };
    expect(letterLeadIn(v11, new Set(["1", "2"]))).toBeNull();
  });
});

describe("formatComposedLetterText", () => {
  it("renders a grouped letter with labels, continuous numbers and a tab-separated table", () => {
    expect(formatComposedLetterText(newLetter, allKeys, meta)).toBe(
      "Questions for Camden B.V. (FY 2025)\n" +
        "Recorded on 11 June 2026\n" +
        "\n" +
        'S4 Energy B.V. ("S4") borrowed from three Dutch lenders.\n' +
        "\n" +
        "Could you please confirm:\n" +
        "\n" +
        "A. US treatment of S4\n" +
        "\n" +
        "1. whether the loan is held to maturity.\n" +
        "\n" +
        "2. how the US treats S4 for tax purposes.\n" +
        "\n" +
        "B. Flow of funds\n" +
        "\n" +
        "3. whether interest was actually paid in FY 2025.\n" +
        "Entity\tInterest paid\n" +
        "A BV\tYes\n" +
        "B BV\tNo\n",
    );
  });

  it("omits fully-excluded groups so clipboard matches the UI", () => {
    const text = formatComposedLetterText(newLetter, new Set(["12"]), meta);
    expect(text).not.toContain("US treatment of S4");
    expect(text).toContain("A. Flow of funds");
    expect(text).toContain("1. whether interest was actually paid in FY 2025.");
  });

  it("renumbers around an excluded question", () => {
    const text = formatComposedLetterText(newLetter, new Set(["3", "12"]), meta);
    expect(text).toContain("1. whether the loan is held to maturity.");
    expect(text).not.toContain("how the US treats S4");
    expect(text).toContain("2. whether interest was actually paid in FY 2025.");
  });

  it("renders a normalized legacy letter exactly like today's output", () => {
    const legacy = normalizeComposedLetter(oldShape)!;
    expect(formatComposedLetterText(legacy, new Set(["3", "7"]), meta)).toBe(
      "Questions for Camden B.V. (FY 2025)\n" +
        "Recorded on 11 June 2026\n" +
        "\n" +
        "We understand that:\n" +
        "- The BV holds the loan.\n" +
        "- The CV is US-owned.\n" +
        "\n" +
        "1. Could you please confirm the loan terms?\n" +
        "\n" +
        "2. Could you please describe the US treatment?\n",
    );
  });

  it("skips the intro block when the intro is blank", () => {
    const blankIntro: ComposedLetter = { ...newLetter, intro: "   " };
    const text = formatComposedLetterText(blankIntro, allKeys, meta);
    expect(text).toContain(
      "Recorded on 11 June 2026\n\nCould you please confirm:",
    );
  });

  it("never emits two consecutive blank lines and ends with exactly one newline", () => {
    for (const keys of [allKeys, new Set(["12"]), new Set(["3", "7+9"])]) {
      const text = formatComposedLetterText(newLetter, keys, meta);
      expect(text).not.toMatch(/\n\n\n/);
      expect(text.endsWith("\n")).toBe(true);
      expect(text.endsWith("\n\n")).toBe(false);
    }
  });
});

describe("letterStorageKey", () => {
  it("namespaces by session id", () => {
    expect(letterStorageKey("abc-123")).toBe("client-letter:abc-123");
  });
});

describe("stored letter codec: v3 round-trip", () => {
  it("preserves all fields through the v3 envelope", () => {
    const raw = encodeStoredLetter(
      newLetter,
      ["3", "7+9"],
      ["12"],
      "2026-06-11T14:32:00.000Z",
    );
    expect(decodeStoredLetter(raw)).toEqual({
      v: 3,
      letter: newLetter,
      includedKeys: ["3", "7+9"],
      addedQuestionIds: ["12"],
      composedAt: "2026-06-11T14:32:00.000Z",
    } satisfies StoredLetter);
  });
});

describe("stored letter codec: legacy envelopes", () => {
  it("decodes a v2 envelope, normalizing the letter and mapping includedIds to keys", () => {
    const v2 = JSON.stringify({
      v: 2,
      letter: oldShape,
      includedIds: ["3"],
      addedQuestionIds: ["7"],
      composedAt: "2026-06-11T14:32:00.000Z",
    });
    expect(decodeStoredLetter(v2)).toEqual({
      v: 3,
      letter: normalizeComposedLetter(oldShape),
      includedKeys: ["3"],
      addedQuestionIds: ["7"],
      composedAt: "2026-06-11T14:32:00.000Z",
    });
  });

  it("decodes a v1 envelope with empty addedQuestionIds", () => {
    const v1 = JSON.stringify({
      v: 1,
      letter: oldShape,
      includedIds: ["3", "7"],
      composedAt: "2026-06-11T14:32:00.000Z",
    });
    const decoded = decodeStoredLetter(v1);
    expect(decoded?.v).toBe(3);
    expect(decoded?.includedKeys).toEqual(["3", "7"]);
    expect(decoded?.addedQuestionIds).toEqual([]);
  });

  it("a v1 envelope with a stray addedQuestionIds field still decodes as empty", () => {
    const v1 = JSON.stringify({
      v: 1,
      letter: oldShape,
      includedIds: ["3"],
      addedQuestionIds: ["7"],
      composedAt: "2026-06-11T14:32:00.000Z",
    });
    expect(decodeStoredLetter(v1)?.addedQuestionIds).toEqual([]);
  });

  it("rejects a v2 envelope whose addedQuestionIds is not a string array", () => {
    const base = {
      v: 2,
      letter: oldShape,
      includedIds: ["3"],
      composedAt: "2026-06-11T14:32:00.000Z",
    };
    expect(
      decodeStoredLetter(JSON.stringify({ ...base, addedQuestionIds: "7" })),
    ).toBeNull();
    expect(
      decodeStoredLetter(JSON.stringify({ ...base, addedQuestionIds: [7] })),
    ).toBeNull();
    expect(decodeStoredLetter(JSON.stringify(base))).toBeNull();
  });

  it("rejects a legacy envelope carrying a NEW-shape letter", () => {
    const v2 = JSON.stringify({
      v: 2,
      letter: newLetter,
      includedIds: ["3"],
      addedQuestionIds: [],
      composedAt: "2026-06-11T14:32:00.000Z",
    });
    expect(decodeStoredLetter(v2)).toBeNull();
  });
});

describe("stored letter codec: fail-closed", () => {
  const valid = (): Record<string, unknown> => ({
    v: 3,
    letter: newLetter,
    includedKeys: ["3"],
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
    expect(decodeStoredLetter(JSON.stringify({ ...valid(), v: 4 }))).toBeNull();
    expect(decodeStoredLetter(JSON.stringify({ ...valid(), v: "3" }))).toBeNull();
  });

  it("rejects a v3 envelope carrying an OLD-shape letter", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), letter: oldShape })),
    ).toBeNull();
  });

  it("rejects a v3 envelope with a malformed letter", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), letter: { intro: "", groups: [] } })),
    ).toBeNull();
    const missing = valid();
    delete missing.letter;
    expect(decodeStoredLetter(JSON.stringify(missing))).toBeNull();
  });

  it("rejects a v3 envelope whose includedKeys is not a string array", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), includedKeys: "3" })),
    ).toBeNull();
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), includedKeys: [3] })),
    ).toBeNull();
    const missing = valid();
    delete missing.includedKeys;
    expect(decodeStoredLetter(JSON.stringify(missing))).toBeNull();
  });

  it("rejects a v3 envelope whose addedQuestionIds is not a string array", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), addedQuestionIds: [7] })),
    ).toBeNull();
    const missing = valid();
    delete missing.addedQuestionIds;
    expect(decodeStoredLetter(JSON.stringify(missing))).toBeNull();
  });

  it("rejects an unparseable or non-string composedAt on every version", () => {
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), composedAt: "not a date" })),
    ).toBeNull();
    expect(
      decodeStoredLetter(JSON.stringify({ ...valid(), composedAt: 123 })),
    ).toBeNull();
    const v1 = {
      v: 1,
      letter: oldShape,
      includedIds: ["3"],
      composedAt: "not a date",
    };
    expect(decodeStoredLetter(JSON.stringify(v1))).toBeNull();
  });

  it("rejects a legacy envelope whose includedIds is not a string array", () => {
    const v1 = {
      v: 1,
      letter: oldShape,
      includedIds: [3],
      composedAt: "2026-06-11T14:32:00.000Z",
    };
    expect(decodeStoredLetter(JSON.stringify(v1))).toBeNull();
    const missing = {
      v: 1,
      letter: oldShape,
      composedAt: "2026-06-11T14:32:00.000Z",
    };
    expect(decodeStoredLetter(JSON.stringify(missing))).toBeNull();
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
