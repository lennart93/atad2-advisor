import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ComposeNotDeployedError,
  useComposeClientLetter,
} from "@/hooks/useComposeClientLetter";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import {
  buildComposeItems,
  flipIdsForLetter,
  formatComposedLetterText,
  selectComposeRows,
  type ComposedLetter,
} from "@/lib/openQuestions/composeLetter";
import type { OpenQuestionExportMeta } from "@/lib/openQuestions/exportText";
import type { OpenQuestionGroups } from "@/lib/openQuestions/grouping";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

export interface ComposeClientLetterDialogProps {
  sessionId: string;
  groups: OpenQuestionGroups;
  resolveText: (row: OpenQuestionRow) => string;
}

/**
 * "Compose client letter": one Claude call merges the per-question drafts
 * into a single letter (shared facts stated once, numbered asks without the
 * repeated context). The preview offers letter-only include toggles and a
 * Regenerate; "Copy letter" copies the plain text and only then flips the
 * included still-open rows to taken_to_client with one 'copied' audit event
 * per question (detail { composed: true, question_ids }). While the edge
 * action is not deployed the button soft-fails with a single toast.
 */
export function ComposeClientLetterDialog({
  sessionId,
  groups,
  resolveText,
}: ComposeClientLetterDialogProps) {
  const [open, setOpen] = useState(false);
  /** Snapshot of the rows actually sent, so flips resolve against what was composed. */
  const [sentRows, setSentRows] = useState<OpenQuestionRow[]>([]);
  const [letter, setLetter] = useState<ComposedLetter | null>(null);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);

  const compose = useComposeClientLetter(sessionId);
  const { recordExportSent } = useOpenQuestionActions(sessionId);

  // Same queryKey as OpenQuestionsExportActions so the cache is shared.
  const { data: sessionMeta } = useQuery({
    queryKey: ["open-questions-session-meta", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("taxpayer_name, fiscal_year")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const buildMeta = (): OpenQuestionExportMeta => ({
    taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
    fiscalYear: sessionMeta?.fiscal_year || "",
    dateLong: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });

  const handleComposeSuccess = (composed: ComposedLetter) => {
    setLetter(composed);
    // The server coverage guard guarantees the letter holds exactly the input
    // ids, so resetting to the letter's own ids is safe for first runs too.
    setIncludedIds(new Set(composed.questions.map((q) => q.question_id)));
  };

  const handleComposeError = (e: Error) => {
    if (e instanceof ComposeNotDeployedError) {
      toast.error("Letter composition is not deployed yet.");
      setOpen(false);
      return;
    }
    // Keep the dialog open so Regenerate can retry.
    toast.error("Could not compose the letter", { description: e.message });
  };

  const handleOpen = () => {
    const rows = selectComposeRows(groups);
    if (rows.length === 0) return;
    setSentRows(rows);
    setIncludedIds(new Set(rows.map((row) => row.question_id)));
    setLetter(null);
    setOpen(true);
    compose.mutate(
      {
        items: buildComposeItems(rows, resolveText),
        taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
        fiscalYear: sessionMeta?.fiscal_year || "",
      },
      { onSuccess: handleComposeSuccess, onError: handleComposeError },
    );
  };

  const handleRegenerate = () => {
    const rows = sentRows.filter((row) => includedIds.has(row.question_id));
    if (rows.length === 0) return;
    setLetter(null);
    compose.mutate(
      {
        items: buildComposeItems(rows, resolveText),
        taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
        fiscalYear: sessionMeta?.fiscal_year || "",
      },
      { onSuccess: handleComposeSuccess, onError: handleComposeError },
    );
  };

  const toggleIncluded = (questionId: string, checked: boolean) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  };

  const includedCount = letter
    ? letter.questions.filter((q) => includedIds.has(q.question_id)).length
    : includedIds.size;

  const handleCopyLetter = async () => {
    if (!letter || includedCount === 0) return;
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
      setOpen(false);
    } finally {
      setCopying(false);
    }
  };

  const buttonDisabled =
    selectComposeRows(groups).length === 0 || sessionMeta === undefined;
  const actionsDisabled = compose.isPending || copying || includedCount === 0;

  let runningNumber = 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={buttonDisabled}
        onClick={handleOpen}
      >
        <Mail className="mr-1.5 h-3.5 w-3.5" />
        Compose client letter
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Client letter</DialogTitle>
            <DialogDescription>
              One letter that merges the shared context and asks each question
              once. Unticking a question changes the letter only; it stays on
              the worklist.
            </DialogDescription>
          </DialogHeader>

          {compose.isPending && (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Composing the letter...
            </p>
          )}

          {/* Radix viewports ignore max-h on the root, so cap the viewport too. */}
          {!compose.isPending && letter && (
            <ScrollArea className="max-h-[55vh] [&>[data-radix-scroll-area-viewport]]:max-h-[55vh]">
              <div className="space-y-4 pr-3">
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
            </ScrollArea>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={actionsDisabled}
              onClick={handleRegenerate}
            >
              Regenerate
            </Button>
            <Button
              disabled={actionsDisabled || !letter}
              onClick={handleCopyLetter}
            >
              {copying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Copy letter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
