import { describe, it, expect } from "vitest";
// Deno edge-function schema imported relatively, same precedent as
// swarmSchema.test.ts (and src/lib/structure/__tests__/extract-schemas.test.ts).
// schemas.ts only imports zod, which resolves from node_modules under vitest.
import { ComposedLetterSchema } from "../../../../supabase/functions/prefill-documents/schemas";

const validLetter = {
  understandings: [
    "Kynexis BV holds 100% of KyNexis Inc.",
    "The group prepares consolidated accounts under IFRS.",
  ],
  questions: [
    { question_id: "3", text: "Could you please confirm the US tax classification of KyNexis Inc?" },
    { question_id: "4", text: "Could you please confirm whether a CV/BV structure is present?" },
  ],
};

describe("ComposedLetterSchema (compose_client_letter v1)", () => {
  it("parses a valid composed letter payload", () => {
    const parsed = ComposedLetterSchema.parse(validLetter);
    expect(parsed.understandings).toEqual(validLetter.understandings);
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].question_id).toBe("3");
  });

  it("rejects an empty questions array", () => {
    expect(() =>
      ComposedLetterSchema.parse({ ...validLetter, questions: [] }),
    ).toThrow();
  });

  it("rejects a question without a question_id", () => {
    expect(() =>
      ComposedLetterSchema.parse({
        ...validLetter,
        questions: [{ text: "Could you please confirm something?" }],
      }),
    ).toThrow();
  });

  it("accepts an empty understandings array (sparse inputs share no facts)", () => {
    const parsed = ComposedLetterSchema.parse({ ...validLetter, understandings: [] });
    expect(parsed.understandings).toEqual([]);
  });
});
