import React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ds";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, Pencil } from "lucide-react";

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
      {/* Modal moment: a light ink wash dims the page behind the popover.
          pointer-events-none so outside clicks still reach (and close) it. */}
      {isOpen &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-40 bg-ds-fill-muted"
          />,
          document.body,
        )}
      <PopoverContent
        className="relative w-[392px] overflow-visible rounded-[10px] border-ds-hairline bg-ds-card p-[22px] pb-[18px] shadow-[0_22px_48px_-18px_rgba(20,18,10,0.30),0_6px_16px_-8px_rgba(20,18,10,0.14)]"
        side="top"
        align="start"
        sideOffset={12}
      >
        {/* Down-arrow toward the Generate button */}
        <span
          aria-hidden
          className="absolute -bottom-[7px] left-[44px] block h-[13px] w-[13px] rotate-45 border-b border-r border-ds-hairline bg-ds-card"
        />

        <div className="flex items-center gap-[13px]">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-ds-accent-bg text-ds-accent">
            <AlertTriangle className="h-[17px] w-[17px]" strokeWidth={1.7} aria-hidden />
          </span>
          <h4 className="text-[16px] font-medium leading-[1.2] tracking-[-0.015em] text-ds-ink">
            <span className="text-ds-accent">
              {missingCount === 1 ? "1 answer" : `${missingCount} answers`}
            </span>{" "}
            {missingCount === 1 ? "has" : "have"} no context
          </h4>
        </div>

        <p className="mb-[18px] mt-[13px] text-[13.5px] leading-[1.55] text-ds-ink-secondary [text-wrap:pretty]">
          A short note on why each answer was chosen makes the memorandum
          easier to review. Add them now, or generate as it stands.
        </p>

        <div className="flex gap-[9px]">
          <Button
            variant="primary"
            onClick={() => {
              onReviewQuestions();
              onOpenChange(false);
            }}
            className="h-auto flex-1 rounded-[7px] px-3.5 py-[11px] text-[13.5px] font-medium [&_svg]:size-[15px]"
          >
            <Pencil />
            Add context
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onGenerateAnyway();
              onOpenChange(false);
            }}
            className="h-auto flex-1 rounded-[7px] px-3.5 py-[11px] text-[13.5px] font-medium text-ds-ink-secondary"
          >
            Generate anyway
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MissingExplanationsPopover;
