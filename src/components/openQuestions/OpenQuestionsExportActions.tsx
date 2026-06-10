import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import {
  formatOpenQuestionsText,
  rowsToExportItems,
  type OpenQuestionExportMeta,
  type RowsToExportItemsResult,
} from "@/lib/openQuestions/exportText";
import type { OpenQuestionGroups } from "@/lib/openQuestions/grouping";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";
import {
  generateOpenQuestionsDocx,
  TemplateMissingError,
} from "@/lib/openQuestions/wordExport";

export interface OpenQuestionsExportActionsProps {
  sessionId: string;
  groups: OpenQuestionGroups;
  resolveText: (row: OpenQuestionRow) => string;
}

/**
 * "Copy as text" and "Export to Word" for the open-questions panel header.
 * Both hand the same numbered list to the client; included rows that are
 * still open flip to taken_to_client ONLY after the clipboard write resolved
 * or the docx download was triggered, with one audit event per included row.
 */
export function OpenQuestionsExportActions({
  sessionId,
  groups,
  resolveText,
}: OpenQuestionsExportActionsProps) {
  const [includeLater, setIncludeLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const { recordExportSent } = useOpenQuestionActions(sessionId);

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

  const selection = rowsToExportItems(groups, resolveText, includeLater);
  const disabled = busy || selection.items.length === 0 || sessionMeta === undefined;

  const buildMeta = (): OpenQuestionExportMeta => ({
    taxpayerName: sessionMeta?.taxpayer_name || "Taxpayer",
    fiscalYear: sessionMeta?.fiscal_year || "",
    dateLong: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });

  /**
   * Post-export bookkeeping: flip + per-row audit events. The export itself
   * already succeeded at this point, so a failure here only means the rows
   * were not marked as sent.
   */
  const flipAndLog = async (
    event: "copied" | "exported",
    sel: RowsToExportItemsResult,
    failureMessage: string,
  ): Promise<boolean> => {
    try {
      await recordExportSent({
        flipRowIds: sel.flipRowIds,
        includedQuestionIds: sel.rows.map((row) => row.question_id),
        event,
        count: sel.items.length,
      });
      return true;
    } catch (e) {
      console.warn("Could not mark exported questions as sent to client:", e);
      toast.error(failureMessage);
      return false;
    }
  };

  const handleCopy = async () => {
    const sel = rowsToExportItems(groups, resolveText, includeLater);
    if (sel.items.length === 0) return;
    setBusy(true);
    try {
      const text = formatOpenQuestionsText(sel.items, buildMeta());
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Insecure context or permission denied: no flips, no logs.
        toast.error("Could not copy to the clipboard.");
        return;
      }
      const ok = await flipAndLog(
        "copied",
        sel,
        "Copied, but could not mark the questions as sent to client.",
      );
      if (ok) {
        const n = sel.items.length;
        toast.success(
          `Copied ${n} question${n === 1 ? "" : "s"} to the clipboard.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleExportWord = async () => {
    const sel = rowsToExportItems(groups, resolveText, includeLater);
    if (sel.items.length === 0) return;
    setBusy(true);
    try {
      try {
        await generateOpenQuestionsDocx({ items: sel.items, meta: buildMeta() });
      } catch (e) {
        // Soft-fail with no flips and no logs.
        if (e instanceof TemplateMissingError) {
          toast.error(
            "The Word template open_questions_list.docx is not available yet. Use Copy as text instead.",
          );
        } else {
          console.error("Word export failed:", e);
          toast.error("Could not generate the Word file.");
        }
        return;
      }
      const ok = await flipAndLog(
        "exported",
        sel,
        "Exported, but could not mark the questions as sent to client.",
      );
      if (ok) {
        const n = sel.items.length;
        toast.success(`Exported ${n} question${n === 1 ? "" : "s"} to Word.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={disabled} onClick={handleCopy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy as text
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={handleExportWord}
        >
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          Export to Word
        </Button>
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={includeLater}
          onCheckedChange={(value) => setIncludeLater(value === true)}
        />
        Include questions that may become relevant later
      </label>
    </div>
  );
}
