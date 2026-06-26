import React from "react";
import { Button } from "@/components/ds";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FileText, Info, Pencil } from "lucide-react";

interface MissingExplanationsPopoverProps {
  missingCount: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateAnyway: () => void;
  onReviewQuestions: () => void;
  onTriggerClick?: () => void;
  children: React.ReactNode;
}

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
            <div className="p-2 bg-ds-fill-muted rounded-ds-control shrink-0">
              <Info className="h-5 w-5 text-ds-ink-secondary" />
            </div>
            <div>
              <h4 className="font-medium text-ds-ink">
                Some answers have no explanation
              </h4>
            </div>
          </div>

          {/* Body text */}
          <div className="text-[13px] text-ds-ink-secondary">
            <p>
              Some answers have no explanation. Adding context where relevant improves the memorandum.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onReviewQuestions();
                onOpenChange(false);
              }}
              className="flex-1"
            >
              <Pencil className="h-4 w-4" />
              Add context
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onGenerateAnyway();
                onOpenChange(false);
              }}
              className="flex-1"
            >
              <FileText className="h-4 w-4" />
              Generate anyway
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MissingExplanationsPopover;
