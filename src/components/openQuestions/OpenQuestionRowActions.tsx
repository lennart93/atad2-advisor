import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import { visibleActionsFor } from "@/lib/openQuestions/grouping";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";
import { KeepAsUnknownDialog } from "./KeepAsUnknownDialog";

export interface OpenQuestionRowActionsProps {
  row: OpenQuestionRow;
  /** True when the question is reachable on the projected questionnaire path. */
  onProjectedPath: boolean;
  /** The session answer for this question ('Yes' | 'No' | 'Unknown'). */
  answerForQuestion?: string;
  onGoToQuestion?: (questionId: string) => void;
}

/**
 * Per-row actions for the open-questions register. Which actions show is
 * decided by the pure visibleActionsFor rules; the mutations live in
 * useOpenQuestionActions. Keep-as-unknown routes on answer-row presence
 * (answers stay the truth for answered questions); dismissing is register
 * only and never moves the final-memo gate.
 */
export function OpenQuestionRowActions({
  row,
  onProjectedPath,
  answerForQuestion,
  onGoToQuestion,
}: OpenQuestionRowActionsProps) {
  const actions = useOpenQuestionActions(row.session_id);
  const visible = visibleActionsFor(row, onProjectedPath, answerForQuestion);
  const hasAnswerRow = answerForQuestion !== undefined;

  const [keepDialogOpen, setKeepDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const busy =
    actions.keepAsUnknown.isPending ||
    actions.dismiss.isPending ||
    actions.undismiss.isPending ||
    actions.markSentToClient.isPending ||
    actions.saveClientAnswer.isPending;

  const showGoToQuestion = visible.goToQuestion && !!onGoToQuestion;
  const hasAnyAction =
    visible.keepAsUnknown ||
    visible.notRelevant ||
    visible.markSentToClient ||
    visible.clientAnswerInput ||
    visible.editClientAnswer ||
    visible.restore ||
    showGoToQuestion;

  if (!hasAnyAction) return null;

  const openEditInput = (nextOpen: boolean) => {
    if (nextOpen) setDraft(row.client_answer ?? "");
    setEditOpen(nextOpen);
  };

  const saveAnswer = () => {
    actions.saveClientAnswer.mutate(
      { row, answer: draft },
      {
        onSuccess: () => {
          setDraft("");
          setEditOpen(false);
        },
      },
    );
  };

  return (
    <Collapsible open={editOpen} onOpenChange={openEditInput} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {visible.markSentToClient && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => actions.markSentToClient.mutate({ row })}
          >
            Mark as sent to client
          </Button>
        )}

        {visible.editClientAnswer && (
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              Edit client answer
            </Button>
          </CollapsibleTrigger>
        )}

        {visible.keepAsUnknown && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setKeepDialogOpen(true)}
          >
            Keep as unknown
          </Button>
        )}

        {visible.notRelevant && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              actions.dismiss.mutate({
                row,
                gateStillOpen:
                  onProjectedPath &&
                  answerForQuestion !== "Yes" &&
                  answerForQuestion !== "No",
              })
            }
          >
            Not relevant
          </Button>
        )}

        {visible.restore && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => actions.undismiss.mutate({ row })}
          >
            Restore
          </Button>
        )}

        {showGoToQuestion && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onGoToQuestion?.(row.question_id)}
          >
            Go to question
          </Button>
        )}
      </div>

      {/* Inline answer field for rows still in play: always visible so the
          worklist invites typing the client's answer directly. */}
      {visible.clientAnswerInput && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type the client's answer..."
          />
          <Button
            size="sm"
            disabled={busy || draft.trim().length === 0}
            onClick={saveAnswer}
          >
            Save
          </Button>
        </div>
      )}

      {/* Collapsible editor for the saved answer of an answered row. */}
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="space-y-2 pt-1">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What the client told you, in your own words."
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy || draft.trim().length === 0}
              onClick={saveAnswer}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </CollapsibleContent>

      <KeepAsUnknownDialog
        open={keepDialogOpen}
        onOpenChange={setKeepDialogOpen}
        onConfirm={(reason) => {
          setKeepDialogOpen(false);
          actions.keepAsUnknown.mutate({ row, reason, onPath: hasAnswerRow });
        }}
      />
    </Collapsible>
  );
}
