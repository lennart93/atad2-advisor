import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionPrefill } from "@/lib/prefill/types";
import { useUpdatePrefillAction } from "@/hooks/usePrefill";
import { combineExplanation } from "@/lib/prefill/combine";

interface Props {
  prefill: QuestionPrefill;
  // The user's portion of the explanation (textarea content sans AI text).
  // Used to recombine when the user accepts, edits, or removes the AI block.
  userNotes: string;
  onCommit: (combinedExplanation: string) => void;
  onDismissToAdditionalContext?: (text: string) => void;
}

const isCommittedAction = (action: QuestionPrefill["user_action"]) =>
  action === "accepted" || action === "edited";

const isHiddenAction = (action: QuestionPrefill["user_action"]) =>
  action === "dismissed" || action === "moved_to_additional_context";

export function SuggestionCard({
  prefill,
  userNotes,
  onCommit,
  onDismissToAdditionalContext,
}: Props) {
  const suggested = prefill.suggested_toelichting ?? "";
  const persistedCommitted = prefill.committed_text ?? (isCommittedAction(prefill.user_action) ? suggested : "");

  // Optimistic state: render the locked block immediately on Accept/Edit
  // without waiting for the prefill round trip to land via react-query.
  const [justCommitted, setJustCommitted] = useState<{ text: string } | null>(null);
  const [localHidden, setLocalHidden] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(persistedCommitted || suggested);
  const updateAction = useUpdatePrefillAction();

  // When the prefill changes (new question), clear local optimistic + edit state.
  useEffect(() => {
    setJustCommitted(null);
    setLocalHidden(false);
    setEditMode(false);
    setDraft(persistedCommitted || suggested);
  }, [prefill.id, persistedCommitted, suggested]);

  if (localHidden || isHiddenAction(prefill.user_action)) return null;

  // Once the user has accepted/edited the AI suggestion, the card disappears.
  // The committed text lives in the explanation Textarea below, where the
  // user can keep editing it inline like any other explanation.
  const showLockedBlock = !!justCommitted || isCommittedAction(prefill.user_action);
  if (showLockedBlock) return null;

  if (!suggested.trim()) return null;

  // -- Pending: original Accept / Edit / Dismiss card -----------------------
  const accept = () => {
    const text = suggested.trim();
    if (!text) return;
    onCommit(combineExplanation(text, userNotes));
    setJustCommitted({ text });
    updateAction.mutate({
      prefillId: prefill.id,
      action: "accepted",
      committedText: text,
    });
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onCommit(combineExplanation(trimmed, userNotes));
    setJustCommitted({ text: trimmed });
    updateAction.mutate({
      prefillId: prefill.id,
      action: "edited",
      committedText: trimmed,
    });
    setEditMode(false);
  };

  const dismiss = (moveToAdditional: boolean) => {
    if (moveToAdditional && onDismissToAdditionalContext) {
      onDismissToAdditionalContext(suggested);
      updateAction.mutate({
        prefillId: prefill.id,
        action: "moved_to_additional_context",
        committedText: null,
      });
    } else {
      updateAction.mutate({
        prefillId: prefill.id,
        action: "dismissed",
        committedText: null,
      });
    }
    setLocalHidden(true);
  };

  return (
    <div className="border-l-2 border-primary/40 bg-primary/5 pl-4 py-3 my-2 text-sm leading-relaxed space-y-2">
      {!editMode ? (
        <p className="whitespace-pre-wrap">{suggested}</p>
      ) : (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="bg-background"
        />
      )}

      <div className="flex gap-2.5 pt-1">
        {!editMode ? (
          <>
            <Button size="sm" onClick={accept} className="transition-all duration-fast">Accept</Button>
            <Button
              size="sm"
              variant="outline"
              className="transition-all duration-fast"
              onClick={() => {
                setDraft(suggested);
                setEditMode(true);
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="transition-all duration-fast" onClick={() => dismiss(false)}>Dismiss</Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={commitEdit} className="transition-all duration-fast">Save</Button>
            <Button size="sm" variant="ghost" className="transition-all duration-fast" onClick={() => setEditMode(false)}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
