import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface QuestionExplanationTooltipProps {
  explanation: string | null;
}

export const QuestionExplanationTooltip = ({ explanation }: QuestionExplanationTooltipProps) => {
  // Don't render if no explanation
  if (!explanation || explanation.trim() === "") {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-primary transition-all duration-150 hover:scale-110 cursor-pointer p-1 rounded-full hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1"
            aria-label="View explanation"
          >
            <Info className="h-[18px] w-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-[300px] p-4 bg-popover border border-border shadow-lg rounded-xl animate-in fade-in-0 zoom-in-95"
          side="left"
          sideOffset={8}
        >
          <p className="text-sm leading-relaxed text-popover-foreground whitespace-pre-line">
            {explanation}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
