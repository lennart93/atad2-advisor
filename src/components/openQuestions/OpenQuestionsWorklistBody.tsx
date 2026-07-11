import { Loader2 } from "lucide-react";
import { Button } from "@/components/ds";
import { WorklistPointsList } from "@/components/documents/WorklistPointsList";
import type { DocumentsWorklist } from "@/hooks/useDocumentsWorklist";
import { useOpenQuestionsView } from "@/hooks/useOpenQuestions";

export interface OpenQuestionsWorklistBodyProps {
  sessionId: string;
  /**
   * The SAME worklist instance the sub-header chip counts from. The chip and
   * this list must be one computation in one phase: two separate
   * useDocumentsWorklist instances hold their own letter/phase state and can
   * disagree (chip says "1", the list has nothing), which is exactly the
   * mismatch this panel exists to avoid. So the owner (the chip) creates the
   * instance and hands it down here.
   */
  worklist: DocumentsWorklist;
}

/**
 * The questionnaire's "Open questions" side panel, rendered as the SAME merged
 * "Points to confirm" list the documents step shows: just the client-ready
 * questions with a free-text note each, no per-row "keep as unknown / not
 * relevant / sent to client" actions. So the side panel and the points step
 * stay one experience.
 */
export function OpenQuestionsWorklistBody({
  sessionId,
  worklist,
}: OpenQuestionsWorklistBodyProps) {
  const view = useOpenQuestionsView(sessionId);

  if (worklist.phase === "error") {
    return (
      <div className="space-y-3 py-2">
        <p className="text-[13px] font-normal text-ds-ink">
          The points couldn't be prepared.
        </p>
        {worklist.composeError?.message && (
          <p className="text-[13px] text-ds-ink-secondary">
            {worklist.composeError.message}
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={worklist.recompose}>
          Try again
        </Button>
      </div>
    );
  }

  // No register rows at all (e.g. an assessment with no document analysis):
  // show the empty state straight away instead of a spinner that never settles.
  if (
    worklist.phase === "empty" ||
    (!view.isLoading && view.rows.length === 0)
  ) {
    return (
      <p className="py-6 text-[13px] text-ds-ink-secondary">
        No open questions for this assessment.
      </p>
    );
  }

  if (worklist.phase === "loading" || worklist.phase === "composing") {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-[13px] text-ds-ink-secondary">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin text-ds-ink-secondary" />
        Preparing the points...
      </p>
    );
  }

  // The side panel reads "answered" (not "confirmed") to match the drawer copy.
  return <WorklistPointsList worklist={worklist} confirmVerb="answered" />;
}
