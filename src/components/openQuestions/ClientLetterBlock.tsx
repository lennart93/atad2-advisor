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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import {
  flipIdsForLetter,
  nextAddedQuestionIds,
} from "@/lib/openQuestions/composeLetter";
import {
  allQuestionKeys,
  coveredQuestionIds,
  formatComposedLetterText,
  letterGroupViews,
  letterLeadIn,
  questionKey,
  type ComposedLetter,
  type LetterTable,
} from "@/lib/openQuestions/letterShape";
import type { OpenQuestionExportMeta } from "@/lib/openQuestions/exportText";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

export interface ClientLetterBlockProps {
  sessionId: string;
  letter: ComposedLetter;
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
 * letter-first analysis page. A short prose intro, then the thematic groups
 * ("A. Title" headers) with their questions numbered continuously across
 * groups, each with an include checkbox. One letter question can COVER
 * several register questions (question_ids is the merge mapping); unticking
 * it excludes all of them. Unticking renumbers immediately and changes the
 * letter only; the rows stay on the worklist. A question with a per-entity
 * grid renders it as a table under the text. "Copy letter" copies the plain
 * text and only then flips the covered still-open rows to taken_to_client
 * with one 'copied' audit event per covered register question (detail
 * { composed: true, question_ids, merged }). The block stays on screen after
 * copying.
 *
 * Below the questions, a collapsed "Optional extra questions" section offers
 * the off-path open rows. Ticking one only STAGES it; staged
 * questions enter the letter (and the copy text) exclusively through the
 * next Regenerate, which weaves them into a fitting group like any other
 * question.
 */
export function ClientLetterBlock({
  sessionId,
  letter,
  sentRows,
  addedQuestionIds,
  candidateRows,
  resolveText,
  busy,
  onRegenerate,
  sessionMeta,
}: ClientLetterBlockProps) {
  const [includedKeys, setIncludedKeys] = useState<Set<string>>(
    () => new Set(allQuestionKeys(letter)),
  );
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);

  const { recordExportSent } = useOpenQuestionActions(sessionId);

  // Re-seed the include toggles whenever a fresh letter arrives (the server
  // coverage guard guarantees the letter covers exactly the input ids), and
  // clear the staging: a fresh letter already contains what was staged.
  useEffect(() => {
    setIncludedKeys(new Set(allQuestionKeys(letter)));
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

  const toggleIncluded = (key: string, checked: boolean) => {
    setIncludedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
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

  // Flattened letter questions in group order; the render views and the
  // covered-id math both derive from this one letter.
  const groupViews = letterGroupViews(letter, includedKeys);
  const includedCount = groupViews.reduce(
    (count, group) =>
      count + group.questions.filter((question) => question.included).length,
    0,
  );

  // Staged ids restricted to the rows still offered as candidates, so a
  // staged question answered in the meantime never counts or regenerates.
  const stagedQuestionIds = candidateRows
    .filter((row) => stagedIds.has(row.question_id))
    .map((row) => row.question_id);

  const handleCopyLetter = async () => {
    if (includedCount === 0) return;
    setCopying(true);
    try {
      const text = formatComposedLetterText(letter, includedKeys, buildMeta());
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Insecure context or permission denied: no flips, no logs.
        toast.error("Could not copy to the clipboard.");
        return;
      }
      try {
        // Covered = the union of question_ids over the included letter
        // questions: one 'copied' event per covered register question, the
        // same in-list + status-open flip guard as before, and the merge
        // mapping rides along in the detail.
        const includedQuestions = letter.groups
          .flatMap((group) => group.questions)
          .filter((question) => includedKeys.has(questionKey(question)));
        const covered = coveredQuestionIds(letter, includedKeys);
        await recordExportSent({
          flipRowIds: flipIdsForLetter(sentRows, new Set(covered)),
          includedQuestionIds: covered,
          event: "copied",
          count: includedCount,
          detail: {
            composed: true,
            question_ids: covered,
            merged: includedQuestions.map((question) => question.question_ids),
          },
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

  const intro = letter.intro.trim();

  return (
    <Card className="space-y-4 p-5">
      {busy ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Composing the letter...
        </p>
      ) : (
        <div className="space-y-4">
          {intro.length > 0 && (
            <p className="whitespace-pre-line text-sm text-foreground">
              {letter.intro}
            </p>
          )}
          {letterLeadIn(letter, includedKeys) !== null && (
            <p className="text-sm text-foreground">
              Could you please confirm:
            </p>
          )}
          <div className="space-y-3">
            {groupViews.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-2">
                {group.label !== null && group.title !== "" && (
                  <p className="text-sm font-medium text-foreground">
                    {group.label}. {group.title}
                  </p>
                )}
                {group.questions.map((question) => (
                  <div key={question.key} className="space-y-1.5">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox
                        className="mt-0.5"
                        checked={question.included}
                        onCheckedChange={(value) =>
                          toggleIncluded(question.key, value === true)
                        }
                      />
                      <span
                        className={
                          question.included
                            ? "text-sm text-foreground"
                            : "text-sm text-muted-foreground line-through"
                        }
                      >
                        {question.number !== null && (
                          <span className="font-medium">
                            {question.number}.{" "}
                          </span>
                        )}
                        {question.text}
                      </span>
                    </label>
                    {question.table !== null && (
                      <QuestionTable
                        table={question.table}
                        included={question.included}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {candidateRows.length > 0 && (
            <Collapsible className="border-t pt-3">
              <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                Optional extra questions ({candidateRows.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground">
                    These questions fall outside the currently expected path of
                    the questionnaire. Tick any you want and use Regenerate to
                    weave them into the letter.
                  </p>
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
          onClick={() => {
            // Covered register ids of the still-ticked letter questions:
            // an added id stays only while the merged question covering it
            // is still ticked.
            const covered = coveredQuestionIds(letter, includedKeys);
            onRegenerate(
              covered,
              nextAddedQuestionIds(
                addedQuestionIds,
                new Set(covered),
                stagedQuestionIds,
              ),
            );
          }}
        >
          Regenerate
        </Button>
        <Button
          disabled={copyDisabled || sessionMeta === undefined}
          onClick={handleCopyLetter}
        >
          {copying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Copy letter ({includedCount}{" "}
          {includedCount === 1 ? "question" : "questions"})
        </Button>
      </div>
    </Card>
  );
}

/**
 * The per-entity grid under a question (one row per entity). When the
 * question is excluded the whole table dims, deliberately without
 * strikethrough across the cells.
 */
function QuestionTable({
  table,
  included,
}: {
  table: LetterTable;
  included: boolean;
}) {
  return (
    <div
      className={
        included ? "pl-7" : "pl-7 text-muted-foreground opacity-60"
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            {table.columns.map((column, columnIndex) => (
              <TableHead key={columnIndex}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
