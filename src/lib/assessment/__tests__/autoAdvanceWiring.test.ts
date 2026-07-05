import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Wiring test: prevents regressions where someone removes the gate from one
// of the auto-advance branches in Assessment.tsx but leaves the unit-tested
// predicate intact. The unit tests on decideAutoAdvance / aiHasExplanationForAnswer
// only prove the *logic* works; this test proves the production code actually
// *uses* that logic on both branches where auto-advance fires.

const assessmentSource = readFileSync(
  join(__dirname, "../../../pages/Assessment.tsx"),
  "utf8",
);

describe("Assessment.tsx auto-advance wiring", () => {
  it("imports the gate predicate", () => {
    expect(assessmentSource).toMatch(
      /from\s+"@\/lib\/assessment\/autoAdvanceGate"/,
    );
    expect(assessmentSource).toMatch(/aiHasExplanationForAnswer/);
  });

  it("computes aiHasExplanationForAnswer inside handleAnswerSelect", () => {
    // The predicate is computed once and reused in both branches.
    expect(assessmentSource).toMatch(
      /const\s+aiHasExplanationForAnswer\s*=\s*computeAiHasExplanationForAnswer\(\s*currentPrefill\s*,\s*answer\s*\)/,
    );
  });

  it("folds the predicate into the blockAutoAdvance gate", () => {
    // The gate widened to also cover the Route B Unknown companion; the
    // predicate must still be one of its inputs.
    expect(assessmentSource).toMatch(
      /const\s+blockAutoAdvance\s*=\s*aiHasExplanationForAnswer\s*\|\|\s*unknownRouteBStaged/,
    );
  });

  it("gates the early-return auto-advance on !blockAutoAdvance", () => {
    // Branch 1: the "auto-advance immediately" path. The branch may carry
    // extra conditions (e.g. the "Always" comment-mode hold), so only the
    // gate's presence in the condition is asserted, not the full expression.
    expect(assessmentSource).toMatch(
      /if\s*\(\s*!\s*requiresExplanation\s*&&\s*!\s*blockAutoAdvance\b/,
    );
  });

  it("gates the post-context auto-advance on !blockAutoAdvance", () => {
    // Branch 2: the "auto-advance after context check" path. Same shape as
    // branch 1: assert the gate is an input, allow trailing extra conditions.
    expect(assessmentSource).toMatch(
      /if\s*\(\s*autoAdvance\s*&&\s*!\s*requiresExplanation\s*&&\s*!\s*blockAutoAdvance\b/,
    );
  });

  it("has a dedicated wait branch that fires when blockAutoAdvance is true", () => {
    // The else-if branch that explicitly handles the staged-explanation case.
    expect(assessmentSource).toMatch(/else\s+if\s*\(\s*blockAutoAdvance\s*\)/);
  });

  it("the JSX panel-render guard uses the same prefill fields the predicate uses", () => {
    // Lock-step check: when the predicate returns true, the JSX guard must also
    // render the panel (otherwise the user sees no explanation despite the wait).
    // The JSX guard mentions all four of: suggested_toelichting, committed_text,
    // user_action === "accepted", user_action === "edited".
    expect(assessmentSource).toMatch(/suggested_toelichting/);
    expect(assessmentSource).toMatch(/committed_text/);
    expect(assessmentSource).toMatch(/user_action\s*===\s*"accepted"/);
    expect(assessmentSource).toMatch(/user_action\s*===\s*"edited"/);
  });

  it("the Continue button visibility branch covers aiAppliesToAnswer", () => {
    // The Continue button must surface when the panel renders for a prefill,
    // so the user can actually act on the staged explanation.
    expect(assessmentSource).toMatch(/aiAppliesToAnswer/);
    expect(assessmentSource).toMatch(/handleContinueWithReminder/);
  });
});
