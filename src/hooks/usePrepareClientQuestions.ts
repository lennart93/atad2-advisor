import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { invokePrefillFn } from "@/hooks/usePrefill";
import { useOpenQuestionActions } from "@/hooks/useOpenQuestionActions";
import { runAnalyzePool } from "@/lib/openQuestions/analyzePool";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

/**
 * First swarm prompt version that emits the client_question field
 * (migration 20260610220100_swarm_prompt_v12_client_question.sql).
 * Under older prompts "Prepare client questions" would burn tokens without
 * producing any client wording, so the button gates on this version.
 */
export const CLIENT_QUESTION_PROMPT_VERSION = 12;

/** Rows the action targets: still in front of the advisor, no client wording yet. */
export function needsClientQuestion(row: OpenQuestionRow): boolean {
  return (
    (row.status === "open" || row.status === "taken_to_client") &&
    (row.client_question ?? "").trim().length === 0
  );
}

/**
 * Version of the live swarm prompt via the SECURITY DEFINER RPC
 * get_active_prompt_version (atad2_prompts SELECT is admin-only, and
 * atad2_prefill_jobs.stage2_prompt_version is the version of the LAST run,
 * not the live prompt). Returns null while loading, on error, or while the
 * RPC does not exist yet on the VM; null gates the action off, which is
 * exactly the honest pre-deploy behavior. Errors are caught inside queryFn
 * so a missing RPC never triggers retry storms.
 */
export function useActivePromptVersion(): number | null {
  const query = useQuery({
    queryKey: ["active-prompt-version", "prefill_swarm_system"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      try {
        const { data, error } = await supabase.rpc("get_active_prompt_version", {
          p_key: "prefill_swarm_system",
        });
        if (error) return null;
        return data ?? null;
      } catch {
        return null;
      }
    },
  });
  return query.data ?? null;
}

export interface PrepareClientQuestionsResult {
  /** True when there was nothing to prepare; no side effects happened. */
  aborted: boolean;
  total: number;
  failed: number;
}

/**
 * "Prepare client questions": re-runs the existing analyze_one action for
 * every open or taken-to-client register row that has no client wording yet,
 * so the v12 swarm prompt fills client_question for existing dossiers.
 *
 * Modeled on useRecheckOpenQuestions but WITHOUT the client-answers document
 * upload: nothing new is added to the dossier, the analysis simply re-runs
 * against the documents as they stand. Deliberately does NOT touch
 * atad2_prefill_jobs and does NOT start the job heartbeat. The DB trigger on
 * atad2_question_prefills copies the fresh client_question into still-open
 * register rows and realtime streams it in; nothing else to wire.
 */
export function usePrepareClientQuestions(sessionId: string | null) {
  const qc = useQueryClient();
  const { logEvent } = useOpenQuestionActions(sessionId);

  return useMutation({
    mutationFn: async (): Promise<PrepareClientQuestionsResult> => {
      if (!sessionId) throw new Error("No session id");

      // 1. Fresh register rows, not the cached panel view.
      const { data: rows, error: rowsErr } = await supabase
        .from("atad2_open_questions")
        .select("*")
        .eq("session_id", sessionId);
      if (rowsErr) throw rowsErr;
      const targets = ((rows ?? []) as OpenQuestionRow[]).filter(
        needsClientQuestion,
      );
      if (targets.length === 0) {
        toast.error("All open questions already have client wording.");
        return { aborted: true, total: 0, failed: 0 };
      }

      // 2. The existing documents bundle; no upload step (see hook comment).
      const bundle = await buildDocumentsBlock(sessionId);

      // 3. Official question text and explanation for the target ids only
      //    (atad2_questions holds one row per answer option, dedupe by id).
      const targetIds = targets.map((row) => row.question_id);
      const { data: rawQuestions, error: qErr } = await supabase
        .from("atad2_questions")
        .select("question_id, question, question_explanation")
        .in("question_id", targetIds);
      if (qErr) throw qErr;
      const officialById = new Map<
        string,
        { question: string; question_explanation: string | null }
      >();
      for (const q of rawQuestions ?? []) {
        if (!officialById.has(q.question_id)) officialById.set(q.question_id, q);
      }

      // 4. analyze_one per target through the shared worker pool. The event
      //    reuses the LIVE 'recheck_started' vocabulary; the detail says why.
      const failures: string[] = [];
      await runAnalyzePool(targets, async (row) => {
        try {
          const official = officialById.get(row.question_id);
          if (!official) {
            failures.push(`${row.question_id}: official question text not found`);
            return;
          }
          await logEvent(row.question_id, "recheck_started", {
            reason: "prepare_client_questions",
          });
          await invokePrefillFn({
            action: "analyze_one",
            session_id: sessionId,
            question_id: row.question_id,
            question_text: official.question,
            question_explanation: official.question_explanation ?? "",
            documents_block: bundle.textBlock,
            image_refs: bundle.imageRefs,
            pdf_refs: bundle.pdfRefs,
            taxpayer_name: bundle.taxpayerName,
            fiscal_year: bundle.fiscalYear,
          });
        } catch (e) {
          failures.push(`${row.question_id}: ${(e as Error).message}`);
        }
      });

      return { aborted: false, total: targets.length, failed: failures.length };
    },
    onSuccess: (result) => {
      if (result.aborted) return;
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
      qc.invalidateQueries({ queryKey: ["open-questions", sessionId] });
      qc.invalidateQueries({ queryKey: ["suggested-answer-map", sessionId] });
      const plural = result.total === 1 ? "" : "s";
      if (result.failed > 0) {
        toast.error(
          `Prepared client questions for ${result.total - result.failed} of ${result.total} question${plural}.`,
        );
      } else {
        toast.success(
          `Prepared client questions for ${result.total} question${plural}.`,
        );
      }
    },
    onError: (e: Error) => {
      toast.error("Could not prepare client questions", {
        description: e.message,
      });
    },
  });
}
