import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionPrefill } from "@/lib/prefill/types";
import { useUpdatePrefillAction } from "@/hooks/usePrefill";

interface Props {
  prefill: QuestionPrefill;
  currentToelichting: string;
  onCommit: (newValue: string) => void;
  onDismissToAdditionalContext?: (text: string) => void;
}

const MAX_RATIONALE_INLINE = 140;

export function SuggestionCard({
  prefill,
  currentToelichting,
  onCommit,
  onDismissToAdditionalContext,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(prefill.suggested_toelichting);
  const [showFullRationale, setShowFullRationale] = useState(false);
  const [dismissedLocally, setDismissedLocally] = useState(false);
  const updateAction = useUpdatePrefillAction();

  if (
    dismissedLocally ||
    prefill.user_action === "accepted" ||
    prefill.user_action === "edited" ||
    prefill.user_action === "dismissed" ||
    prefill.user_action === "moved_to_additional_context"
  ) {
    return null;
  }

  const appendToCurrent = (text: string) =>
    currentToelichting.trim().length === 0 ? text : `${currentToelichting}\n\n${text}`;

  const accept = () => {
    onCommit(appendToCurrent(prefill.suggested_toelichting));
    updateAction.mutate({ prefillId: prefill.id, action: "accepted" });
    setDismissedLocally(true);
  };

  const commitEdit = () => {
    onCommit(appendToCurrent(draft));
    updateAction.mutate({ prefillId: prefill.id, action: "edited" });
    setEditMode(false);
    setDismissedLocally(true);
  };

  const dismiss = (moveToAdditional: boolean) => {
    if (moveToAdditional && onDismissToAdditionalContext) {
      onDismissToAdditionalContext(prefill.suggested_toelichting);
      updateAction.mutate({ prefillId: prefill.id, action: "moved_to_additional_context" });
    } else {
      updateAction.mutate({ prefillId: prefill.id, action: "dismissed" });
    }
    setDismissedLocally(true);
  };

  const labels = (prefill.source_refs ?? []).map((r) => r.doc_label).filter(Boolean);
  const headerLabels =
    labels.length === 0
      ? ""
      : labels.length <= 2
        ? labels.join(", ")
        : `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more`;

  const rationale = prefill.answer_rationale ?? "";
  const rationaleNeedsToggle = rationale.length > MAX_RATIONALE_INLINE;
  const rationaleVisible = rationaleNeedsToggle && !showFullRationale
    ? `${rationale.slice(0, MAX_RATIONALE_INLINE).trimEnd()}…`
    : rationale;

  return (
    <div className="border-l-2 border-primary/40 bg-primary/5 pl-3 py-2 my-2 text-sm space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        AI suggestion{headerLabels ? ` · ${headerLabels}` : ""}
      </div>

      {rationale && (
        <div className="text-xs text-muted-foreground italic">
          {rationaleVisible}
          {rationaleNeedsToggle && (
            <button
              type="button"
              className="ml-1 underline underline-offset-2 hover:text-foreground"
              onClick={() => setShowFullRationale((v) => !v)}
            >
              {showFullRationale ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {!editMode ? (
        <p className="whitespace-pre-wrap">{prefill.suggested_toelichting}</p>
      ) : (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="bg-background"
        />
      )}

      <div className="flex gap-2 pt-1">
        {!editMode ? (
          <>
            <Button size="sm" onClick={accept}>Accept</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(prefill.suggested_toelichting);
                setEditMode(true);
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss(false)}>Dismiss</Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={commitEdit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
