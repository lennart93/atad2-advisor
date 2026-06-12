import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/sonner";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import {
  flipIdsForLetter,
  formatComposedLetterText,
  letterLeadIn,
  nextAddedQuestionIds,
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
  /** Off-path question ids already woven into the shown letter. */
  addedQuestionIds: string[];
  /** Off-path open rows not in the letter yet: the add candidates. */
  candidateRows: OpenQuestionRow[];
  /** Display text for a candidate row (client wording fallback chain). */
  resolveText: (row: OpenQuestionRow) => string;
  /** True while a compose call runs; replaces the preview with a spinner. */
  busy: boolean;
  onRegenerate: (
    includedQuestionIds: string[],
    addedQuestionIds: string[],
  ) => void;
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
 *
 * Below the questions, a collapsed "Add questions outside the expected path"
 * section offers the off-path open rows. Ticking one only STAGES it; staged
 * questions enter the letter (and the copy text) exclusively through the
 * next Regenerate, which weaves them in like any other question.
 */
export function ClientLetterBlock({
  sessionId,
  letter,
  composedAt,
  sentRows,
  addedQuestionIds,
  candidateRows,
  resolveText,
  busy,
  onRegenerate,
  sessionMeta,
}: ClientLetterBlockProps) {
  const [includedIds, setIncludedIds] = useState<Set<string>>(
    () => new Set(letter.questions.map((q) => q.question_id)),
  );
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);

  const { recordExportSent } = useOpenQuestionActions(sessionId);

  // Re-seed the include toggles whenever a fresh letter arrives (the server
  // coverage guard guarantees the letter holds exactly the input ids), and
  // clear the staging: a fresh letter already contains what was staged.
  useEffect(() => {
    setIncludedIds(new Set(letter.questions.map((q) => q.question_id)));
    setStagedIds(new Set());
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

  const toggleStaged = (questionId: string, checked: boolean) => {
    setStagedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  };

  const includedCount = letter.questions.filter((q) =>
    includedIds.has(q.question_id),
  ).length;

  // Staged ids restricted to the rows still offered as candidates, so a
  // staged question answered in the meantime never counts or regenerates.
  const stagedQuestionIds = candidateRows
    .filter((row) => stagedIds.has(row.question_id))
    .map((row) => row.question_id);

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

  const copyDisabled = busy || copying || includedCount === 0;
  // Regenerate also works from staged additions alone, e.g. after the
  // advisor unticked every composed question but added an off-path one.
  const regenerateDisabled =
    busy || copying || (includedCount === 0 && stagedQuestionIds.length === 0);

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
            {candidateRows.length > 0 && (
              <Collapsible className="border-t pt-3">
                <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                  Add questions outside the expected path ({candidateRows.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                  <div className="space-y-2 pt-2">
                    {candidateRows.map((row) => (
                      <label
                        key={row.question_id}
                        className="flex cursor-pointer items-start gap-2.5"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={stagedIds.has(row.question_id)}
                          onCheckedChange={(value) =>
                            toggleStaged(row.question_id, value === true)
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          {resolveText(row)}
                        </span>
                      </label>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {!busy && stagedQuestionIds.length > 0 && (
            <p className="mr-auto text-xs text-muted-foreground">
              {stagedQuestionIds.length === 1
                ? "1 added question; Regenerate to weave it into the letter."
                : `${stagedQuestionIds.length} added questions; Regenerate to weave them into the letter.`}
            </p>
          )}
          <Button
            variant="outline"
            disabled={regenerateDisabled}
            onClick={() =>
              onRegenerate(
                [...includedIds],
                nextAddedQuestionIds(
                  addedQuestionIds,
                  includedIds,
                  stagedQuestionIds,
                ),
              )
            }
          >
            Regenerate
          </Button>
          <Button
            disabled={copyDisabled || sessionMeta === undefined}
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
