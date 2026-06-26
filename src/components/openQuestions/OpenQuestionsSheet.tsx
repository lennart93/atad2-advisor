import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useResizablePanelWidth } from "@/hooks/useResizablePanelWidth";
import { OpenQuestionsPanel } from "./OpenQuestionsPanel";
import { OpenQuestionsWorklistBody } from "./OpenQuestionsWorklistBody";

/** Drag-to-resize bounds for the slide-over; width persists per browser. */
const SHEET_WIDTH = {
  storageKey: "atad2:openQuestionsSheetWidth",
  min: 360,
  max: 900,
  defaultWidth: 480,
} as const;

export interface OpenQuestionsSheetProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToQuestion?: (questionId: string) => void;
  /** Show only the points that are out with the client. */
  sentOnly?: boolean;
  /** Clears the sent-only filter (the panel's "Show all"). */
  onShowAll?: () => void;
}

/**
 * Slide-over with the open-questions register. Mounted from the assessment
 * sub-header button (T5).
 */
export function OpenQuestionsSheet({
  sessionId,
  open,
  onOpenChange,
  onGoToQuestion,
  sentOnly = false,
  onShowAll,
}: OpenQuestionsSheetProps) {
  const { width, handleProps } = useResizablePanelWidth(
    SHEET_WIDTH.storageKey,
    SHEET_WIDTH,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto"
        style={{ width, maxWidth: "95vw" }}
      >
        <SheetHeader>
          <SheetTitle className="text-[18px] font-medium text-ds-ink">
            {sentOnly ? "Points with the client" : "Open questions"}
          </SheetTitle>
          <SheetDescription className="text-[13px] text-ds-ink-secondary">
            {sentOnly
              ? "Sent to the client, waiting for an answer."
              : "Questions the documents could not answer."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {/* Sent-only (opened from the dossier card) keeps the flat register
              list; the normal view mirrors the documents step's "Points to
              confirm" so the side panel and that step are one experience. */}
          {sentOnly ? (
            <OpenQuestionsPanel
              sessionId={sessionId}
              variant="sheet"
              onGoToQuestion={onGoToQuestion}
              sentOnly={sentOnly}
              onShowAll={onShowAll}
            />
          ) : (
            <OpenQuestionsWorklistBody sessionId={sessionId} />
          )}
        </div>
        {/* Drag the left edge to resize; the chosen width is remembered. Kept
            last in the DOM so opening the sheet still focuses the panel body,
            not the handle; Escape and click-away to close are untouched. */}
        <div
          {...handleProps}
          className="group absolute inset-y-0 left-0 z-20 flex w-2 cursor-col-resize items-center justify-center focus:outline-none"
        >
          {/* The grip itself carries the focus affordance (grows + darkens)
              so keyboard users get a clear indicator without a boxy outline
              around the thin full-height strip. */}
          <span className="h-10 w-1 rounded-full bg-ds-hairline transition-all group-hover:bg-ds-ink-secondary group-focus-visible:h-16 group-focus-visible:w-1.5 group-focus-visible:bg-ds-ink" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
