import { describe, it, expect } from "vitest";
// Deno edge-function schema imported relatively, same precedent as
// swarmSchema.test.ts (and src/lib/structure/__tests__/extract-schemas.test.ts).
// schemas.ts only imports zod, which resolves from node_modules under vitest.
import {
  ComposedLetterSchema,
  ComposedLetterLegacySchema,
  normalizeLegacyComposedLetter,
} from "../../../../supabase/functions/prefill-documents/schemas";
import { normalizeComposedLetter } from "../letterShape";

const validLetter = {
  intro:
    'S4 Energy B.V. ("S4") is held by Castleton Commodities International LLC ("CCI"). The questions below concern the US tax treatment of the financing.',
  groups: [
    {
      title: "US treatment of S4 Energy B.V.",
      questions: [
        {
          question_ids: ["3", "7"],
          text: "how CCI treats S4 for US tax purposes, and whether the interest is included as taxable income or neutralised under a comparable anti-hybrid rule.",
          table: null,
        },
      ],
    },
    {
      title: "Classification and inclusion per recipient",
      questions: [
        {
          question_ids: ["4"],
          text: "for each entity listed below, whether it is treated as transparent or opaque for US tax purposes.",
          table: {
            columns: ["Entity", "US classification", "Income included?"],
            rows: [
              ["Alpha B.V.", "", ""],
              ["Beta B.V.", "", ""],
            ],
          },
        },
      ],
    },
  ],
};

const legacyLetter = {
  understandings: [
    "Kynexis BV holds 100% of KyNexis Inc.",
    "The group prepares consolidated accounts under IFRS.",
  ],
  questions: [
    { question_id: "3", text: "Could you please confirm the US tax classification of KyNexis Inc?" },
    { question_id: "4", text: "Could you please confirm whether a CV/BV structure is present?" },
  ],
};

describe("ComposedLetterSchema (compose_client_letter v2)", () => {
  it("parses a grouped letter with a per-entity table", () => {
    const parsed = ComposedLetterSchema.parse(validLetter);
    expect(parsed.intro).toBe(validLetter.intro);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].questions[0].question_ids).toEqual(["3", "7"]);
    expect(parsed.groups[1].questions[0].table).toEqual(
      validLetter.groups[1].questions[0].table,
    );
  });

  it("defaults an absent table to null", () => {
    const parsed = ComposedLetterSchema.parse({
      intro: "",
      groups: [
        {
          title: "General",
          questions: [{ question_ids: ["3"], text: "whether X applies." }],
        },
      ],
    });
    expect(parsed.groups[0].questions[0].table).toBeNull();
  });

  it("accepts an empty group title (legacy-normalized unnamed group)", () => {
    const parsed = ComposedLetterSchema.parse({
      intro: "",
      groups: [
        {
          title: "",
          questions: [{ question_ids: ["3"], text: "whether X applies.", table: null }],
        },
      ],
    });
    expect(parsed.groups[0].title).toBe("");
  });

  it("rejects an empty groups array", () => {
    expect(() =>
      ComposedLetterSchema.parse({ intro: "", groups: [] }),
    ).toThrow();
  });

  it("rejects a group with an empty questions array", () => {
    expect(() =>
      ComposedLetterSchema.parse({
        intro: "",
        groups: [{ title: "General", questions: [] }],
      }),
    ).toThrow();
  });

  it("rejects a question with an empty question_ids array", () => {
    expect(() =>
      ComposedLetterSchema.parse({
        intro: "",
        groups: [
          {
            title: "General",
            questions: [{ question_ids: [], text: "whether X applies." }],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects more than 6 groups", () => {
    const group = {
      title: "G",
      questions: [{ question_ids: ["3"], text: "whether X applies." }],
    };
    expect(() =>
      ComposedLetterSchema.parse({ intro: "", groups: Array(7).fill(group) }),
    ).toThrow();
  });
});

describe("ComposedLetterLegacySchema (compose_client_letter v1)", () => {
  it("still parses the old flat-letter fixture", () => {
    const parsed = ComposedLetterLegacySchema.parse(legacyLetter);
    expect(parsed.understandings).toEqual(legacyLetter.understandings);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].question_id).toBe("3");
  });

  it("rejects an empty questions array", () => {
    expect(() =>
      ComposedLetterLegacySchema.parse({ ...legacyLetter, questions: [] }),
    ).toThrow();
  });
});

describe("normalizeLegacyComposedLetter", () => {
  it("produces the unnamed-group v2 shape with single-id questions", () => {
    const normalized = normalizeLegacyComposedLetter(
      ComposedLetterLegacySchema.parse(legacyLetter),
    );
    expect(normalized.intro).toBe(
      "We understand that:\n- Kynexis BV holds 100% of KyNexis Inc.\n- The group prepares consolidated accounts under IFRS.",
    );
    expect(normalized.groups).toEqual([
      {
        title: "",
        questions: [
          {
            question_ids: ["3"],
            text: legacyLetter.questions[0].text,
            table: null,
          },
          {
            question_ids: ["4"],
            text: legacyLetter.questions[1].text,
            table: null,
          },
        ],
      },
    ]);
  });

  it("maps empty understandings to an empty intro", () => {
    const normalized = normalizeLegacyComposedLetter(
      ComposedLetterLegacySchema.parse({ ...legacyLetter, understandings: [] }),
    );
    expect(normalized.intro).toBe("");
  });

  it("matches the frontend old-shape normalization rule exactly", () => {
    const server = normalizeLegacyComposedLetter(
      ComposedLetterLegacySchema.parse(legacyLetter),
    );
    const frontend = normalizeComposedLetter(legacyLetter);
    expect(server).toEqual(frontend);
  });

  it("output validates against the v2 schema (round trip)", () => {
    const normalized = normalizeLegacyComposedLetter(
      ComposedLetterLegacySchema.parse(legacyLetter),
    );
    expect(() => ComposedLetterSchema.parse(normalized)).not.toThrow();
  });
});
