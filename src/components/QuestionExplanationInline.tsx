import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface QuestionExplanationInlineProps {
  explanation: string | null;
  contextualHint?: string | null;
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
          <span className="text-primary">•</span>
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

  if (!hasExplanation && !hasHint) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange} className="mt-4">
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mb-3 p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
          <div className="text-sm leading-relaxed text-foreground">
            {hasExplanation && renderBlock(explanation!)}
            {hasExplanation && hasHint && <div className="h-3" />}
            {hasHint && renderBlock(contextualHint!)}
          </div>
        </div>
      </CollapsibleContent>

      <div className="flex justify-end">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="relative text-muted-foreground hover:text-primary transition-all duration-150 hover:scale-110 p-1.5 rounded-full hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label={hasHint ? "View explanation (AI hint available)" : "View explanation"}
          >
            <Info
              className={`h-[18px] w-[18px] ${isDancing ? "motion-safe:animate-wiggle text-primary" : ""}`}
            />
            {hasHint && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-800 ring-2 ring-background"
              />
            )}
          </button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
};
