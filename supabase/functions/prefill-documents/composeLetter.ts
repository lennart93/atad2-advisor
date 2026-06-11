import type { SupabaseClient } from "supabase";
import { loadActivePrompt, renderTemplate } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { ComposedLetterSchema, type ComposedLetterType } from "./schemas.ts";

/** One worklist question as received from the client. */
export interface ComposeQuestionInput {
  question_id: string;
  client_question: string;
  why_it_matters: string | null;
}

/**
 * Compose ONE client letter from the per-question drafts: merged
 * "We understand that ..." facts (each stated exactly once) plus one numbered
 * ask per input question. ONE Claude call, NO database writes; the flips and
 * audit events stay client-side. The coverage guard below makes the UI flip
 * set provably consistent with what the letter actually asks.
 */
export async function runComposeLetter(
  serviceClient: SupabaseClient,
  sessionId: string,
  questions: ComposeQuestionInput[],
  taxpayerName: string,
  fiscalYear: string,
): Promise<{ ok: boolean; letter?: ComposedLetterType; error?: string; usage?: Record<string, number> }> {
  const started = Date.now();

  try {
    const prompt = await loadActivePrompt(serviceClient, "compose_client_letter");

    const questionsBlock = questions
      .map((q) => {
        const lines = [
          `question_id: ${q.question_id}`,
          `client_question: ${q.client_question}`,
        ];
        if (q.why_it_matters) lines.push(`why_it_matters: ${q.why_it_matters}`);
        return lines.join("\n");
      })
      .join("\n\n");

    const userText = renderTemplate(prompt.user_prompt_template, {
      taxpayer_name: taxpayerName,
      fiscal_year: fiscalYear,
      questions_block: questionsBlock,
    });

    const { text, usage } = await callOpus({
      model: prompt.model,
      systemPrompt: prompt.system_prompt,
      userContent: userText,
      temperature: prompt.temperature,
      maxTokens: prompt.max_tokens,
    });

    const parsed = extractJson(text, ComposedLetterSchema);

    // Defensive dash scrub: the prompt bans em/en-dashes, but a stray one in
    // the output must never reach the client letter. Safety net only.
    const scrub = (s: string): string => s.replace(/\s*[—–]\s*/g, ", ");
    const scrubbed: ComposedLetterType = {
      understandings: parsed.understandings.map(scrub),
      questions: parsed.questions.map((q) => ({ question_id: q.question_id, text: scrub(q.text) })),
    };

    // GROUNDING / COVERAGE GUARD: drop any output question whose id was not
    // in the inputs (the model must never invent ids), then require every
    // input id to appear EXACTLY once. Anything else would let the UI flip
    // register rows the letter never asks about, or send duplicate asks.
    const inputIds = new Set(questions.map((q) => q.question_id));
    const kept = scrubbed.questions.filter((q) => inputIds.has(q.question_id));
    const counts = new Map<string, number>();
    for (const q of kept) counts.set(q.question_id, (counts.get(q.question_id) ?? 0) + 1);
    const covered = [...inputIds].every((id) => counts.get(id) === 1) && kept.length === inputIds.size;
    if (!covered) {
      console.warn(JSON.stringify({
        level: "warn", event: "compose_letter_failed",
        session_id: sessionId, reason: "coverage guard",
        input_ids: [...inputIds], output_ids: scrubbed.questions.map((q) => q.question_id),
      }));
      return { ok: false, error: "composition incomplete: missing or duplicated question ids" };
    }

    console.log(JSON.stringify({
      level: "info", event: "compose_letter_completed",
      session_id: sessionId,
      question_count: questions.length,
      understanding_count: scrubbed.understandings.length,
      duration_ms: Date.now() - started,
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_create: usage.cache_creation_input_tokens ?? 0,
    }));

    return {
      ok: true,
      letter: { understandings: scrubbed.understandings, questions: kept },
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
      level: "error", event: "compose_letter_failed",
      session_id: sessionId, error: message,
    }));
    return { ok: false, error: message };
  }
}
