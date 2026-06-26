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

    // GROUNDING + AUTO-REPAIR (was the all-or-nothing coverage guard v2): the
    // UI flip set must equal exactly the union of question_ids the letter asks,
    // so every input id has to appear EXACTLY ONCE across the output. The old
    // guard REJECTED the whole letter on any slip, so a single id the model
    // dropped, duplicated or mistyped during the v3 merge 500'd the entire
    // compose with no recovery (and a near-deterministic retry left the advisor
    // stuck). We now REPAIR the partition instead of rejecting it: drop invented
    // ids, dedupe the rest, then append any input id the model forgot as its own
    // question. Same graceful-degrade stance as the legacy-shape fallback above
    // and the generous schema caps; the invariant (each input id covered once)
    // still holds at the end, it is just reached by repair, not by a 500.
    const inputIds = new Set(questions.map((q) => q.question_id));

    // 1) Drop any id the inputs never contained (the model must never invent
    //    ids), drop questions left with no ids and groups left with no questions.
    const filteredGroups = scrubbed.groups
      .map((g) => ({
        title: g.title,
        questions: g.questions
          .map((q) => ({ ...q, question_ids: q.question_ids.filter((id) => inputIds.has(id)) }))
          .filter((q) => q.question_ids.length > 0),
      }))
      .filter((g) => g.questions.length > 0);

    // 2) Dedupe across the whole letter: keep the FIRST occurrence of each id,
    //    strip later repeats, drop questions/groups left empty. Every surviving
    //    id now appears at most once.
    const seenIds = new Set<string>();
    const repairedDuplicates: string[] = [];
    const dedupedGroups = filteredGroups
      .map((g) => ({
        title: g.title,
        questions: g.questions
          .map((q) => {
            const ids: string[] = [];
            for (const id of q.question_ids) {
              if (seenIds.has(id)) {
                repairedDuplicates.push(id);
                continue;
              }
              seenIds.add(id);
              ids.push(id);
            }
            return { ...q, question_ids: ids };
          })
          .filter((q) => q.question_ids.length > 0),
      }))
      .filter((g) => g.questions.length > 0);

    // 3) Append any input id the model dropped as its own single-id question,
    //    using the original client_question text so the point still reaches the
    //    client. Same scrub() so the dash ban holds; one trailing unnamed group,
    //    mirroring the legacy-normalized shape the renderer already handles.
    const inputById = new Map(questions.map((q) => [q.question_id, q]));
    const missingIds = [...inputIds].filter((id) => !seenIds.has(id));
    const keptGroups = missingIds.length > 0
      ? [
          ...dedupedGroups,
          {
            title: "",
            questions: missingIds.map((id) => ({
              question_ids: [id],
              text: scrub(inputById.get(id)!.client_question),
              table: null,
            })),
          },
        ]
      : dedupedGroups;

    // 4) Only fail if there is literally nothing to send (no real groups AND no
    //    input ids to fall back on). With any input id present, step 3 makes the
    //    partition complete, so this is unreachable in practice.
    if (keptGroups.length === 0) {
      console.warn(JSON.stringify({
        level: "warn", event: "compose_letter_failed",
        session_id: sessionId, reason: "no usable groups",
        input_ids: [...inputIds],
        output_ids: scrubbed.groups.flatMap((g) => g.questions.flatMap((q) => q.question_ids)),
      }));
      return { ok: false, error: "composition incomplete: missing or duplicated question ids" };
    }

    // Repair telemetry: observable in the edge logs without bricking the
    // advisor. A rising rate here is the signal that the prompt regressed.
    if (repairedDuplicates.length > 0 || missingIds.length > 0) {
      console.warn(JSON.stringify({
        level: "warn", event: "compose_letter_repaired",
        session_id: sessionId,
        repaired_duplicates: repairedDuplicates,
        appended_missing: missingIds,
      }));
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
