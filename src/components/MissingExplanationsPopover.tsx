import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, FileText, Pencil } from "lucide-react";

interface MissingExplanationsPopoverProps {
  missingCount: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateAnyway: () => void;
  onReviewQuestions: () => void;
  onTriggerClick?: () => void;
  children: React.ReactNode;
}

const explanationVariants = [
  {
    line1: "That's okay - not every question asks for one.",
    line2: "However, adding context where possible helps improve the memorandum.",
  },
  {
    line1: "To keep things fast, we don't always ask for extra input.",
    line2: "However, adding context where you can will make the memo stronger.",
  },
  {
    line1: "Not required - but adding context can improve the memorandum.",
    line2: null,
  },
  {
    line1: "This is optional. Extra context (where relevant) helps generate a stronger memo.",
    line2: null,
  },
  {
    line1: "We keep the flow fast, so explanations aren't always requested.",
    line2: "Adding context where you can will improve the memo.",
  },
];

const MissingExplanationsPopover: React.FC<MissingExplanationsPopoverProps> = ({
  missingCount,
  isOpen,
  onOpenChange,
  onGenerateAnyway,
  onReviewQuestions,
  onTriggerClick,
  children,
}) => {
  const handleTriggerClick = () => {
    if (isOpen && onTriggerClick) {
      onTriggerClick();
      onOpenChange(false);
    }
  };

  const variant = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * explanationVariants.length);
    return explanationVariants[randomIndex];
  }, [isOpen]);

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild onClick={handleTriggerClick}>
        {children}
      </PopoverTrigger>
      <PopoverContent 
        className="w-[420px] p-5" 
        side="top" 
        align="start"
        sideOffset={8}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-lg shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground">
                Some answers have no explanation
              </h4>
            </div>
          </div>

          {/* Body text */}
          <div className="text-sm text-muted-foreground">
            <p>
              {variant.line1}
              {variant.line2 && <> {variant.line2}</>}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onReviewQuestions();
                onOpenChange(false);
              }}
              className="flex-1"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Add context
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onGenerateAnyway();
                onOpenChange(false);
              }}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate anyway
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MissingExplanationsPopover;
