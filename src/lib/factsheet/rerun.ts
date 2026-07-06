// Progressive swarm re-run driver. Re-fires prefill-documents (analyze_one) for
// a selected set of question ids WITH the factsheet block attached, reusing the
// exact same documents bundle the original swarm used. Background quality pass:
// every call is failure-tolerant and the whole run never throws to the UI.
//
// Re-run safety is enforced server-side too (analyze.ts only overwrites rows
// whose user_action is 'pending'), but the selection (rerunSelection.ts) already
// filters to pending + weak rows, so this only re-touches what it should.

import { supabase } from "@/integrations/supabase/client";
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
import { invokePrefillFn } from "@/hooks/usePrefill";
import { buildFactsheetBlock } from "./buildFactsheetBlock";
import type { Factsheet } from "./schema";

export interface RerunProgress {
  done: number;
  total: number;
}

/**
 * Re-analyse the given question ids with the factsheet block. Returns when all
 * fan-out calls have settled. onProgress ticks after each node so the caller can
 * render a quiet "Re-assessing with the dossier overview… 12/18" indicator.
 */
export async function runFactsheetRerun(
  sessionId: string,
  factsheet: Factsheet,
  factsheetVersion: number,
  questionIds: string[],
  onProgress?: (p: RerunProgress) => void,
): Promise<{ ok: number; failed: number }> {
  if (questionIds.length === 0) return { ok: 0, failed: 0 };

  const factsheetBlock = buildFactsheetBlock(factsheet);
  if (!factsheetBlock) return { ok: 0, failed: 0 };

  const { textBlock, imageRefs, pdfRefs, taxpayerName, fiscalYear } = await buildDocumentsBlock(sessionId);
  if (!textBlock && imageRefs.length === 0 && pdfRefs.length === 0) return { ok: 0, failed: 0 };

  // Question text/explanation for the selected ids (distinct by question_id).
  const { data: rawQuestions } = await supabase
    .from("atad2_questions")
    .select("question_id, question, question_explanation");
  const byId = new Map<string, { question: string; question_explanation: string | null }>();
  for (const q of rawQuestions ?? []) {
    if (!byId.has(q.question_id)) byId.set(q.question_id, { question: q.question, question_explanation: q.question_explanation });
  }

  const targets = questionIds.filter((id) => byId.has(id));
  let done = 0;
  let ok = 0;
  let failed = 0;
  const total = targets.length;
  onProgress?.({ done, total });

  // Same concurrency posture as the primary swarm: much lower when raw PDFs are
  // in play (each call ships the PDF base64).
  const CONCURRENCY = pdfRefs.length > 0 ? 4 : 8;
  const queue = [...targets];
  const work = async (questionId: string) => {
    const q = byId.get(questionId)!;
    try {
      await invokePrefillFn({
        action: "analyze_one",
        session_id: sessionId,
        question_id: questionId,
        question_text: q.question,
        question_explanation: q.question_explanation ?? "",
        documents_block: textBlock,
        image_refs: imageRefs,
        pdf_refs: pdfRefs,
        taxpayer_name: taxpayerName,
        fiscal_year: fiscalYear,
        factsheet_block: factsheetBlock,
        factsheet_version: factsheetVersion,
      });
      ok++;
    } catch (e) {
      failed++;
      console.warn("[factsheet-rerun] node failed", questionId, (e as Error).message);
    } finally {
      done++;
      onProgress?.({ done, total });
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (id) await work(id);
      }
    })());
  }
  await Promise.allSettled(workers);
  return { ok, failed };
}
