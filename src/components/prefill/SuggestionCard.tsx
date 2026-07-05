import { useEffect, useState } from "react";
import { Lightbulb, Check } from "lucide-react";
import { Button } from "@/components/ds";
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
    <div className="my-2 rounded-ds-control border border-ds-hairline bg-secondary p-6">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 shrink-0 text-ds-accent" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ds-ink-secondary">
          Suggested explanation
        </span>
        {typeof prefill.confidence_pct === "number" && (
          <span className="ml-auto text-[13px] text-ds-green-text ds-tabular-nums">
            {prefill.confidence_pct}% confidence
          </span>
        )}
      </div>

      {!editMode ? (
        <p className="mt-3 whitespace-pre-wrap text-[14.5px] leading-relaxed text-ds-ink">
          {suggested}
        </p>
      ) : (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="mt-3 bg-ds-card"
        />
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-ds-hairline pt-4">
        {!editMode ? (
          <>
            <Button size="sm" onClick={accept} className="transition-all duration-fast">
              <Check />
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-ds-ink-secondary transition-all duration-fast hover:text-ds-ink"
              onClick={() => {
                setDraft(suggested);
                setEditMode(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-ds-ink-secondary transition-all duration-fast hover:text-ds-ink"
              onClick={() => dismiss(false)}
            >
              Dismiss
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={commitEdit} className="transition-all duration-fast">Save</Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-ds-ink-secondary transition-all duration-fast hover:text-ds-ink"
              onClick={() => setEditMode(false)}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
