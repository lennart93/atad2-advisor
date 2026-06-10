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
  /** True when an answer row exists for this question in this session. */
  onPath: boolean;
  /** The session answer for this question ('Yes' | 'No' | 'Unknown'). */
  answerForQuestion?: string;
  onGoToQuestion?: (questionId: string) => void;
}

/**
 * Per-row actions for the open-questions register. Which actions show is
 * decided by the pure visibleActionsFor rules; the mutations live in
 * useOpenQuestionActions and the register follows the answers truth for
 * on-path rows.
 */
export function OpenQuestionRowActions({
  row,
  onPath,
  answerForQuestion,
  onGoToQuestion,
}: OpenQuestionRowActionsProps) {
  const actions = useOpenQuestionActions(row.session_id);
  const visible = visibleActionsFor(row, onPath, answerForQuestion);

  const [keepDialogOpen, setKeepDialogOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const busy =
    actions.keepAsUnknown.isPending ||
    actions.dismiss.isPending ||
    actions.markSentToClient.isPending ||
    actions.saveClientAnswer.isPending;

  const showAnswerToggle = visible.clientAnswerInput || visible.editClientAnswer;
  const showGoToQuestion = visible.goToQuestion && !!onGoToQuestion;
  const hasAnyAction =
    visible.keepAsUnknown ||
    visible.notRelevant ||
    visible.markSentToClient ||
    showAnswerToggle ||
    showGoToQuestion;

  if (!hasAnyAction) return null;

  const openAnswerInput = (nextOpen: boolean) => {
    if (nextOpen) setDraft(row.client_answer ?? "");
    setAnswerOpen(nextOpen);
  };

  const saveAnswer = () => {
    actions.saveClientAnswer.mutate(
      { row, answer: draft },
      { onSuccess: () => setAnswerOpen(false) },
    );
  };

  return (
    <Collapsible open={answerOpen} onOpenChange={openAnswerInput} className="space-y-2">
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

        {showAnswerToggle && (
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              {visible.editClientAnswer
                ? "Edit client answer"
                : "What did the client say?"}
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
            onClick={() => actions.dismiss.mutate({ row })}
          >
            Not relevant
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
              onClick={() => setAnswerOpen(false)}
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
          actions.keepAsUnknown.mutate({ row, reason, onPath });
        }}
      />
    </Collapsible>
  );
}
