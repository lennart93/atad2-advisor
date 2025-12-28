import { useState } from "react";
import { Info, ChevronDown } from "lucide-react";
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
      <div className="flex justify-end">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-150 px-3 py-1.5 rounded-lg hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <span>Meer info</span>
            <Info className="h-4 w-4" />
            <ChevronDown 
              className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} 
            />
          </button>
        </CollapsibleTrigger>
      </div>
      
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="mt-3 p-4 bg-blue-50/50 border border-blue-100 rounded-lg">
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
            {explanation}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
