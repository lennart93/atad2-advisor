import type { SupabaseClient } from "supabase";
import { loadActivePrompt, renderTemplate } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import {
  ComposedLetterLegacySchema,
  ComposedLetterSchema,
  normalizeLegacyComposedLetter,
  type ComposedLetterType,
} from "./schemas.ts";

/** One worklist question as received from the client. */
export interface ComposeQuestionInput {
  question_id: string;
  client_question: string;
  why_it_matters: string | null;
}

/**
 * Compose ONE client letter from the per-question drafts: a short prose
 * intro plus 2-4 thematic groups of (possibly merged) asks, each carrying
 * the source question_ids it covers. ONE Claude call, NO database writes;
 * the flips and audit events stay client-side. The coverage guard below
 * makes the UI flip set provably consistent with what the letter actually
 * asks. Legacy (prompt v1/v2) output is normalized server-side, so the edge
 * and the prompt migration may land in either order.
 */
export async function runComposeLetter(
  serviceClient: SupabaseClient,
  sessionId: string,
  questions: ComposeQuestionInput[],
  taxpayerName: string,
  fiscalYear: string,
): Promise<{ ok: boolean; letter?: ComposedLetterType; letter_version?: number; error?: string; usage?: Record<string, number> }> {
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

    // Parse the new (grouped) shape first; fall back to the legacy flat
    // shape + server-side normalization. This makes the deploy ORDER-SAFE:
    // the new edge with the old v2 prompt still composes, so a PIM expiry
    // between rsync and migration leaves a working system.
    let parsed: ComposedLetterType;
    try {
      parsed = extractJson(text, ComposedLetterSchema);
    } catch {
      parsed = normalizeLegacyComposedLetter(extractJson(text, ComposedLetterLegacySchema));
    }

    // Defensive dash scrub: the prompt bans em/en-dashes, but a stray one in
    // the output must never reach the client letter. Safety net only. Covers
    // intro, group titles, question texts and every table column and cell.
    const scrub = (s: string): string => s.replace(/\s*[—–]\s*/g, ", ");
    const scrubbed: ComposedLetterType = {
      intro: scrub(parsed.intro),
      groups: parsed.groups.map((g) => ({
        title: scrub(g.title),
        questions: g.questions.map((q) => ({
          question_ids: q.question_ids,
          text: scrub(q.text),
          table: q.table === null ? null : {
            columns: q.table.columns.map(scrub),
            rows: q.table.rows.map((row) => row.map(scrub)),
          },
        })),
      })),
    };

    // GROUNDING / COVERAGE GUARD v2: drop any id the inputs never contained
    // (the model must never invent ids), drop questions left with no ids and
    // groups left with no questions, then require every input id to live in
    // EXACTLY ONE output question_ids array. Anything else would let the UI
    // flip register rows the letter never asks about, or send duplicate asks.
    const inputIds = new Set(questions.map((q) => q.question_id));
    const keptGroups = scrubbed.groups
      .map((g) => ({
        title: g.title,
        questions: g.questions
          .map((q) => ({ ...q, question_ids: q.question_ids.filter((id) => inputIds.has(id)) }))
          .filter((q) => q.question_ids.length > 0),
      }))
      .filter((g) => g.questions.length > 0);
    const counts = new Map<string, number>();
    for (const g of keptGroups) {
      for (const q of g.questions) {
        for (const id of q.question_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const covered = keptGroups.length > 0 &&
      [...inputIds].every((id) => counts.get(id) === 1);
    if (!covered) {
      console.warn(JSON.stringify({
        level: "warn", event: "compose_letter_failed",
        session_id: sessionId, reason: "coverage guard",
        input_ids: [...inputIds],
        output_ids: scrubbed.groups.flatMap((g) => g.questions.flatMap((q) => q.question_ids)),
      }));
      return { ok: false, error: "composition incomplete: missing or duplicated question ids" };
    }

    const keptQuestions = keptGroups.flatMap((g) => g.questions);
    console.log(JSON.stringify({
      level: "info", event: "compose_letter_completed",
      session_id: sessionId,
      question_count: keptQuestions.length,
      group_count: keptGroups.length,
      table_count: keptQuestions.filter((q) => q.table !== null).length,
      duration_ms: Date.now() - started,
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_create: usage.cache_creation_input_tokens ?? 0,
    }));

    return {
      ok: true,
      letter: { intro: scrubbed.intro, groups: keptGroups },
      letter_version: 2,
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
