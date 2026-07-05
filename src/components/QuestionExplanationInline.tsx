import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface QuestionExplanationInlineProps {
  explanation: string | null;
  contextualHint?: string | null;
  /**
   * Optional control rendered at the start (left) of the info-icon row.
   * Always shown, even when there is no explanation/hint to reveal, so a
   * persistent session control (e.g. the comment-mode toggle) can live on the
   * same right-aligned row as the info icon.
   */
  rowStart?: ReactNode;
  /**
   * Whether the question already has an answer (Yes/No/Unknown) selected. The
   * auto attention nudge (wiggle + help balloon) only fires while the question
   * is still unanswered; once answered, the red dot stays as a quiet indicator
   * but the icon no longer wiggles and the balloon no longer auto-appears.
   */
  isAnswered?: boolean;
}

// How long after a flagged question settles before the help balloon nudges in.
const HELP_BALLOON_DELAY_MS = 3000;
// How long the balloon lingers, fully visible, before it auto-fades.
const HELP_BALLOON_VISIBLE_MS = 8000;
// How long the auto fade-out takes.
const HELP_BALLOON_FADE_MS = 1000;

// Render one text block (the static explanation or the AI hint) with the same
// dash-bullet + paragraph-break handling we had before.
const renderBlock = (text: string) =>
  text.split("\n").map((line, index) => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("-")) {
      const bulletText = trimmedLine.substring(1).trim();
      return (
        <div key={index} className="flex gap-2 ml-4 my-1">
          <span className="text-ds-ink-secondary">•</span>
          <span>{bulletText}</span>
        </div>
      );
    }

    if (trimmedLine === "") {
      return <div key={index} className="h-3" />;
    }

    return <p key={index} className="my-1">{line}</p>;
  });

export const QuestionExplanationInline = ({
  explanation,
  contextualHint,
  rowStart,
  isAnswered = false,
}: QuestionExplanationInlineProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // The auto "Need some help?" nudge on the flagged (red-dot) info control.
  // Appears ~600ms after a flagged question settles and on hover, once per
  // question. This component is keyed by question id (see Assessment.tsx), so
  // the state below resets on every question; the dismissed ref keeps it from
  // re-popping on the same one.
  const [balloonOpen, setBalloonOpen] = useState(false);
  const [balloonEntered, setBalloonEntered] = useState(false);
  const [balloonLeaving, setBalloonLeaving] = useState(false);
  const balloonDismissedRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const hasExplanation = !!explanation && explanation.trim() !== "";
  const hasHint = !!contextualHint && contextualHint.trim() !== "";

  // The nudge only belongs on a flagged question (one carrying an AI hint = the
  // red dot) while the explanation panel is closed and the question is still
  // unanswered. Once the user picks Yes/No/Unknown, the nudge retires.
  const balloonEligible = hasHint && !isOpen && !isAnswered;

  const openBalloon = () => {
    if (balloonDismissedRef.current || !hasHint || isOpen || isAnswered) return;
    setBalloonLeaving(false);
    setBalloonOpen(true);
  };

  const dismissBalloon = () => {
    balloonDismissedRef.current = true;
    setBalloonOpen(false);
    setBalloonEntered(false);
    setBalloonLeaving(false);
  };

  // Auto-appear shortly after a flagged question settles.
  useEffect(() => {
    if (!balloonEligible || balloonDismissedRef.current) return;
    const t = window.setTimeout(() => openBalloon(), HELP_BALLOON_DELAY_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balloonEligible]);

  // Answering the question retires the nudge: hide the balloon now (the wiggle
  // is tied to the balloon, so it stops too) and don't let it re-appear.
  useEffect(() => {
    if (isAnswered) dismissBalloon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswered]);

  // Fade in on the frame after it opens (and again if a hover cancels a fade-out).
  useEffect(() => {
    if (!balloonOpen) {
      setBalloonEntered(false);
      return;
    }
    if (balloonLeaving) return;
    const raf = requestAnimationFrame(() => setBalloonEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [balloonOpen, balloonLeaving]);

  // Linger fully visible for a bit, then start the slow auto fade-out.
  useEffect(() => {
    if (!balloonOpen || !balloonEntered || balloonLeaving) return;
    const t = window.setTimeout(
      () => setBalloonLeaving(true),
      HELP_BALLOON_VISIBLE_MS,
    );
    return () => window.clearTimeout(t);
  }, [balloonOpen, balloonEntered, balloonLeaving]);

  // Once fading out: drop opacity now, then unmount after the fade completes.
  // This is a quiet auto-hide, so it does not mark the nudge dismissed; a hover
  // can still bring it back.
  useEffect(() => {
    if (!balloonLeaving) return;
    setBalloonEntered(false);
    const t = window.setTimeout(() => {
      setBalloonOpen(false);
      setBalloonLeaving(false);
    }, HELP_BALLOON_FADE_MS);
    return () => window.clearTimeout(t);
  }, [balloonLeaving]);

  // Dismiss on a click anywhere outside the balloon and the info control.
  useEffect(() => {
    if (!balloonOpen) return;
    const onDocPointer = (e: MouseEvent) => {
      if (rowRef.current?.contains(e.target as Node)) return;
      dismissBalloon();
    };
    document.addEventListener("mousedown", onDocPointer, true);
    return () => document.removeEventListener("mousedown", onDocPointer, true);
  }, [balloonOpen]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) dismissBalloon(); // opening the panel answers the nudge
  };

  const hasInfo = hasExplanation || hasHint;

  // The info control (the "i" + its red dot) wiggles to point the eye at the
  // available AI hint while the help balloon is up. Tied to the balloon, so it
  // shares the same gate: only on a flagged, unanswered, closed question, and it
  // settles down as the balloon fades or the moment the question is answered.
  const isDancing = balloonOpen && !balloonLeaving;

  // Nothing to show and no control to host: render nothing.
  if (!hasInfo && !rowStart) {
    return null;
  }

  // No explanation/hint, but there is a persistent control to host: render just
  // the row so the control stays reachable on every question.
  if (!hasInfo) {
    return (
      <div className="mt-4 flex items-center justify-end gap-2">{rowStart}</div>
    );
  }

  // The shared white "cloud" (same family as the open-questions hint): a small
  // help nudge anchored above-left of the info control, caret pointing down at
  // it, with a terracotta top edge that ties it to the red dot.
  const helpBalloon = balloonOpen ? (
    <div
      role="status"
      className={`absolute bottom-full right-0 z-20 mb-2 w-[240px] max-w-[240px] rounded-[3px] border border-ds-hairline border-t-2 border-t-ds-accent bg-ds-card px-[15px] py-[13px] shadow-[0_6px_22px_rgba(20,18,12,0.10)] transition-[opacity,transform] ease-out motion-reduce:translate-y-0 motion-reduce:transition-opacity ${
        balloonLeaving ? "duration-1000" : "duration-150"
      } ${
        balloonEntered ? "translate-y-0 opacity-100" : "translate-y-[3px] opacity-0"
      }`}
    >
      <button
        type="button"
        onClick={dismissBalloon}
        aria-label="Dismiss"
        className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center text-ds-ink-tertiary transition-colors hover:text-ds-ink"
      >
        <X className="h-3 w-3" />
      </button>
      <p className="pr-4 text-[13.5px] font-medium text-ds-ink">Need some help?</p>
      <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ds-ink-tertiary">
        See what this question means and how it can be answered.
      </p>
      {/* Caret on the bottom edge, sitting under the info control. */}
      <span
        aria-hidden
        className="absolute -bottom-[5px] right-[10px] h-2.5 w-2.5 rotate-45 border-b border-r border-ds-hairline bg-ds-card"
      />
    </div>
  ) : null;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange} className="mt-4">
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mb-3 rounded-ds-control border border-ds-hairline bg-ds-card p-6">
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-4 w-4 text-ds-accent" />
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ds-ink-secondary">
              About this question
            </span>
          </div>
          <div className="text-[14.5px] leading-relaxed text-ds-ink">
            {hasExplanation && renderBlock(explanation!)}
            {hasExplanation && hasHint && <div className="h-3" />}
            {hasHint && renderBlock(contextualHint!)}
          </div>
        </div>
      </CollapsibleContent>

      <div ref={rowRef} className="relative flex items-center justify-end gap-2">
        {rowStart}
        {helpBalloon}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            onMouseEnter={openBalloon}
            className={`relative inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ds-accent ${
              isDancing ? "motion-safe:animate-wiggle" : ""
            } ${
              isOpen
                ? "border-ds-ink bg-ds-ink text-ds-card"
                : "border-ds-hairline bg-ds-card text-ds-ink-secondary hover:text-ds-ink"
            }`}
            aria-label={hasHint ? "View explanation (AI hint available)" : "View explanation"}
          >
            <Info className="h-[15px] w-[15px]" />
            {hasHint && !isOpen && (
              <span
                aria-hidden
                className="pointer-events-none absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-ds-accent ring-2 ring-background"
              />
            )}
          </button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
};
