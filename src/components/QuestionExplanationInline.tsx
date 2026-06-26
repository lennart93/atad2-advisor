import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
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
}

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
}: QuestionExplanationInlineProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDancing, setIsDancing] = useState(false);
  const dancedForHintRef = useRef<string | null>(null);

  const hasExplanation = !!explanation && explanation.trim() !== "";
  const hasHint = !!contextualHint && contextualHint.trim() !== "";

  useEffect(() => {
    if (!hasHint) return;
    if (dancedForHintRef.current === contextualHint) return;
    if (isOpen) {
      dancedForHintRef.current = contextualHint!;
      return;
    }

    const startId = window.setTimeout(() => {
      setIsDancing(true);
      dancedForHintRef.current = contextualHint!;
    }, 3000);

    return () => window.clearTimeout(startId);
  }, [contextualHint, hasHint, isOpen]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) setIsDancing(false);
  };

  const hasInfo = hasExplanation || hasHint;

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

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange} className="mt-4">
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mb-3 p-4 bg-ds-fill-muted border border-ds-hairline rounded-ds-control">
          <div className="text-[13px] leading-relaxed text-ds-ink">
            {hasExplanation && renderBlock(explanation!)}
            {hasExplanation && hasHint && <div className="h-3" />}
            {hasHint && renderBlock(contextualHint!)}
          </div>
        </div>
      </CollapsibleContent>

      <div className="flex items-center justify-end gap-2">
        {rowStart}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="relative text-ds-ink-secondary hover:text-ds-ink transition-all duration-150 hover:scale-110 p-1.5 rounded-full hover:bg-ds-fill-muted focus:outline-none focus:ring-2 focus:ring-ds-accent"
            aria-label={hasHint ? "View explanation (AI hint available)" : "View explanation"}
          >
            <Info
              className={`h-[18px] w-[18px] ${isDancing ? "motion-safe:animate-wiggle text-ds-ink" : ""}`}
            />
            {hasHint && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-ds-red ring-2 ring-background"
              />
            )}
          </button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
};
