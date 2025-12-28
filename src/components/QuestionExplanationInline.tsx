import { useState } from "react";
import { Info } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface QuestionExplanationInlineProps {
  explanation: string | null;
}

export const QuestionExplanationInline = ({ explanation }: QuestionExplanationInlineProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Don't render if no explanation
  if (!explanation || explanation.trim() === "") {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mb-3 p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
            {explanation}
          </p>
        </div>
      </CollapsibleContent>
      
      <div className="flex justify-end">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-primary transition-all duration-150 hover:scale-110 p-1.5 rounded-full hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="View explanation"
          >
            <Info className="h-[18px] w-[18px]" />
          </button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
};
