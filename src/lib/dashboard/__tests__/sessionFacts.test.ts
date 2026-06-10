import { describe, expect, it } from "vitest";
import { groupSessionFacts } from "../sessionFacts";

describe("groupSessionFacts", () => {
  it("counts answers per session and defaults missing sessions to zero", () => {
    const facts = groupSessionFacts(
      ["s1", "s2", "s3"],
      [{ session_id: "s1" }, { session_id: "s1" }, { session_id: "s2" }],
      [],
    );
    expect(facts.get("s1")).toEqual({ answerCount: 2, hasMemorandum: false, memorandumDate: undefined });
    expect(facts.get("s2")?.answerCount).toBe(1);
    expect(facts.get("s3")?.answerCount).toBe(0);
  });

  it("flags a memorandum and picks the latest generated_at regardless of row order", () => {
    const facts = groupSessionFacts(
      ["s1"],
      [],
      [
        { session_id: "s1", generated_at: "2026-01-02T10:00:00Z" },
        { session_id: "s1", generated_at: "2026-03-05T10:00:00Z" },
        { session_id: "s1", generated_at: "2026-02-01T10:00:00Z" },
      ],
    );
    expect(facts.get("s1")).toEqual({
      answerCount: 0,
      hasMemorandum: true,
      memorandumDate: "2026-03-05T10:00:00Z",
    });
  });

  it("ignores rows for sessions that were not requested", () => {
    const facts = groupSessionFacts(
      ["s1"],
      [{ session_id: "ghost" }],
      [{ session_id: "ghost", generated_at: "2026-01-01T00:00:00Z" }],
    );
    expect(facts.get("s1")).toEqual({ answerCount: 0, hasMemorandum: false, memorandumDate: undefined });
    expect(facts.has("ghost")).toBe(false);
  });
});
