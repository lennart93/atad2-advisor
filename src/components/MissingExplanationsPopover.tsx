import React from "react";
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
      // If popover is already open, clicking the trigger generates anyway
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
          <div className="space-y-3 text-sm">
            <p className="text-foreground">
              You have answered{" "}
              <span className="font-semibold text-amber-700">
                {missingCount} question{missingCount !== 1 ? "s" : ""}
              </span>{" "}
              without providing an explanation.
            </p>
            <p className="text-muted-foreground">
              Adding brief context helps the AI generate a more accurate and 
              defensible ATAD2 memorandum.
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
              Review questions
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
