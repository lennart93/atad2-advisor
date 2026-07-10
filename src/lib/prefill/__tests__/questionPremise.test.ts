import { describe, it, expect } from "vitest";
import { buildPremiseMap, formatPremise, buildPremiseText, type QEdge } from "../questionPremise";

// A slice of the real ATAD2 tree (Q10-Q15):
//   10: Yes->11, No/Unknown->12       (gates)
//   11: Yes/No/Unknown->12            (pass-through)
//   12: Yes->13, No/Unknown->15       (gates; reached from 10 AND 11 -> convergence)
//   13: Yes->14, No/Unknown->15       (gates)
//   14: Yes/No/Unknown->15            (pass-through)
const EDGES: QEdge[] = [
  { question_id: "10", answer_option: "Yes", next_question_id: "11" },
  { question_id: "10", answer_option: "No", next_question_id: "12" },
  { question_id: "10", answer_option: "Unknown", next_question_id: "12" },
  { question_id: "11", answer_option: "Yes", next_question_id: "12" },
  { question_id: "11", answer_option: "No", next_question_id: "12" },
  { question_id: "11", answer_option: "Unknown", next_question_id: "12" },
  { question_id: "12", answer_option: "Yes", next_question_id: "13" },
  { question_id: "12", answer_option: "No", next_question_id: "15" },
  { question_id: "12", answer_option: "Unknown", next_question_id: "15" },
  { question_id: "13", answer_option: "Yes", next_question_id: "14" },
  { question_id: "13", answer_option: "No", next_question_id: "15" },
  { question_id: "13", answer_option: "Unknown", next_question_id: "15" },
  { question_id: "14", answer_option: "Yes", next_question_id: "15" },
  { question_id: "14", answer_option: "No", next_question_id: "15" },
  { question_id: "14", answer_option: "Unknown", next_question_id: "15" },
];
const TEXT: Record<string, string> = {
  "10": "Is there an onward payment?",
  "11": "Is the income effectively taxed?",
  "12": "Is the payment to an associated party?",
  "13": "Is the payment attributable to a PE of the recipient?",
  "14": "Is the PE of the recipient recognized as such?",
};
const textOf = (id: string) => TEXT[id] ?? id;

describe("buildPremiseMap", () => {
  it("gives Q14 the full unambiguous premise chain (12=Yes, 13=Yes), stopping at the Q12 convergence", () => {
    const m = buildPremiseMap(EDGES, textOf);
    const steps = m.get("14")!;
    expect(steps.map((s) => `${s.question_id}=${s.answers.join("/")}`)).toEqual(["12=Yes", "13=Yes"]);
  });

  it("gives Q13 just 12=Yes", () => {
    expect(buildPremiseMap(EDGES, textOf).get("13")!.map((s) => `${s.question_id}=${s.answers.join("/")}`)).toEqual(["12=Yes"]);
  });

  it("stops at convergence: Q12 has two predecessors so it has no premise steps", () => {
    expect(buildPremiseMap(EDGES, textOf).has("12")).toBe(false);
  });

  it("walks past a pass-through predecessor (Q11 routes all answers to 12) without listing it", () => {
    // Q11 -> 12 is pass-through; its own premise is 10=Yes.
    expect(buildPremiseMap(EDGES, textOf).get("11")!.map((s) => `${s.question_id}=${s.answers.join("/")}`)).toEqual(["10=Yes"]);
  });

  it("root question (Q10) has no premise", () => {
    expect(buildPremiseMap(EDGES, textOf).has("10")).toBe(false);
  });
});

describe("formatPremise", () => {
  it("renders a neutral context block naming the premise questions, with no answer instruction", () => {
    const steps = buildPremiseMap(EDGES, textOf).get("14");
    const text = formatPremise(steps);
    expect(text).toContain("Question context");
    expect(text).toContain("Is the payment to an associated party?");
    expect(text).toContain("Is the payment attributable to a PE of the recipient?");
    expect(text).toContain("Verify each against the documents and the fact sheet");
    // Neutral: it must NOT tell the model to answer no / yes.
    expect(text.toLowerCase()).not.toContain("answer \"no\"");
  });
  it("returns empty string for no steps", () => {
    expect(formatPremise(undefined)).toBe("");
    expect(formatPremise([])).toBe("");
  });
});

describe("buildPremiseText", () => {
  it("maps question ids to their premise strings, omitting questions without a premise", () => {
    const map = buildPremiseText(EDGES, textOf);
    expect(map.has("14")).toBe(true);
    expect(map.has("10")).toBe(false);
    expect(map.get("14")).toContain("Question context");
  });
});
