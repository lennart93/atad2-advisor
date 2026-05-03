import type { SupabaseClient } from "supabase";
import { loadActivePrompt, renderTemplate, type PromptKey } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { SwarmPrefill } from "./schemas.ts";

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

/**
 * Single-question analysis. The client orchestrates the swarm by firing N of
 * these in parallel — each request fits comfortably in the edge-runtime
 * wall-clock budget because it does ONE Anthropic call.
 */
export async function runAnalyzeOne(
  serviceClient: SupabaseClient,
  sessionId: string,
  questionId: string,
  questionText: string,
  questionExplanation: string,
  documentsBlock: string,
): Promise<{ ok: boolean; error?: string; usage?: Record<string, number> }> {
  const started = Date.now();

  try {
    const prompt = await loadActivePrompt(serviceClient, "prefill_swarm_system" as PromptKey);

    const userText = renderTemplate(prompt.user_prompt_template, {
      documents_block: documentsBlock,
      question_id: questionId,
      question_text: questionText,
      question_explanation: questionExplanation ?? "",
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

    const parsed = extractJson(text, SwarmPrefill);

    const lower = parsed.suggested_toelichting.trim().toLowerCase();
    if (BAD_LEAD_INS.some((p) => lower.startsWith(p))) {
      console.warn(JSON.stringify({
        level: "warn", event: "swarm_one_dropped",
        session_id: sessionId, question_id: questionId, reason: "bad lead-in",
      }));
      return { ok: false, error: "bad lead-in", usage: usage as unknown as Record<string, number> };
    }
    if (FORBIDDEN_ANYWHERE.some((p) => lower.includes(p))) {
      console.warn(JSON.stringify({
        level: "warn", event: "swarm_one_dropped",
        session_id: sessionId, question_id: questionId, reason: "forbidden phrase",
      }));
      return { ok: false, error: "forbidden phrase", usage: usage as unknown as Record<string, number> };
    }

    await serviceClient.from("atad2_question_prefills").upsert({
      session_id: sessionId,
      question_id: questionId,
      suggested_toelichting: parsed.suggested_toelichting,
      source_refs: parsed.source_refs,
      suggested_answer: parsed.suggested_answer,
      confidence_pct: parsed.confidence_pct,
      answer_rationale: parsed.answer_rationale,
      user_action: "pending",
    }, { onConflict: "session_id,question_id" });

    console.log(JSON.stringify({
      level: "info", event: "swarm_one_completed",
      session_id: sessionId, question_id: questionId,
      duration_ms: Date.now() - started,
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_create: usage.cache_creation_input_tokens ?? 0,
    }));

    return {
      ok: true,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      level: "error", event: "swarm_one_failed",
      session_id: sessionId, question_id: questionId, error: message,
    }));
    return { ok: false, error: message };
  }
}
