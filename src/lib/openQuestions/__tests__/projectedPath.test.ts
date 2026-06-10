import { describe, it, expect } from "vitest";
import {
  computeProjectedPath,
  PATH_ROOT_QUESTION_ID,
  type QuestionBranchRow,
} from "../projectedPath";

/** Tiny fixture helper: one atad2_questions row (question + answer option + where it leads). */
function branch(
  qid: string,
  option: string,
  next: string | null,
): QuestionBranchRow {
  return { question_id: qid, answer_option: option, next_question_id: next };
}

/** A question with the usual three options that all lead to the same next question. */
function straight(qid: string, next: string | null): QuestionBranchRow[] {
  return [
    branch(qid, "Yes", next),
    branch(qid, "No", next),
    branch(qid, "Unknown", next),
  ];
}

const recorded = (entries: [string, string][] = []) => new Map(entries);
const suggested = (entries: [string, string | null][] = []) => new Map(entries);

describe("computeProjectedPath", () => {
  it("walks a linear chain of recorded answers and stops at 'end'", () => {
    const branches = [
      ...straight("1", "2"),
      ...straight("2", "3"),
      ...straight("3", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded([["1", "Yes"], ["2", "No"], ["3", "Yes"]]),
      suggested(),
    );
    expect(path).toEqual(new Set(["1", "2", "3"]));
  });

  it("follows the branch of the recorded answer and excludes the sibling subtree", () => {
    // Question 1: Yes -> 2, No -> 5. The 5-subtree must not appear when Yes is recorded.
    const branches = [
      branch("1", "Yes", "2"),
      branch("1", "No", "5"),
      ...straight("2", "end"),
      ...straight("5", "6"),
      ...straight("6", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded([["1", "Yes"]]),
      suggested(),
    );
    expect(path).toEqual(new Set(["1", "2"]));
    expect(path.has("5")).toBe(false);
    expect(path.has("6")).toBe(false);
  });

  it("lets a recorded answer win over a contradicting suggestion", () => {
    const branches = [
      branch("1", "Yes", "2"),
      branch("1", "No", "5"),
      ...straight("2", "end"),
      ...straight("5", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded([["1", "No"]]),
      suggested([["1", "yes"]]),
    );
    expect(path).toEqual(new Set(["1", "5"]));
  });

  it("steers on lowercase suggestions, matching answer_option case-insensitively", () => {
    const branches = [
      branch("1", "Yes", "2"),
      branch("1", "No", "5"),
      branch("2", "Yes", "3"),
      branch("2", "No", "4"),
      ...straight("3", "end"),
      ...straight("4", "end"),
      ...straight("5", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded(),
      suggested([["1", "yes"], ["2", "no"]]),
    );
    expect(path).toEqual(new Set(["1", "2", "4"]));
  });

  it("treats a suggested 'unknown' and a null suggestion as wildcard: union of all subtrees", () => {
    const branches = [
      branch("1", "Yes", "2"),
      branch("1", "No", "5"),
      ...straight("2", "end"),
      ...straight("5", "end"),
    ];
    for (const value of ["unknown", null] as const) {
      const path = computeProjectedPath(
        branches,
        recorded(),
        suggested([["1", value]]),
      );
      expect(path).toEqual(new Set(["1", "2", "5"]));
    }
  });

  it("keeps steering on suggestions downstream of a wildcard inside each explored branch", () => {
    // Question 1 is wildcard, so both 2 and 5 are explored. Inside those
    // subtrees, suggestions keep narrowing the path.
    const branches = [
      branch("1", "Yes", "2"),
      branch("1", "No", "5"),
      branch("2", "Yes", "3"),
      branch("2", "No", "4"),
      branch("5", "Yes", "6"),
      branch("5", "No", "7"),
      ...straight("3", "end"),
      ...straight("4", "end"),
      ...straight("6", "end"),
      ...straight("7", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded(),
      suggested([["2", "yes"], ["5", "no"]]),
    );
    expect(path).toEqual(new Set(["1", "2", "5", "3", "7"]));
    expect(path.has("4")).toBe(false);
    expect(path.has("6")).toBe(false);
  });

  it("follows the Unknown branch row deterministically for a recorded 'Unknown' answer", () => {
    // Unlike a suggested 'unknown', a recorded Unknown is a real answer:
    // it follows the Unknown row, exactly like the replay in Assessment.tsx.
    const branches = [
      branch("1", "Yes", "2"),
      branch("1", "No", "3"),
      branch("1", "Unknown", "4"),
      ...straight("2", "end"),
      ...straight("3", "end"),
      ...straight("4", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded([["1", "Unknown"]]),
      suggested(),
    );
    expect(path).toEqual(new Set(["1", "4"]));
  });

  it("fails open to wildcard when a recorded answer matches no branch row", () => {
    // Data anomaly: the answer "Maybe" exists in no row. Instead of
    // dead-ending (and hiding everything downstream), explore all branches.
    const branches = [
      branch("1", "Yes", "2"),
      branch("1", "No", "3"),
      ...straight("2", "end"),
      ...straight("3", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded([["1", "Maybe"]]),
      suggested(),
    );
    expect(path).toEqual(new Set(["1", "2", "3"]));
  });

  it("terminates on a cycle in next_question_id", () => {
    const branches = [
      ...straight("1", "2"),
      ...straight("2", "1"), // loops back
    ];
    const path = computeProjectedPath(branches, recorded(), suggested());
    expect(path).toEqual(new Set(["1", "2"]));
  });

  it("treats both null and 'end' next_question_id as terminal", () => {
    const branches = [
      branch("1", "Yes", "end"),
      branch("1", "No", null),
    ];
    const path = computeProjectedPath(branches, recorded(), suggested());
    expect(path).toEqual(new Set(["1"]));
  });

  it("returns an empty set for an empty branches array", () => {
    const path = computeProjectedPath([], recorded(), suggested());
    expect(path).toEqual(new Set());
  });

  it("excludes questions never reachable from the root, even when they carry suggestions", () => {
    const branches = [
      ...straight("1", "end"),
      ...straight("99", "100"), // an island: nothing points at 99
      ...straight("100", "end"),
    ];
    const path = computeProjectedPath(
      branches,
      recorded(),
      suggested([["99", "yes"], ["100", "no"]]),
    );
    expect(path).toEqual(new Set(["1"]));
  });

  it("exposes the questionnaire root id as '1'", () => {
    expect(PATH_ROOT_QUESTION_ID).toBe("1");
  });
});
