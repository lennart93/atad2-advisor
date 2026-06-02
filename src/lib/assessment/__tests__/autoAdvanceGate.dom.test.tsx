// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import {
  aiHasExplanationForAnswer,
  decideAutoAdvance,
} from "../autoAdvanceGate";
import type { QuestionPrefill } from "@/lib/prefill/types";

// ---------------------------------------------------------------------------
// Integration-level test rig.
//
// Mounts a focused React harness that wires together the EXACT same building
// blocks Assessment.tsx uses for the auto-advance flow:
//
//   - `aiHasExplanationForAnswer(currentPrefill, answer)` (the gate predicate)
//   - `decideAutoAdvance({...})` (the decision matrix)
//
// The harness mirrors the JSX guards in Assessment.tsx 1:1:
//
//   * Panel-render guard (Assessment.tsx ~2247): renders when an AI prefill
//     applies to the picked answer AND has material (suggested_toelichting /
//     committed_text / accepted / edited). Same fields are checked here.
//   * Continue button (Assessment.tsx ~2410): shows when the panel is visible
//     AND the AI applies to this answer.
//
// `autoAdvanceWiring.test.ts` separately verifies Assessment.tsx actually uses
// these primitives — so this DOM test plus the wiring test together cover both
// "logic produces correct DOM" and "production wiring still calls that logic".
// ---------------------------------------------------------------------------

type Prefill = Pick<
  QuestionPrefill,
  "suggested_answer" | "suggested_toelichting" | "committed_text" | "user_action"
>;

function buildPrefill(overrides: Partial<Prefill>): Prefill {
  return {
    suggested_answer: null,
    suggested_toelichting: null,
    committed_text: null,
    user_action: null,
    ...overrides,
  };
}

interface OptionDef {
  label: "Yes" | "No";
  requiresExplanation: boolean;
}

function AssessmentHarness(props: {
  prefill: Prefill | null;
  options: OptionDef[];
  onAutoAdvance: () => void;
  onContinue: () => void;
}) {
  const [selected, setSelected] = useState<string>("");

  const aiHasExplanation = aiHasExplanationForAnswer(props.prefill, selected);
  const selectedOption = props.options.find((o) => o.label === selected);
  const requiresExplanation = !!selectedOption?.requiresExplanation;

  // Reproduces Assessment.tsx handleAnswerSelect ~line 1192-1218.
  // Decision is computed against the same gate function used in production.
  const handleAnswerClick = (answer: string) => {
    setSelected(answer);
    const opt = props.options.find((o) => o.label === answer);
    const reqExp = !!opt?.requiresExplanation;
    const ai = aiHasExplanationForAnswer(props.prefill, answer);
    const decision = decideAutoAdvance({
      navigationIndex: -1,
      autoAdvance: true,
      requiresExplanation: reqExp,
      aiHasExplanation: ai,
      hasContextPrompt: false,
    });
    if (decision === "advance-immediately" || decision === "advance-after-context") {
      props.onAutoAdvance();
    }
  };

  // Mirrors Assessment.tsx panel-render guard ~lines 2243-2253.
  const aiAppliesToAnswer =
    !!props.prefill?.suggested_answer &&
    !!selected &&
    selected.toLowerCase() === props.prefill.suggested_answer;
  const effectivePrefill = aiAppliesToAnswer ? props.prefill : null;
  const shouldRenderPanel =
    requiresExplanation ||
    !!effectivePrefill?.suggested_toelichting ||
    !!effectivePrefill?.committed_text ||
    effectivePrefill?.user_action === "accepted" ||
    effectivePrefill?.user_action === "edited";

  // Mirrors Assessment.tsx Continue button branch ~lines 2410-2421.
  const showContinue =
    !!selected &&
    (
      (shouldRenderPanel && (aiAppliesToAnswer || requiresExplanation)) ||
      (aiAppliesToAnswer && !requiresExplanation && aiHasExplanation)
    );

  return (
    <div>
      <div role="radiogroup" aria-label="answer">
        {props.options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            data-testid={`answer-${opt.label}`}
            onClick={() => handleAnswerClick(opt.label)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {shouldRenderPanel && (
        <div data-testid="explanation-panel">
          {effectivePrefill?.suggested_toelichting && (
            <div data-testid="suggested-toelichting">
              {effectivePrefill.suggested_toelichting}
            </div>
          )}
        </div>
      )}

      {showContinue && (
        <button
          type="button"
          data-testid="continue-button"
          onClick={props.onContinue}
        >
          Continue
        </button>
      )}
    </div>
  );
}

describe("Auto-advance gate — DOM behavior (jsdom)", () => {
  it("REPRO: clicking 'No' with a staged AI explanation keeps panel visible, shows Continue, does NOT auto-advance", async () => {
    const onAutoAdvance = vi.fn();
    const onContinue = vi.fn();
    const prefill = buildPrefill({
      suggested_answer: "no",
      suggested_toelichting: "Because the entity is a hybrid mismatch per ATAD2 article 9.",
    });

    render(
      <AssessmentHarness
        prefill={prefill}
        options={[
          { label: "Yes", requiresExplanation: false },
          { label: "No", requiresExplanation: false }, // <-- key: No normally would NOT require explanation
        ]}
        onAutoAdvance={onAutoAdvance}
        onContinue={onContinue}
      />,
    );

    // Sanity: panel + Continue not visible before any click.
    expect(screen.queryByTestId("explanation-panel")).toBeNull();
    expect(screen.queryByTestId("continue-button")).toBeNull();

    // Act: click "No".
    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-No"));
    });

    // Assert (1): auto-advance MUST NOT have been called.
    expect(onAutoAdvance).not.toHaveBeenCalled();

    // Assert (2): explanation panel is visible (not flashing & disappearing).
    const panel = screen.getByTestId("explanation-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId("suggested-toelichting")).toHaveTextContent(
      "Because the entity is a hybrid mismatch per ATAD2 article 9.",
    );

    // Assert (3): Continue button is visible so user can proceed.
    const continueBtn = screen.getByTestId("continue-button");
    expect(continueBtn).toBeInTheDocument();

    // Assert (4): clicking Continue invokes the submit handler (i.e. user
    // actually moves forward — they're not stuck).
    await act(async () => {
      fireEvent.click(continueBtn);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: clicking 'No' with NO prefill auto-advances immediately (regression check)", async () => {
    const onAutoAdvance = vi.fn();
    const onContinue = vi.fn();

    render(
      <AssessmentHarness
        prefill={null}
        options={[
          { label: "Yes", requiresExplanation: false },
          { label: "No", requiresExplanation: false },
        ]}
        onAutoAdvance={onAutoAdvance}
        onContinue={onContinue}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-No"));
    });

    // Classic flow preserved: auto-advance fires, panel not shown.
    expect(onAutoAdvance).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("explanation-panel")).toBeNull();
    expect(screen.queryByTestId("continue-button")).toBeNull();
  });

  it("CONTROL: AI suggested 'no' but user clicks 'yes' → auto-advance still fires (prefill doesn't apply)", async () => {
    const onAutoAdvance = vi.fn();
    const prefill = buildPrefill({
      suggested_answer: "no",
      suggested_toelichting: "AI thinks no",
    });

    render(
      <AssessmentHarness
        prefill={prefill}
        options={[
          { label: "Yes", requiresExplanation: false },
          { label: "No", requiresExplanation: false },
        ]}
        onAutoAdvance={onAutoAdvance}
        onContinue={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-Yes"));
    });

    expect(onAutoAdvance).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("explanation-panel")).toBeNull();
  });

  it("EDIT-PERSISTED: clicking 'No' with a prior user_action=edited keeps the panel visible (locked state)", async () => {
    const onAutoAdvance = vi.fn();
    const prefill = buildPrefill({
      suggested_answer: "no",
      committed_text: "User-finalized text from a prior session",
      user_action: "edited",
    });

    render(
      <AssessmentHarness
        prefill={prefill}
        options={[
          { label: "Yes", requiresExplanation: false },
          { label: "No", requiresExplanation: false },
        ]}
        onAutoAdvance={onAutoAdvance}
        onContinue={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("answer-No"));
    });

    expect(onAutoAdvance).not.toHaveBeenCalled();
    expect(screen.getByTestId("explanation-panel")).toBeInTheDocument();
    expect(screen.getByTestId("continue-button")).toBeInTheDocument();
  });
});
