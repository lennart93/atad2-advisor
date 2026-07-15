// Deno-only loader rond de pure merge (effectiveAnswers.ts). Structureel
// getypeerde client zodat dit bestand niet aan een import-map hangt en door
// zowel extract-structure als generate-appendix gebruikt kan worden.
import {
  mergeEffectiveAnswers,
  type EffectiveAnswer, type PrefillInput, type RealAnswerInput,
} from "./effectiveAnswers.ts";

interface QueryResult { data: unknown; error: { message: string } | null }
interface MinimalDb {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export async function loadEffectiveAnswers(client: MinimalDb, sessionId: string): Promise<EffectiveAnswer[]> {
  const [answersRes, prefillsRes] = await Promise.all([
    client.from("atad2_answers")
      .select("question_id, question_text, answer, explanation")
      .eq("session_id", sessionId) as PromiseLike<QueryResult>,
    client.from("atad2_question_prefills")
      .select("question_id, suggested_answer, suggested_toelichting, contextual_hint, suggested_toelichting_unknown")
      .eq("session_id", sessionId) as PromiseLike<QueryResult>,
  ]);
  const real = (answersRes.data ?? []) as RealAnswerInput[];
  const prefills = (prefillsRes.data ?? []) as PrefillInput[];
  const merged = mergeEffectiveAnswers(real, prefills);

  // Suggestion rows carry no question_text; the structure-refine prompt wants
  // it. Fetch it once from the question bank (one row per answer option, so
  // dedupe by question_id). Best-effort: a miss leaves question_text null.
  if (merged.some((a) => a.source === "suggestion")) {
    try {
      const qRes = await (client.from("atad2_questions")
        .select("question_id, question_text") as PromiseLike<QueryResult>);
      const byId = new Map<string, string>();
      for (const q of (qRes.data ?? []) as Array<{ question_id: string; question_text: string }>) {
        if (!byId.has(q.question_id)) byId.set(q.question_id, q.question_text);
      }
      for (const a of merged) {
        if (a.question_text == null) a.question_text = byId.get(a.question_id) ?? null;
      }
    } catch { /* question_text stays null */ }
  }
  return merged;
}
