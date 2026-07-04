import { describe, expect, it } from "vitest";
import {
  isAnalysisReady,
  isSwarmDone,
  type AnalysisReadyInput,
} from "../analysisReady";

// A baseline "healthy, fully analysed" run: 10 questions, all prefilled, the
// suggestion map has caught up. Individual tests override one field.
const base: AnalysisReadyInput = {
  jobStatus: "completed",
  prefillQuestionIdCount: 10,
  suggestionQuestionIdCount: 10,
  totalQuestions: 10,
};

describe("isAnalysisReady", () => {
  it("is ready when the job is completed and the suggestion map has caught up", () => {
    expect(isAnalysisReady(base)).toBe(true);
  });

  it("is NOT ready while the suggestion map lags the prefilled questions", () => {
    // The reported hang: the swarm finished (job completed, all questions
    // prefilled) but one realtime event on the suggestion channel was dropped,
    // so the suggestion map is one short. The screen must stay in the reading
    // stages (bar at 72%) until the caller reconciles the cache, NOT advance on
    // a partial path and NOT the reverse: hang forever is the old bug; here we
    // only assert it correctly withholds readiness until parity.
    expect(isAnalysisReady({ ...base, suggestionQuestionIdCount: 9 })).toBe(false);
    // Once reconciled to parity it flips ready.
    expect(isAnalysisReady({ ...base, suggestionQuestionIdCount: 10 })).toBe(true);
  });

  it("does NOT wedge when duplicate prefill rows exist", () => {
    // Regression: the gate used to compare a prefill ROW count against the
    // suggestion map's DISTINCT count. A duplicate prefill row made rows (11) >
    // distinct (10) forever, so `suggestionCount >= prefillCount` could never
    // hold and the screen hung permanently, even across a reload. Both counts
    // are distinct question ids now, so duplicates are harmless.
    expect(
      isAnalysisReady({
        ...base,
        prefillQuestionIdCount: 10, // distinct, even though 11 rows exist
        suggestionQuestionIdCount: 10,
      }),
    ).toBe(true);
  });

  it("is NOT ready before the swarm is done", () => {
    expect(
      isAnalysisReady({
        jobStatus: "stage2_running",
        prefillQuestionIdCount: 6,
        suggestionQuestionIdCount: 6,
        totalQuestions: 10,
      }),
    ).toBe(false);
  });

  it("is NOT ready with zero prefills", () => {
    expect(
      isAnalysisReady({
        jobStatus: "completed",
        prefillQuestionIdCount: 0,
        suggestionQuestionIdCount: 0,
        totalQuestions: 10,
      }),
    ).toBe(false);
  });

  it("treats full distinct coverage as swarm-done even if the job row is not yet 'completed'", () => {
    // The browser finalises the job row a beat after the last edge call
    // returns; full coverage is a valid done signal on its own.
    const input: AnalysisReadyInput = {
      jobStatus: "stage2_running",
      prefillQuestionIdCount: 10,
      suggestionQuestionIdCount: 10,
      totalQuestions: 10,
    };
    expect(isSwarmDone(input)).toBe(true);
    expect(isAnalysisReady(input)).toBe(true);
  });

  it("does not call the swarm done on a raw-row overshoot while questions are still missing", () => {
    // 11 rows but only 8 DISTINCT questions answered out of 10: a raw row count
    // (11 >= 10) would have declared full coverage prematurely. Distinct counts
    // keep it correctly not-done.
    expect(
      isSwarmDone({
        jobStatus: "stage2_running",
        prefillQuestionIdCount: 8,
        suggestionQuestionIdCount: 8,
        totalQuestions: 10,
      }),
    ).toBe(false);
  });

  it("stays not-ready while the question total is still loading", () => {
    expect(
      isSwarmDone({
        jobStatus: "stage2_running",
        prefillQuestionIdCount: 10,
        suggestionQuestionIdCount: 10,
        totalQuestions: null,
      }),
    ).toBe(false);
  });
});
