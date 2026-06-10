import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { OpenQuestionsPanel } from "./OpenQuestionsPanel";

export interface OpenQuestionsSheetProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToQuestion?: (questionId: string) => void;
}

/**
 * Slide-over with the open-questions register. Mounted from the assessment
 * sub-header button in a later slice; exported and ready now.
 */
export function OpenQuestionsSheet({
  sessionId,
  open,
  onOpenChange,
  onGoToQuestion,
}: OpenQuestionsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Open questions</SheetTitle>
          <SheetDescription>
            Questions the documents could not answer.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <OpenQuestionsPanel
            sessionId={sessionId}
            variant="sheet"
            onGoToQuestion={onGoToQuestion}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
