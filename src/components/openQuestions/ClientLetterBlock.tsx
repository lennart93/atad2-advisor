import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import {
  flipIdsForLetter,
  formatComposedLetterText,
  letterLeadIn,
  type ComposedLetter,
} from "@/lib/openQuestions/composeLetter";
import { formatAsOfLine } from "@/lib/openQuestions/letterStore";
import type { OpenQuestionExportMeta } from "@/lib/openQuestions/exportText";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

export interface ClientLetterBlockProps {
  sessionId: string;
  letter: ComposedLetter;
  /** ISO timestamp of the shown letter; drives the "as of" line. */
  composedAt: string;
  /** Snapshot of the rows the letter was composed from; flips resolve here. */
  sentRows: OpenQuestionRow[];
  /** True while a compose call runs; replaces the preview with a spinner. */
  busy: boolean;
  onRegenerate: (includedQuestionIds: string[]) => void;
  sessionMeta:
    | { taxpayer_name: string | null; fiscal_year: string | null }
    | null
    | undefined;
}

/**
 * The composed client letter as a fixed page block: the end picture of the
 * letter-first analysis page. Same preview as the former compose dialog:
 * the merged "We understand that:" facts plus the numbered questions, each
 * with an include checkbox. Unticking renumbers immediately and changes the
 * letter only; the row stays on the worklist. "Copy letter" copies the plain
 * text and only then flips the included still-open rows to taken_to_client
 * with one 'copied' audit event per question (detail { composed: true,
 * question_ids }). The block stays on screen after copying.
 */
export function ClientLetterBlock({
  sessionId,
  letter,
  composedAt,
  sentRows,
  busy,
  onRegenerate,
  sessionMeta,
}: ClientLetterBlockProps) {
  const [includedIds, setIncludedIds] = useState<Set<string>>(
    () => new Set(letter.questions.map((q) => q.question_id)),
  );
  const [copying, setCopying] = useState(false);

  const { recordExportSent } = useOpenQuestionActions(sessionId);

  // Re-seed the include toggles whenever a fresh letter arrives (the server
  // coverage guard guarantees the letter holds exactly the input ids).
  useEffect(() => {
    setIncludedIds(new Set(letter.questions.map((q) => q.question_id)));
  }, [letter]);

  const buildMeta = (): OpenQuestionExportMeta => ({
    taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
    fiscalYear: sessionMeta?.fiscal_year || "",
    dateLong: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });

  const toggleIncluded = (questionId: string, checked: boolean) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  };

  const includedCount = letter.questions.filter((q) =>
    includedIds.has(q.question_id),
  ).length;

  const handleCopyLetter = async () => {
    if (includedCount === 0) return;
    setCopying(true);
    try {
      const text = formatComposedLetterText(letter, includedIds, buildMeta());
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Insecure context or permission denied: no flips, no logs.
        toast.error("Could not copy to the clipboard.");
        return;
      }
      try {
        await recordExportSent({
          flipRowIds: flipIdsForLetter(sentRows, includedIds),
          includedQuestionIds: [...includedIds],
          event: "copied",
          count: includedCount,
          detail: { composed: true, question_ids: [...includedIds] },
        });
      } catch (e) {
        console.warn("Could not mark composed questions as sent to client:", e);
        toast.error("Copied, but could not mark the questions as sent to client.");
        return;
      }
      toast.success("Copied the client letter to the clipboard.");
    } finally {
      setCopying(false);
    }
  };

  const actionsDisabled = busy || copying || includedCount === 0;

  let runningNumber = 0;

  return (
    <div className="space-y-2">
      <Card className="space-y-4 p-5">
        {busy ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Composing the letter...
          </p>
        ) : (
          <div className="space-y-4">
            {letter.understandings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  We understand that:
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  {letter.understandings.map((entry, index) => (
                    <li key={index}>{entry}</li>
                  ))}
                </ul>
              </div>
            )}
            {letterLeadIn(letter.questions, includedIds) !== null && (
              <p className="text-sm text-foreground">
                Could you please confirm:
              </p>
            )}
            <div className="space-y-2">
              {letter.questions.map((question) => {
                const included = includedIds.has(question.question_id);
                const number = included ? ++runningNumber : null;
                return (
                  <label
                    key={question.question_id}
                    className="flex cursor-pointer items-start gap-2.5"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={included}
                      onCheckedChange={(value) =>
                        toggleIncluded(question.question_id, value === true)
                      }
                    />
                    <span
                      className={
                        included
                          ? "text-sm text-foreground"
                          : "text-sm text-muted-foreground line-through"
                      }
                    >
                      {number !== null && (
                        <span className="font-medium">{number}. </span>
                      )}
                      {question.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={actionsDisabled}
            onClick={() => onRegenerate([...includedIds])}
          >
            Regenerate
          </Button>
          <Button
            disabled={actionsDisabled || sessionMeta === undefined}
            onClick={handleCopyLetter}
          >
            {copying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Copy letter
          </Button>
        </div>
      </Card>
      <p className="px-1 text-xs text-muted-foreground">
        {formatAsOfLine(composedAt)}
      </p>
    </div>
  );
}
