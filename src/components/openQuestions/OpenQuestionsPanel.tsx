import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useOpenQuestionsView } from "@/hooks/useOpenQuestions";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";
import { OpenQuestionRowCard } from "./OpenQuestionRowCard";

export type OpenQuestionsPanelVariant = "page" | "sheet" | "stream";

export interface OpenQuestionsPanelProps {
  sessionId: string;
  variant: OpenQuestionsPanelVariant;
  /** Wired to the row actions in a later slice; unused while read-only. */
  onGoToQuestion?: (questionId: string) => void;
}

/**
 * Grouped view over the open-questions register. Read-only for now: the
 * per-row actions slot stays empty until the actions slice lands.
 */
export function OpenQuestionsPanel({
  sessionId,
  variant,
  onGoToQuestion: _onGoToQuestion,
}: OpenQuestionsPanelProps) {
  const view = useOpenQuestionsView(sessionId);
  const { groups, answerMap, resolveText, isLoading } = view;

  const renderRows = (rows: OpenQuestionRow[]) =>
    rows.map((row) => (
      <OpenQuestionRowCard
        key={row.id}
        row={row}
        questionText={resolveText(row)}
        onPath={answerMap.has(row.question_id)}
      />
    ));

  if (isLoading) {
    return (
      <p className="py-6 text-sm text-muted-foreground">Loading open questions...</p>
    );
  }

  const isEmpty =
    groups.needsAttention.length === 0 &&
    groups.active.length === 0 &&
    groups.later.length === 0 &&
    groups.history.length === 0;

  // Stream variant: bare live rows only, no headers or collapsibles. The
  // full streaming treatment arrives with the sub-header button slice.
  if (variant === "stream") {
    const streamRows = [...groups.needsAttention, ...groups.active, ...groups.later];
    if (streamRows.length === 0) return null;
    return <div className="space-y-2">{renderRows(streamRows)}</div>;
  }

  const compact = variant === "sheet";
  const sectionGap = compact ? "space-y-2" : "space-y-3";
  const panelGap = compact ? "space-y-4" : "space-y-6";

  if (isEmpty) {
    return (
      <div className={panelGap}>
        {variant === "page" && <PageHeading />}
        <p className="py-6 text-sm text-muted-foreground">
          No open questions for this assessment.
        </p>
      </div>
    );
  }

  return (
    <div className={panelGap}>
      {variant === "page" && <PageHeading />}

      {groups.needsAttention.length > 0 && (
        <section className={sectionGap}>
          <h3 className="text-sm font-semibold text-foreground">
            Needs attention ({groups.needsAttention.length})
          </h3>
          {renderRows(groups.needsAttention)}
        </section>
      )}

      <section className={sectionGap}>
        <h3 className="text-sm font-semibold text-foreground">
          Open questions ({groups.active.length})
        </h3>
        {groups.active.length > 0 ? (
          renderRows(groups.active)
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing open on the current question path.
          </p>
        )}
      </section>

      <CollapsedSection
        title={`May become relevant later (${groups.later.length})`}
        rows={groups.later}
        renderRows={renderRows}
        gapClass={sectionGap}
      />

      <CollapsedSection
        title={`History (${groups.history.length})`}
        rows={groups.history}
        renderRows={renderRows}
        gapClass={sectionGap}
      />
    </div>
  );
}

function PageHeading() {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        Open questions
      </h2>
      <p className="text-sm text-muted-foreground">
        Questions the documents could not answer. Take them to the client or
        confirm them as unknown.
      </p>
    </div>
  );
}

function CollapsedSection({
  title,
  rows,
  renderRows,
  gapClass,
}: {
  title: string;
  rows: OpenQuestionRow[];
  renderRows: (rows: OpenQuestionRow[]) => ReactNode;
  gapClass: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className={`pt-3 ${gapClass}`}>{renderRows(rows)}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
