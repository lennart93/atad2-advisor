import { describe, it, expect } from "vitest";
import { aiHasExplanationForAnswer, decideAutoAdvance } from "../autoAdvanceGate";

const basePrefill = {
  suggested_answer: "no" as const,
  suggested_toelichting: null as string | null,
  committed_text: null as string | null,
  user_action: null as "accepted" | "edited" | "dismissed" | null,
  contextual_hint: null as string | null,
  suggested_toelichting_unknown: null as string | null,
};

const routeBPrefill = {
  suggested_answer: null,
  suggested_toelichting: null as string | null,
  committed_text: null as string | null,
  user_action: null as "accepted" | "edited" | "dismissed" | null,
  contextual_hint: "In this case, confirm with the group whether ..." as string | null,
  suggested_toelichting_unknown: "Camden B.V. has ... It is currently unknown whether ..." as string | null,
};

describe("aiHasExplanationForAnswer", () => {
  it("returns false when there is no prefill", () => {
    expect(aiHasExplanationForAnswer(null, "No")).toBe(false);
    expect(aiHasExplanationForAnswer(undefined, "No")).toBe(false);
  });

  it("returns false when no answer is given", () => {
    expect(aiHasExplanationForAnswer({ ...basePrefill, suggested_toelichting: "Because X" }, "")).toBe(false);
    expect(aiHasExplanationForAnswer({ ...basePrefill, suggested_toelichting: "Because X" }, null)).toBe(false);
  });

  it("returns false when AI suggested a different answer than the user picked", () => {
    const prefill = { ...basePrefill, suggested_answer: "yes" as const, suggested_toelichting: "Because X" };
    expect(aiHasExplanationForAnswer(prefill, "No")).toBe(false);
  });

  it("returns false when the AI suggested this answer but staged nothing for it", () => {
    expect(aiHasExplanationForAnswer(basePrefill, "No")).toBe(false);
  });

  it("returns true when the AI suggested this answer AND staged a toelichting (case-insensitive)", () => {
    const prefill = { ...basePrefill, suggested_toelichting: "Because the entity is opaque" };
    expect(aiHasExplanationForAnswer(prefill, "No")).toBe(true);
    expect(aiHasExplanationForAnswer(prefill, "no")).toBe(true);
    expect(aiHasExplanationForAnswer(prefill, "NO")).toBe(true);
  });

  it("returns true when committed_text exists (post-accept persisted state)", () => {
    const prefill = { ...basePrefill, committed_text: "User-finalized text" };
    expect(aiHasExplanationForAnswer(prefill, "No")).toBe(true);
  });

  it("returns true when a prior user_action is accepted or edited", () => {
    expect(aiHasExplanationForAnswer({ ...basePrefill, user_action: "accepted" }, "No")).toBe(true);
    expect(aiHasExplanationForAnswer({ ...basePrefill, user_action: "edited" }, "No")).toBe(true);
  });

  it("returns false when user_action is dismissed", () => {
    expect(aiHasExplanationForAnswer({ ...basePrefill, user_action: "dismissed" }, "No")).toBe(false);
  });

  it("returns false when suggested_answer is null even if toelichting exists", () => {
    const prefill = { ...basePrefill, suggested_answer: null, suggested_toelichting: "Hint without an answer" };
    expect(aiHasExplanationForAnswer(prefill, "No")).toBe(false);
  });

  describe("Route B Unknown companion (v9+ contextual_hint + suggested_toelichting_unknown)", () => {
    it("returns true when user picks Unknown and both hint+unknown-toelichting are staged", () => {
      expect(aiHasExplanationForAnswer(routeBPrefill, "Unknown")).toBe(true);
      // case-insensitive
      expect(aiHasExplanationForAnswer(routeBPrefill, "unknown")).toBe(true);
      expect(aiHasExplanationForAnswer(routeBPrefill, "UNKNOWN")).toBe(true);
    });

    it("returns false when user picks Yes/No on a Route B row (no Route A match)", () => {
      expect(aiHasExplanationForAnswer(routeBPrefill, "Yes")).toBe(false);
      expect(aiHasExplanationForAnswer(routeBPrefill, "No")).toBe(false);
    });

    it("returns false when contextual_hint is set but suggested_toelichting_unknown is null (v10 bug pre-v11)", () => {
      const partial = { ...routeBPrefill, suggested_toelichting_unknown: null };
      expect(aiHasExplanationForAnswer(partial, "Unknown")).toBe(false);
    });

    it("returns false when suggested_toelichting_unknown is set but contextual_hint is null (impossible per swarm prompt, but defensive)", () => {
      const stray = { ...routeBPrefill, contextual_hint: null };
      expect(aiHasExplanationForAnswer(stray, "Unknown")).toBe(false);
    });

    it("does NOT regress: a Route A prefill with suggested_answer='unknown' still works via Route A path", () => {
      const routeAUnknown = {
        ...basePrefill,
        suggested_answer: "unknown" as const,
        suggested_toelichting: "Some derived clarification.",
      };
      expect(aiHasExplanationForAnswer(routeAUnknown, "Unknown")).toBe(true);
    });
  });
});

describe("decideAutoAdvance — full decision matrix", () => {
  const forward = { navigationIndex: -1, autoAdvance: true, hasContextPrompt: false };

  describe("THE REPRO: AI staged explanation for an answer that wouldn't normally require one", () => {
    it("user clicks the AI-suggested answer → blocked at the early-return stage", () => {
      // Real predicate fed into the real decision: this is the exact runtime path.
      const ai = aiHasExplanationForAnswer(
        { ...basePrefill, suggested_answer: "no", suggested_toelichting: "Because the docs say so" },
        "No",
      );
      expect(ai).toBe(true);

      const decision = decideAutoAdvance({
        ...forward,
        requiresExplanation: false,
        aiHasExplanation: ai,
      });
      // No auto-advance — must NOT be one of the "advance-*" outcomes.
      expect(decision).toBe("wait-for-prefill");
      expect(decision).not.toMatch(/^advance/);
    });

    it("user clicks the OTHER answer (AI suggested no, user clicked yes) → auto-advance normally", () => {
      const ai = aiHasExplanationForAnswer(
        { ...basePrefill, suggested_answer: "no", suggested_toelichting: "..." },
        "Yes",
      );
      expect(ai).toBe(false);

      const decision = decideAutoAdvance({
        ...forward,
        requiresExplanation: false,
        aiHasExplanation: ai,
      });
      expect(decision).toBe("advance-immediately");
    });

    it("post-context path also blocks when AI staged an explanation", () => {
      // The early-return is skipped (e.g. requires_explanation true earlier flips it),
      // but the post-context branch must also gate on aiHasExplanation.
      const decision = decideAutoAdvance({
        ...forward,
        requiresExplanation: false,
        aiHasExplanation: true, // AI staged toelichting for this answer
        hasContextPrompt: false,
      });
      expect(decision).not.toMatch(/^advance/);
      expect(decision).toBe("wait-for-prefill");
    });
  });

  describe("classic flows (regression coverage)", () => {
    it("plain Yes/No without prefill auto-advances immediately", () => {
      expect(
        decideAutoAdvance({ ...forward, requiresExplanation: false, aiHasExplanation: false }),
      ).toBe("advance-immediately");
    });

    it("requires_explanation=true waits for the textarea", () => {
      const decision = decideAutoAdvance({
        ...forward,
        requiresExplanation: true,
        aiHasExplanation: false,
      });
      // Either path reaches wait-for-explanation; both are non-advance.
      expect(decision).not.toMatch(/^advance/);
    });

    it("a loaded contextPrompt waits even without prefill", () => {
      const decision = decideAutoAdvance({
        ...forward,
        requiresExplanation: true, // skips early-return
        aiHasExplanation: false,
        hasContextPrompt: true,
      });
      expect(decision).toBe("wait-for-context");
    });

    it("back-navigation with a no-dwell answer still advances (Assessment.tsx parity)", () => {
      // Assessment.tsx dropped the navigationIndex gate on the early-return:
      // switching to a no-explanation answer while navigating used to strand
      // the user on an answered question with no Continue button.
      const decision = decideAutoAdvance({
        navigationIndex: 2,
        autoAdvance: true,
        requiresExplanation: false,
        aiHasExplanation: false,
        hasContextPrompt: false,
      });
      expect(decision).toBe("advance-immediately");
    });

    it("back-navigation with a dwell never auto-advances", () => {
      const decision = decideAutoAdvance({
        navigationIndex: 2,
        autoAdvance: true,
        requiresExplanation: false,
        aiHasExplanation: true,
        hasContextPrompt: false,
      });
      expect(decision).toBe("wait-other");
      expect(decision).not.toMatch(/^advance/);
    });

    it("autoAdvance toggle off keeps the user on the question", () => {
      const decision = decideAutoAdvance({
        navigationIndex: -1,
        autoAdvance: false,
        requiresExplanation: true, // forces past early-return
        aiHasExplanation: false,
        hasContextPrompt: false,
      });
      expect(decision).not.toMatch(/^advance/);
    });
  });
});
