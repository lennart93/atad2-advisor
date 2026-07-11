import type { ReactNode } from "react";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ds";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useOpenQuestionsView } from "@/hooks/useOpenQuestions";
import { useRecheckOpenQuestions } from "@/hooks/useRecheckOpenQuestions";
import { dismissedGateHint } from "@/lib/openQuestions/grouping";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";
import { OpenQuestionRowActions } from "./OpenQuestionRowActions";
import { OpenQuestionRowCard } from "./OpenQuestionRowCard";

// The analysis page renders the composed client letter instead of a list,
// so the panel only knows page and sheet.
export type OpenQuestionsPanelVariant = "page" | "sheet";

export interface OpenQuestionsPanelProps {
  sessionId: string;
  variant: OpenQuestionsPanelVariant;
  /** Deep link into the questions flow; "Go to question" hides when absent. */
  onGoToQuestion?: (questionId: string) => void;
  /** Show only the points that are out with the client. */
  sentOnly?: boolean;
  /** Clears the sent-only filter ("Show all"). */
  onShowAll?: () => void;
}

/**
 * Grouped view over the open-questions register with per-row actions.
 */
export function OpenQuestionsPanel({
  sessionId,
  variant,
  onGoToQuestion,
  sentOnly = false,
  onShowAll,
}: OpenQuestionsPanelProps) {
  const view = useOpenQuestionsView(sessionId);
  const { groups, answerMap, projectedIds, resolveText, isLoading } = view;

  const renderRows = (rows: OpenQuestionRow[]) =>
    rows.map((row) => {
      const onProjectedPath = projectedIds.has(row.question_id);
      const answerForQuestion = answerMap.get(row.question_id);
      return (
        <OpenQuestionRowCard
          key={row.id}
          row={row}
          questionText={resolveText(row)}
          gateHint={dismissedGateHint(row, onProjectedPath, answerForQuestion)}
          actions={
            <OpenQuestionRowActions
              row={row}
              onProjectedPath={onProjectedPath}
              answerForQuestion={answerForQuestion}
              onGoToQuestion={onGoToQuestion}
            />
          }
        />
      );
    });

  if (isLoading) {
    return (
      <p role="status" className="py-6 text-[13px] text-ds-ink-secondary">Loading open questions...</p>
    );
  }

  // Sent-only mode (opened from the dossier card): one flat list of the
  // points that are out with the client, with a way back to the full view.
  if (sentOnly) {
    const sentRows = view.rows.filter((row) => row.status === "taken_to_client");
    return (
      <div className={variant === "sheet" ? "space-y-4" : "space-y-6"}>
        {sentRows.length > 0 ? (
          renderRows(sentRows)
        ) : (
          <p className="py-6 text-[13px] text-ds-ink-secondary">
            Nothing is with the client right now.
          </p>
        )}
        {onShowAll && (
          <Button variant="ghost" size="sm" onClick={onShowAll}>
            Show all open questions
          </Button>
        )}
      </div>
    );
  }

  const isEmpty =
    groups.needsAttention.length === 0 &&
    groups.active.length === 0 &&
    groups.later.length === 0 &&
    groups.history.length === 0;

  const compact = variant === "sheet";
  const sectionGap = compact ? "space-y-2" : "space-y-3";
  const panelGap = compact ? "space-y-4" : "space-y-6";

  if (isEmpty) {
    return (
      <div className={panelGap}>
        {variant === "page" && <PageHeading />}
        <p className="py-6 text-[13px] text-ds-ink-secondary">
          No open questions for this assessment.
        </p>
      </div>
    );
  }

  return (
    <div className={panelGap}>
      {variant === "page" && <PageHeading />}

      {/* Answering-only header: exporting and letter composition live on the
          analysis page, so the panel keeps just the re-check action. */}
      <div className="flex justify-end">
        <RecheckWithAiButton sessionId={sessionId} rows={view.rows} />
      </div>

      {groups.needsAttention.length > 0 && (
        <section className={sectionGap}>
          <h3 className="text-[13px] font-normal text-ds-ink">
            Needs attention ({groups.needsAttention.length})
          </h3>
          {renderRows(groups.needsAttention)}
        </section>
      )}

      <section className={sectionGap}>
        <h3 className="text-[13px] font-normal text-ds-ink">
          Open questions ({groups.active.length})
        </h3>
        {groups.active.length > 0 ? (
          renderRows(groups.active)
        ) : (
          <p className="text-[13px] text-ds-ink-secondary">
            Nothing open on the current question path.
          </p>
        )}
      </section>

      {/* The quiet reveal-all toggle: the default view is filtered to the
          projected path; this collapsed section holds everything else. */}
      <CollapsedSection
        title={`Not expected on the current path (${groups.later.length})`}
        explainer="These questions are not reachable given the recorded answers and AI suggestions. Nothing here is deleted."
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

/**
 * "Re-check with AI" for the panel header (page and sheet variants). Enabled
 * once at least one client answer is saved; the heavy lifting lives in
 * useRecheckOpenQuestions.
 */
function RecheckWithAiButton({
  sessionId,
  rows,
}: {
  sessionId: string;
  rows: OpenQuestionRow[];
}) {
  const recheck = useRecheckOpenQuestions(sessionId);
  const hasClientAnswers = rows.some(
    (row) => (row.client_answer ?? "").trim().length > 0,
  );

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={!hasClientAnswers || recheck.isPending}
        onClick={() => recheck.mutate()}
      >
        {recheck.isPending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Sparkles />
        )}
        {recheck.isPending ? "Re-checking..." : "Re-check with AI"}
      </Button>
      {!hasClientAnswers && (
        <p className="text-[13px] text-ds-ink-secondary">
          Save at least one client answer first.
        </p>
      )}
    </div>
  );
}

function PageHeading() {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-normal tracking-tight text-ds-ink">
        Open questions
      </h2>
      <p className="text-[13px] text-ds-ink-secondary">
        Questions the documents could not answer. Take them to the client or
        confirm them as unknown.
      </p>
    </div>
  );
}

function CollapsedSection({
  title,
  explainer,
  rows,
  renderRows,
  gapClass,
}: {
  title: string;
  /** Optional muted line shown above the rows when the section is open. */
  explainer?: string;
  rows: OpenQuestionRow[];
  renderRows: (rows: OpenQuestionRow[]) => ReactNode;
  gapClass: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[13px] font-normal text-ds-ink-secondary transition-colors hover:text-ds-ink">
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className={`pt-3 ${gapClass}`}>
          {explainer && (
            <p className="text-[13px] text-ds-ink-secondary">{explainer}</p>
          )}
          {renderRows(rows)}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
