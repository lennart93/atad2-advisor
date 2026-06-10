import { describe, expect, it } from "vitest";
import {
  MEMO_SECTIONS,
  RISK_TRIO,
  SECTION_DEPENDENCIES,
  hashSectionInputs,
  staleSections,
  type SectionInputs,
} from "../sectionDependencies";

const baseInputs: SectionInputs = {
  session_meta: { taxpayer_name: "Acme BV", fiscal_year: "2025" },
  documents: [{ id: "d1", created_at: "2026-01-01" }],
  structure: { finalized_at: "2026-01-02", updated_at: "2026-01-02" },
  answers: [{ question_id: "q1", answer: "Yes", explanation: "Because." }],
  outcome: { preliminary_outcome: "low", outcome_overridden: false },
  appendix: { updated_at: "2026-01-03", review_status: "confirmed" },
};

describe("section map", () => {
  it("covers exactly the six memo sections", () => {
    expect(MEMO_SECTIONS).toEqual([
      "introduction",
      "risk_outcome",
      "executive_summary",
      "general_background",
      "technical_assessment",
      "conclusion",
    ]);
    expect(Object.keys(SECTION_DEPENDENCIES).sort()).toEqual([...MEMO_SECTIONS].sort());
  });

  it("keeps the risk trio inside the section list", () => {
    for (const s of RISK_TRIO) expect(MEMO_SECTIONS).toContain(s);
  });
});

describe("hashSectionInputs", () => {
  it("is stable across key order", () => {
    const reordered: SectionInputs = {
      ...baseInputs,
      session_meta: { fiscal_year: "2025", taxpayer_name: "Acme BV" },
    };
    expect(hashSectionInputs("introduction", baseInputs)).toBe(
      hashSectionInputs("introduction", reordered),
    );
  });

  it("changes when a dependent input changes", () => {
    const changed: SectionInputs = {
      ...baseInputs,
      answers: [{ question_id: "q1", answer: "No", explanation: "Changed." }],
    };
    expect(hashSectionInputs("conclusion", changed)).not.toBe(
      hashSectionInputs("conclusion", baseInputs),
    );
  });

  it("ignores inputs the section does not depend on", () => {
    const changed: SectionInputs = {
      ...baseInputs,
      answers: [{ question_id: "q1", answer: "No", explanation: "Changed." }],
    };
    // introduction depends on session_meta + documents, not on answers
    expect(hashSectionInputs("introduction", changed)).toBe(
      hashSectionInputs("introduction", baseInputs),
    );
  });
});

describe("staleSections", () => {
  it("returns nothing when nothing changed", () => {
    const prev = Object.fromEntries(
      MEMO_SECTIONS.map((s) => [s, hashSectionInputs(s, baseInputs)]),
    );
    expect(staleSections(prev, baseInputs)).toEqual([]);
  });

  it("expands any stale risk-trio member to the whole trio", () => {
    const prev = Object.fromEntries(
      MEMO_SECTIONS.map((s) => [s, hashSectionInputs(s, baseInputs)]),
    );
    const changed: SectionInputs = {
      ...baseInputs,
      outcome: { preliminary_outcome: "high", outcome_overridden: false },
    };
    const stale = staleSections(prev, changed);
    for (const s of RISK_TRIO) expect(stale).toContain(s);
    expect(stale).not.toContain("introduction");
  });

  it("treats a missing previous hash as stale", () => {
    const stale = staleSections({}, baseInputs);
    expect(stale.sort()).toEqual([...MEMO_SECTIONS].sort());
  });
});
