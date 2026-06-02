import type { QuestionPrefill } from "@/lib/prefill/types";

/**
 * The AI has staged explanation material for `answer` in one of two cases:
 *
 * 1. Route A — AI suggested an answer that matches the user's pick AND there is
 *    text to act on (suggested_toelichting, committed_text, or a prior
 *    accept/edit).
 * 2. Route B Unknown companion — the swarm could not derive an answer
 *    (suggested_answer is null), but did produce contextual_hint plus its
 *    companion suggested_toelichting_unknown. When the user picks Unknown,
 *    Assessment.tsx swaps the unknown variant into a synthetic prefill and
 *    renders the SuggestionCard. Auto-advance must hold here too, otherwise
 *    the card never gets a chance to display.
 *
 * Mirrors the panel-render guard in Assessment.tsx so "panel visible" and
 * "auto-advance blocked" stay in lock-step.
 */
export function aiHasExplanationForAnswer(
  prefill: Pick<
    QuestionPrefill,
    | "suggested_answer"
    | "suggested_toelichting"
    | "committed_text"
    | "user_action"
    | "contextual_hint"
    | "suggested_toelichting_unknown"
  > | null | undefined,
  answer: string | null | undefined,
): boolean {
  if (!prefill || !answer) return false;
  const answerLower = answer.toLowerCase();

  // Route A: AI picked an answer; user's pick matches; explanation material exists.
  if (prefill.suggested_answer && answerLower === prefill.suggested_answer) {
    return (
      !!prefill.suggested_toelichting ||
      !!prefill.committed_text ||
      prefill.user_action === "accepted" ||
      prefill.user_action === "edited"
    );
  }

  // Route B Unknown companion: contextual_hint + unknown-toelichting present and
  // user picked Unknown. Mirrors Assessment.tsx's unknownToelichtingApplies.
  if (answerLower === "unknown" && prefill.contextual_hint && prefill.suggested_toelichting_unknown) {
    return true;
  }

  return false;
}

export type AutoAdvanceDecision =
  | "advance-immediately"   // early-return path in handleAnswerSelect (no context lookup needed)
  | "advance-after-context" // post-loadContextQuestions auto-advance
  | "wait-for-explanation"  // requires_explanation === true
  | "wait-for-prefill"      // AI staged a toelichting/commit for this answer
  | "wait-for-context"      // context prompt loaded; show context panel
  | "wait-other";           // back-navigation, auto-advance disabled, etc.

interface DecisionInput {
  navigationIndex: number;        // -1 = normal forward flow
  autoAdvance: boolean;           // user toggle
  requiresExplanation: boolean;
  aiHasExplanation: boolean;      // output of aiHasExplanationForAnswer
  hasContextPrompt: boolean;      // result of loadContextQuestions
}

/**
 * Mirrors the auto-advance branching inside handleAnswerSelect in Assessment.tsx
 * as a pure function so the full decision matrix can be tested.
 *
 * Stages, in code order:
 *   1. Early-return (no context lookup) — only when neither the question nor
 *      the AI needs the user to dwell.
 *   2. (context lookup happens between stages)
 *   3. Post-context — same gates plus the loaded contextPrompt.
 */
export function decideAutoAdvance(input: DecisionInput): AutoAdvanceDecision {
  const { navigationIndex, autoAdvance, requiresExplanation, aiHasExplanation, hasContextPrompt } = input;

  // Stage 1: early-return path.
  if (!requiresExplanation && !aiHasExplanation) {
    return navigationIndex === -1 ? "advance-immediately" : "wait-other";
  }

  // Back-navigation never auto-advances.
  if (navigationIndex !== -1) {
    return hasContextPrompt ? "wait-for-context" : "wait-other";
  }

  // Stage 2: context loaded for forward flow.
  if (hasContextPrompt) return "wait-for-context";

  // Stage 3: forward, context already checked.
  if (autoAdvance && !requiresExplanation && !aiHasExplanation) return "advance-after-context";
  if (requiresExplanation) return "wait-for-explanation";
  if (aiHasExplanation) return "wait-for-prefill";
  return "wait-other";
}
