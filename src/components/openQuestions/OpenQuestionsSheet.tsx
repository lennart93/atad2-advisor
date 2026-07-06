import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ds";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DocumentsWorklist } from "@/hooks/useDocumentsWorklist";
import { useResizablePanelWidth } from "@/hooks/useResizablePanelWidth";
import { OpenQuestionsPanel } from "./OpenQuestionsPanel";
import { OpenQuestionsWorklistBody } from "./OpenQuestionsWorklistBody";

/** Drag-to-resize bounds for the slide-over; width persists per browser. */
const SHEET_WIDTH = {
  storageKey: "atad2:openQuestionsSheetWidth",
  min: 360,
  max: 900,
  defaultWidth: 760,
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
  /** The shared worklist instance from the sub-header chip, so the chip count
   *  and this drawer's list are always the same computation (see the body). */
  worklist: DocumentsWorklist;
}

/**
 * Slide-over with the open-questions register. Mounted from the assessment
 * sub-header button (T5).
 *
 * The default (non-sent) view is the same "Points to confirm" body the
 * documents step shows, given the editorial drawer treatment: a paper panel
 * with a neutral hairline edge, a fixed header, a scrolling body and a fixed
 * footer whose height never changes, so the side panel and that step read as
 * one experience.
 */
export function OpenQuestionsSheet({
  sessionId,
  open,
  onOpenChange,
  onGoToQuestion,
  sentOnly = false,
  onShowAll,
  worklist,
}: OpenQuestionsSheetProps) {
  const { width, handleProps } = useResizablePanelWidth(
    SHEET_WIDTH.storageKey,
    SHEET_WIDTH,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        hideClose
        className="flex flex-col gap-0 bg-ds-card p-0"
        style={{ width, maxWidth: "95vw" }}
      >
        {/* Fixed header: title, one muted line, and an outline close button. */}
        <SheetHeader className="shrink-0 space-y-1.5 border-b border-ds-hairline px-8 py-6 text-left">
          <div className="flex items-start justify-between gap-4">
            <SheetTitle className="text-2xl font-normal tracking-tight text-ds-ink">
              {sentOnly ? "Points with the client" : "Open questions"}
            </SheetTitle>
            <SheetClose className="-mr-1 -mt-1 inline-flex shrink-0 items-center justify-center rounded-ds-control border border-ds-hairline p-2 text-ds-ink-secondary transition-colors hover:bg-ds-fill-muted hover:text-ds-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>
          <SheetDescription className="text-[13px] text-ds-ink-secondary">
            {sentOnly
              ? "Sent to the client, waiting for an answer."
              : "The documents couldn't answer these. Answer them here, or come back later, your progress is saved."}
          </SheetDescription>
        </SheetHeader>

        {/* Scrolling body. Sent-only (opened from the dossier card) keeps the
            flat register list; the normal view mirrors the documents step's
            "Points to confirm" so the side panel and that step are one
            experience. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {sentOnly ? (
            <OpenQuestionsPanel
              sessionId={sessionId}
              variant="sheet"
              onGoToQuestion={onGoToQuestion}
              sentOnly={sentOnly}
              onShowAll={onShowAll}
            />
          ) : (
            <OpenQuestionsWorklistBody sessionId={sessionId} worklist={worklist} />
          )}
        </div>

        {/* Fixed footer: reassurance on the left, the brand Continue button on
            the right, on one row so the bar never changes height. Continue
            simply dismisses the drawer back to the questionnaire. */}
        {!sentOnly && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-ds-hairline px-8 py-4">
            <span className="text-[13px] text-ds-ink-secondary">
              You can come back to open points later.
            </span>
            <Button
              variant="primary"
              className="shrink-0"
              onClick={() => onOpenChange(false)}
            >
              Continue to questionnaire
              <ArrowRight className="text-brand-terracotta" />
            </Button>
          </div>
        )}

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
