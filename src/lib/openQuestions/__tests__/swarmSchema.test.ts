import { describe, it, expect } from "vitest";
// Deno edge-function schema imported relatively, same precedent as
// src/lib/structure/__tests__/extract-schemas.test.ts. schemas.ts only
// imports zod, which resolves from node_modules under vitest.
import { SwarmPrefill } from "../../../../supabase/functions/prefill-documents/schemas";

const routeB = {
  suggested_answer: null,
  confidence_pct: null,
  answer_rationale: null,
  suggested_toelichting: null,
  source_refs: [],
  contextual_hint:
    "In this case, confirmation is needed from Castleton Commodities International LLC on its US classification of the taxpayer.",
  suggested_toelichting_unknown:
    "The taxpayer is held by Castleton Commodities International LLC. It is unknown how that participant classifies the taxpayer under US tax law.",
};

const routeA = {
  suggested_answer: "yes",
  confidence_pct: 85,
  answer_rationale: "The holding period started on 5 January 2023.",
  suggested_toelichting:
    "The holding period started on 5 January 2023 when X acquired 62.7% of the shares.",
  source_refs: [{ doc_label: "Financial statements 2023", location: "p. 12" }],
  contextual_hint: null,
  suggested_toelichting_unknown: null,
};

describe("SwarmPrefill client_question (v12)", () => {
  it("defaults client_question to null for a v11-shaped Route B payload without the key", () => {
    const parsed = SwarmPrefill.parse(routeB);
    expect(parsed.client_question).toBeNull();
    expect(parsed.contextual_hint).toBe(routeB.contextual_hint);
    expect(parsed.suggested_toelichting_unknown).toBe(routeB.suggested_toelichting_unknown);
  });

  it("passes a 450-char client_question through intact on Route B", () => {
    const question =
      "We understand that S4 Energy B.V. is held by Castleton Commodities International LLC (US). " +
      "We further understand that CCI grants a loan on which interest is accrued and deducted at the Dutch level. " +
      "Could you please confirm whether these payments are included in the tax base of the US.";
    const padded = question + " ".repeat(0) + "x".repeat(450 - question.length);
    expect(padded.length).toBe(450);
    const parsed = SwarmPrefill.parse({ ...routeB, client_question: padded });
    expect(parsed.client_question).toBe(padded);
  });

  it("nulls all three Route B companions when a Route A payload wrongly carries them", () => {
    const parsed = SwarmPrefill.parse({
      ...routeA,
      contextual_hint: "In this case, something.",
      suggested_toelichting_unknown: "The taxpayer has X. It is unknown whether Y.",
      client_question: "Could you please confirm Y?",
    });
    expect(parsed.suggested_toelichting).toBe(routeA.suggested_toelichting);
    expect(parsed.contextual_hint).toBeNull();
    expect(parsed.suggested_toelichting_unknown).toBeNull();
    expect(parsed.client_question).toBeNull();
  });

  it("nulls a stray client_question when contextual_hint is null (companion rides with the hint)", () => {
    const parsed = SwarmPrefill.parse({
      ...routeA,
      client_question: "Could you please confirm the holding period?",
    });
    expect(parsed.client_question).toBeNull();
    expect(parsed.suggested_toelichting).toBe(routeA.suggested_toelichting);
  });

  it("rejects a client_question longer than 700 chars but accepts 451-700 (DB truncation handles the gap)", () => {
    expect(() =>
      SwarmPrefill.parse({ ...routeB, client_question: "x".repeat(701) }),
    ).toThrow();
    const overshoot = SwarmPrefill.parse({ ...routeB, client_question: "x".repeat(700) });
    expect(overshoot.client_question).toBe("x".repeat(700));
    const slight = SwarmPrefill.parse({ ...routeB, client_question: "x".repeat(451) });
    expect(slight.client_question).toBe("x".repeat(451));
  });

  it("still rejects an all-null payload via the existing refine", () => {
    expect(() =>
      SwarmPrefill.parse({
        suggested_answer: null,
        confidence_pct: null,
        answer_rationale: null,
        suggested_toelichting: null,
        source_refs: [],
        contextual_hint: null,
        suggested_toelichting_unknown: null,
        client_question: null,
      }),
    ).toThrow();
  });
});
