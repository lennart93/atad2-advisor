import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { invokePrefillFn } from "@/hooks/usePrefill";
import { runAnalyzePool } from "@/lib/openQuestions/analyzePool";
import { WORDING_PROMPT_VERSION } from "@/lib/openQuestions/letterPipeline";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

// The wording round now runs inside the letter pipeline (useLetterPipeline):
// analysis completion triggers runWordingRound before the letter is composed.
// The "Prepare client questions" panel button is gone; this file keeps the
// toast-free core plus the prompt-version gate the pipeline relies on.

/**
 * First swarm prompt version that emits the client_question field
 * (migration 20260610220100_swarm_prompt_v12_client_question.sql).
 * Under older prompts the wording round would burn tokens without producing
 * any client wording, so the letter pipeline gates on this version.
 * Single source: WORDING_PROMPT_VERSION in the pure lib.
 */
export const CLIENT_QUESTION_PROMPT_VERSION = WORDING_PROMPT_VERSION;

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
 * not the live prompt). version is null while loading, on error, or while
 * the RPC does not exist yet on the VM; null gates the action off, which is
 * exactly the honest pre-deploy behavior. Errors are caught inside queryFn
 * so a missing RPC never triggers retry storms.
 *
 * isLoading is exposed separately because the letter pipeline must WAIT for
 * this query to settle: a null during load means "not known yet", while a
 * null after settle means "skip the wording round".
 */
export function useActivePromptVersionQuery(): {
  version: number | null;
  isLoading: boolean;
} {
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
  return { version: query.data ?? null, isLoading: query.isLoading };
}

export interface PrepareClientQuestionsResult {
  /** True when there was nothing to prepare; no side effects happened. */
  aborted: boolean;
  total: number;
  failed: number;
}

/**
 * The wording round: re-runs the existing analyze_one action for every open
 * or taken-to-client register row that has no client wording yet, so the v12
 * swarm prompt fills client_question for existing dossiers.
 *
 * Modeled on useRecheckOpenQuestions but WITHOUT the client-answers document
 * upload: nothing new is added to the dossier, the analysis simply re-runs
 * against the documents as they stand. Deliberately does NOT touch
 * atad2_prefill_jobs and does NOT start the job heartbeat. The DB trigger on
 * atad2_question_prefills copies the fresh client_question into still-open
 * register rows and realtime streams it in; nothing else to wire.
 *
 * TOAST-FREE by contract: the letter pipeline calls this and decides its own
 * messaging. Per-row failures never throw, they only count into the result
 * (the letter composes those rows from the official-text fallback). Only
 * setup errors throw: the register row select, the documents bundle, and the
 * official question select.
 */
export async function runWordingRound(
  sessionId: string,
  logEvent: (questionId: string, event: string, detail?: Json) => Promise<void>,
): Promise<PrepareClientQuestionsResult> {
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
    return { aborted: true, total: 0, failed: 0 };
  }

  // 2. The existing documents bundle; no upload step (see function comment).
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
}
