import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionPrefill } from "@/lib/prefill/types";
import { useUpdatePrefillAction } from "@/hooks/usePrefill";

interface Props {
  prefill: QuestionPrefill;
  currentToelichting: string;
  onCommit: (newValue: string) => void;
  onDismissToAdditionalContext?: (text: string) => void;
}

export function SuggestionCard({ prefill, currentToelichting, onCommit, onDismissToAdditionalContext }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(prefill.suggested_toelichting);
  const updateAction = useUpdatePrefillAction();

  if (prefill.user_action === "dismissed" || prefill.user_action === "moved_to_additional_context") {
    return null;
  }

  const appendToCurrent = (text: string) =>
    currentToelichting.trim().length === 0 ? text : `${currentToelichting}\n\n${text}`;

  const accept = () => {
    onCommit(appendToCurrent(prefill.suggested_toelichting));
    updateAction.mutate({ prefillId: prefill.id, action: "accepted" });
  };

  const commitEdit = () => {
    onCommit(appendToCurrent(draft));
    updateAction.mutate({ prefillId: prefill.id, action: "edited" });
    setEditMode(false);
  };

  const dismiss = (moveToAdditional: boolean) => {
    if (moveToAdditional && onDismissToAdditionalContext) {
      onDismissToAdditionalContext(prefill.suggested_toelichting);
      updateAction.mutate({ prefillId: prefill.id, action: "moved_to_additional_context" });
    } else {
      updateAction.mutate({ prefillId: prefill.id, action: "dismissed" });
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5 mb-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Suggested context from your documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!editMode ? (
          <p>{prefill.suggested_toelichting}</p>
        ) : (
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
        )}

        <div className="text-xs text-muted-foreground">
          From: {prefill.source_refs.map((r, i) => (
            <span key={i}>{i > 0 ? "; " : ""}{r.doc_label} {r.location}</span>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          {!editMode ? (
            <>
              <Button size="sm" onClick={accept}>Accept</Button>
              <Button size="sm" variant="outline" onClick={() => { setDraft(prefill.suggested_toelichting); setEditMode(true); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => dismiss(false)}>Dismiss</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={commitEdit}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
