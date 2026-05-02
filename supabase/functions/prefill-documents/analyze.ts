import type { SupabaseClient } from "supabase";
import { loadActivePrompt, renderTemplate, type PromptKey } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { SwarmPrefill, type SwarmPrefillType } from "./schemas.ts";

const CONCURRENCY = 12;

interface QuestionRow {
  question_id: string;
  question: string;
  question_explanation: string | null;
}

interface DocRow {
  id: string;
  doc_label: string;
  category: string;
  storage_path: string;
  mime_type: string;
  relevance_note: string | null;
}

const BAD_LEAD_INS = [
  "based on", "according to", "from the document", "from the documents",
  "the document concern", "the documents concern",
  "the document suggests", "the documents suggest", "the document indicates", "the documents indicate",
  "the document shows", "the documents show", "the document states", "the documents state",
  "the financial statements", "the local file", "the master file", "the tax return",
  "the trial balance", "the general ledger", "the previous", "the linklaters memorandum",
  "the memorandum", "the memo", "the advisory letter", "the analysis",
  "it appears that", "it seems that",
  "the uploaded", "in the attached", "the attached",
  "as set out in", "as described in", "as documented in",
  "op basis van", "volgens het document", "het document suggereert",
  "uit het document blijkt", "blijkens het document",
];

const FORBIDDEN_ANYWHERE = [
  "the memorandum", "the memo ", "the advisory letter",
  "in the document", "in the documents",
  "as analysed in", "as analyzed in", "as discussed in", "as set out in", "as documented in",
  "the local file ", "the master file ", "the financial statement",
  "the trial balance ", "the previous atad2",
];

export async function runAnalyze(
  serviceClient: SupabaseClient,
  sessionId: string,
): Promise<{ ok: boolean; error?: string; prefill_count?: number }> {
  const started = Date.now();

  // Atomic claim of the prefill_jobs row.
  const { error: jobInsertErr } = await serviceClient
    .from("atad2_prefill_jobs")
    .insert({
      session_id: sessionId,
      status: "stage2_running",
      started_at: new Date().toISOString(),
      stage1_finished_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    });
  if (jobInsertErr && !`${jobInsertErr.message}`.toLowerCase().includes("duplicate")) {
    return { ok: false, error: jobInsertErr.message };
  }

  try {
    // Load docs.
    const { data: docs } = await serviceClient
      .from("atad2_session_documents")
      .select("id, doc_label, category, storage_path, mime_type, relevance_note")
      .eq("session_id", sessionId);
    if (!docs || docs.length === 0) {
      throw new Error("No documents to analyze");
    }

    // Build the documents-block (one labeled chunk per doc).
    const docTextBlocks: string[] = [];
    for (const d of docs as DocRow[]) {
      const { data: file } = await serviceClient.storage.from("session-documents").download(d.storage_path);
      if (!file) continue;
      const text = await file.text();
      const noteAttr = d.relevance_note
        ? ` relevance_note="${d.relevance_note.replace(/"/g, "'")}"`
        : "";
      docTextBlocks.push(
        `<document doc_label="${d.doc_label}" category="${d.category}"${noteAttr}>\n${text}\n</document>`
      );
    }
    const documentsBlock = docTextBlocks.join("\n\n");

    // Load all unique questions.
    const { data: rawQuestions } = await serviceClient
      .from("atad2_questions")
      .select("question_id, question, question_explanation");
    const uniq = new Map<string, QuestionRow>();
    for (const q of rawQuestions ?? []) {
      if (!uniq.has(q.question_id)) uniq.set(q.question_id, q as QuestionRow);
    }
    const questions = Array.from(uniq.values());

    const prompt = await loadActivePrompt(serviceClient, "prefill_swarm_system" as PromptKey);

    let totalIn = 0, totalOut = 0, totalCacheRead = 0, totalCacheCreate = 0;
    const failures: string[] = [];
    const inserts: Array<SwarmPrefillType & { question_id: string }> = [];

    const work = async (q: QuestionRow) => {
      try {
        const userText = renderTemplate(prompt.user_prompt_template, {
          documents_block: documentsBlock,
          question_id: q.question_id,
          question_text: q.question,
          question_explanation: q.question_explanation ?? "",
        });

        const splitMarker = "## Question";
        const splitIndex = userText.indexOf(splitMarker);
        const docPrefix = splitIndex >= 0 ? userText.slice(0, splitIndex) : userText;
        const questionSuffix = splitIndex >= 0 ? userText.slice(splitIndex) : "";

        const userContent = [
          { type: "text" as const, text: docPrefix, cache_control: { type: "ephemeral" } as const },
          { type: "text" as const, text: questionSuffix },
        ];

        const { text, usage } = await callOpus({
          model: prompt.model,
          systemPrompt: prompt.system_prompt,
          userContent: userContent as unknown as { type: "text"; text: string }[],
          temperature: prompt.temperature,
          maxTokens: prompt.max_tokens,
        });

        totalIn += usage.input_tokens;
        totalOut += usage.output_tokens;
        totalCacheRead += usage.cache_read_input_tokens ?? 0;
        totalCacheCreate += usage.cache_creation_input_tokens ?? 0;

        const parsed = extractJson(text, SwarmPrefill);

        const lower = parsed.suggested_toelichting.trim().toLowerCase();
        if (BAD_LEAD_INS.some((p) => lower.startsWith(p))) {
          failures.push(`${q.question_id}: bad lead-in`);
          return;
        }
        if (FORBIDDEN_ANYWHERE.some((p) => lower.includes(p))) {
          failures.push(`${q.question_id}: forbidden phrase`);
          return;
        }

        inserts.push({ ...parsed, question_id: q.question_id });
      } catch (e) {
        failures.push(`${q.question_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    // Concurrency cap.
    const queue = [...questions];
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const q = queue.shift();
          if (q) await work(q);
        }
      })());
    }
    await Promise.allSettled(workers);

    if (inserts.length > 0) {
      await serviceClient.from("atad2_question_prefills").upsert(
        inserts.map((p) => ({
          session_id: sessionId,
          question_id: p.question_id,
          suggested_toelichting: p.suggested_toelichting,
          source_refs: p.source_refs,
          suggested_answer: p.suggested_answer,
          confidence_pct: p.confidence_pct,
          answer_rationale: p.answer_rationale,
          user_action: "pending",
        })),
        { onConflict: "session_id,question_id" },
      );
    }

    await serviceClient.from("atad2_prefill_jobs")
      .update({
        stage2_finished_at: new Date().toISOString(),
        status: "completed",
        total_token_usage: {
          input_tokens: totalIn,
          output_tokens: totalOut,
          cache_read_input_tokens: totalCacheRead,
          cache_creation_input_tokens: totalCacheCreate,
        },
        stage2_prompt_version: prompt.version,
      })
      .eq("session_id", sessionId);

    console.log(JSON.stringify({
      level: "info", event: "swarm_completed",
      session_id: sessionId, prefill_count: inserts.length, failure_count: failures.length,
      duration_ms: Date.now() - started,
    }));
    if (failures.length > 0) {
      console.warn(JSON.stringify({
        level: "warn", event: "swarm_partial_failures",
        session_id: sessionId, failures,
      }));
    }

    return { ok: true, prefill_count: inserts.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await serviceClient.from("atad2_prefill_jobs")
      .update({ status: "failed", failed_at: new Date().toISOString(), error_message: message })
      .eq("session_id", sessionId);
    console.error(JSON.stringify({
      level: "error", event: "swarm_failed",
      session_id: sessionId, error: message,
    }));
    return { ok: false, error: message };
  }
}
