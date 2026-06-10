import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { invokePrefillFn, useUploadText } from "@/hooks/usePrefill";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import { useQuestionTexts } from "@/hooks/useOpenQuestions";
import { resolveClientQuestion } from "@/lib/openQuestions/grouping";
import {
  buildClientResponsesDocument,
  type ClientResponseEntry,
} from "@/lib/openQuestions/exportText";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

/**
 * Targeted re-check, not a swarm run: a handful of analyze_one calls is far
 * cheaper than the full swarm, and the per-call payload is identical, so the
 * full-swarm CPU ceiling (12) does not apply. Fixed at the PDF-safe cap.
 */
const RECHECK_CONCURRENCY = 4;

/** Same query as useQuestionTexts, for when its cache has not filled yet. */
async function fetchQuestionTextMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("atad2_questions")
    .select("question_id, question");
  if (error) throw error;
  const byId = new Map<string, string>();
  for (const row of data ?? []) {
    if (!byId.has(row.question_id)) byId.set(row.question_id, row.question);
  }
  return byId;
}

export interface RecheckResult {
  /** True when there was nothing to re-check; no side effects happened. */
  aborted: boolean;
  total: number;
  failed: number;
}

/**
 * "Re-check with AI": bundles every saved client answer into ONE plain-text
 * session document, uploads it through the existing text path, then re-runs
 * the existing analyze_one action for each affected question so the swarm
 * suggestions absorb the client's responses.
 *
 * Deliberately does NOT touch atad2_prefill_jobs and does NOT start the job
 * heartbeat: this is a targeted re-check, not a swarm run, so AnalyzeProgress
 * and the dossier status logic must not react to it. Reopen flags and
 * register updates land via the DB trigger on atad2_question_prefills and
 * stream in through the existing realtime channel; nothing else to wire.
 */
export function useRecheckOpenQuestions(sessionId: string | null) {
  const qc = useQueryClient();
  const uploadText = useUploadText(sessionId);
  const { logEvent } = useOpenQuestionActions(sessionId);
  const textsQuery = useQuestionTexts();

  return useMutation({
    mutationFn: async (): Promise<RecheckResult> => {
      if (!sessionId) throw new Error("No session id");

      // 1. Fresh register rows; every row with a saved client answer counts
      //    (status 'answered' or edited later), not the cached panel view.
      const { data: rows, error: rowsErr } = await supabase
        .from("atad2_open_questions")
        .select("*")
        .eq("session_id", sessionId);
      if (rowsErr) throw rowsErr;
      const answeredRows = ((rows ?? []) as OpenQuestionRow[]).filter(
        (row) => (row.client_answer ?? "").trim().length > 0,
      );
      if (answeredRows.length === 0) {
        toast.error("No client answers to re-check yet.");
        return { aborted: true, total: 0, failed: 0 };
      }

      const texts =
        textsQuery.data ??
        (await qc.ensureQueryData({
          queryKey: ["atad2-question-texts"],
          queryFn: fetchQuestionTextMap,
        }));
      const entries: ClientResponseEntry[] = answeredRows.map((row) => ({
        questionId: row.question_id,
        question: resolveClientQuestion(row, texts),
        clientAnswer: (row.client_answer ?? "").trim(),
      }));

      // 2. One document with all client responses.
      const dateLong = new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const text = buildClientResponsesDocument(entries, dateLong);

      // 3. Upload through the existing text path. The category MUST be
      //    'other': the CHECK constraint on atad2_session_documents does not
      //    include client_correspondence, and a new category needs a
      //    migration. The doc_label carries the meaning instead.
      await uploadText.mutateAsync({
        text,
        category: "other",
        label: `Client responses ${format(new Date(), "d MMM yyyy")}`,
      });

      // 4. Rebuild the documents bundle AFTER the upload so the new document
      //    is part of the prompt the re-check runs against.
      const bundle = await buildDocumentsBlock(sessionId);

      // 5. Official question text and explanation for the affected ids only
      //    (atad2_questions holds one row per answer option, dedupe by id).
      const affectedIds = entries.map((entry) => entry.questionId);
      const { data: rawQuestions, error: qErr } = await supabase
        .from("atad2_questions")
        .select("question_id, question, question_explanation")
        .in("question_id", affectedIds);
      if (qErr) throw qErr;
      const officialById = new Map<
        string,
        { question: string; question_explanation: string | null }
      >();
      for (const q of rawQuestions ?? []) {
        if (!officialById.has(q.question_id)) officialById.set(q.question_id, q);
      }

      // 6. analyze_one per affected question through a small worker pool.
      //    NO atad2_prefill_jobs write, NO heartbeat (see hook comment).
      const failures: string[] = [];
      const queue = [...entries];
      const work = async (entry: ClientResponseEntry) => {
        const official = officialById.get(entry.questionId);
        try {
          await logEvent(entry.questionId, "recheck_started");
          await invokePrefillFn({
            action: "analyze_one",
            session_id: sessionId,
            question_id: entry.questionId,
            question_text: official?.question ?? entry.question,
            question_explanation: official?.question_explanation ?? "",
            documents_block: bundle.textBlock,
            image_refs: bundle.imageRefs,
            pdf_refs: bundle.pdfRefs,
            taxpayer_name: bundle.taxpayerName,
            fiscal_year: bundle.fiscalYear,
          });
        } catch (e) {
          failures.push(`${entry.questionId}: ${(e as Error).message}`);
        }
      };
      const workers: Promise<void>[] = [];
      for (let i = 0; i < Math.min(RECHECK_CONCURRENCY, queue.length); i++) {
        workers.push(
          (async () => {
            while (queue.length > 0) {
              const next = queue.shift();
              if (next) await work(next);
            }
          })(),
        );
      }
      await Promise.allSettled(workers);

      return { aborted: false, total: entries.length, failed: failures.length };
    },
    onSuccess: (result) => {
      if (result.aborted) return;
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
      qc.invalidateQueries({ queryKey: ["open-questions", sessionId] });
      if (result.failed > 0) {
        toast.error(
          `Re-check failed for ${result.failed} of ${result.total} question${result.total === 1 ? "" : "s"}.`,
        );
      } else {
        toast.success(
          `Re-check finished for ${result.total} question${result.total === 1 ? "" : "s"}.`,
        );
      }
    },
    onError: (e: Error) => {
      toast.error("Re-check could not run", { description: e.message });
    },
  });
}
