import { describe, it, expect } from "vitest";
import { selectRerunTargets, RERUN_CAP, type RerunCandidate } from "../rerunSelection";

function c(p: Partial<RerunCandidate> & { question_id: string }): RerunCandidate {
  return {
    user_action: "pending",
    suggested_answer: "yes",
    confidence_pct: 90,
    factsheet_version: null,
    ...p,
  };
}

describe("selectRerunTargets", () => {
  it("selects pending + weak (unknown or confidence < 60) rows behind the version", () => {
    const rows = [
      c({ question_id: "1", suggested_answer: "unknown", confidence_pct: null }),
      c({ question_id: "2", suggested_answer: "no", confidence_pct: 40 }),
      c({ question_id: "3", suggested_answer: "yes", confidence_pct: 95 }), // strong -> skip
    ];
    const { questionIds } = selectRerunTargets(rows, 1);
    expect(questionIds.sort()).toEqual(["1", "2"]);
  });

  it("never touches non-pending rows", () => {
    const rows = [
      c({ question_id: "1", user_action: "accepted", suggested_answer: "unknown", confidence_pct: null }),
      c({ question_id: "2", user_action: "dismissed", confidence_pct: 10 }),
    ];
    expect(selectRerunTargets(rows, 1).questionIds).toEqual([]);
  });

  it("skips rows already re-run at this version, keeps older ones", () => {
    const rows = [
      c({ question_id: "1", confidence_pct: 10, factsheet_version: 2 }), // already at v2
      c({ question_id: "2", confidence_pct: 10, factsheet_version: 1 }), // behind
      c({ question_id: "3", confidence_pct: 10, factsheet_version: null }), // never
    ];
    expect(selectRerunTargets(rows, 2).questionIds.sort()).toEqual(["2", "3"]);
  });

  it("orders weakest first and caps, reporting the overflow", () => {
    const rows = Array.from({ length: RERUN_CAP + 5 }, (_, i) =>
      c({ question_id: `q${i}`, suggested_answer: "unknown", confidence_pct: i }),
    );
    const { questionIds, droppedByCap } = selectRerunTargets(rows, 1);
    expect(questionIds).toHaveLength(RERUN_CAP);
    expect(droppedByCap).toBe(5);
    // Lowest confidence first.
    expect(questionIds[0]).toBe("q0");
  });

  it("treats null confidence as weak", () => {
    const rows = [c({ question_id: "1", suggested_answer: "no", confidence_pct: null })];
    expect(selectRerunTargets(rows, 1).questionIds).toEqual(["1"]);
  });
});
