import { z } from "zod";

export const DocumentCategory = z.enum([
  "financial_statements",
  "tax_returns",
  "local_file",
  "master_file",
  "previous_year_atad2_analysis",
  "trial_balance",
  "general_ledger",
  "memo",
  "comment_letter_to_tax_return",
  "other",
]);

export const SwarmAnswer = z.enum(["yes", "no", "unknown"]);

const SwarmPrefillRaw = z.object({
  suggested_answer: SwarmAnswer.nullable(),
  confidence_pct: z.number().int().min(0).max(100).nullable(),
  // The model legitimately writes rationales longer than a tight 200-char cap;
  // rejecting them 500'd nearly every question. Generous cap, still bounded.
  answer_rationale: z.string().max(500).nullable(),
  // Cap widened to 4000 with the factsheet pipeline (DB CHECK is 4000, analyze.ts
  // truncates to 4000). A generous cap keeps a longer, factsheet-grounded
  // toelichting from failing the whole row's parse.
  suggested_toelichting: z.string().min(1).max(4000).nullable(),
  // A grounded suggestion may have no pinpoint document location (e.g. an
  // "unknown" answer, or a general toelichting). An empty source_refs array is
  // a valid model response — requiring min(1) rejected those as a 500.
  source_refs: z.array(z.object({
    doc_label: z.string().min(1),
    location: z.string().min(1),
  })),
  // v6 routing: when documents do not support an answer but DO point at where
  // to find it, the model puts that pointer here instead of in
  // suggested_toelichting. Mutually exclusive with suggested_toelichting.
  contextual_hint: z.string().min(1).max(1000).nullable(),
  // v9: companion to contextual_hint. Same dossier facts reframed as the
  // user-voice "it is unknown..." explanation the advisor would type when
  // picking Unknown for this question. Populated ONLY when contextual_hint
  // is populated; otherwise null. Older swarm versions that don't emit this
  // field still parse cleanly because we default it before validation.
  suggested_toelichting_unknown: z.string().min(1).max(4000).nullable().default(null),
  // v12: Route B companion. The ready-to-send client question ("We understand
  // that ... Could you please confirm ..."), populated only alongside
  // contextual_hint. Zod cap deliberately generous at 700 (same precedent as
  // answer_rationale above); the DB CHECK is 450 and analyze.ts truncates to
  // 450, so a slight model overshoot never 500s the row. nullish().default(null)
  // keeps v11-and-older payloads (which never emit the key) parseable.
  client_question: z.string().max(700).nullish().default(null),
  // Factsheet pipeline (v18): the doc_label + loc (+ optional quote) citations
  // the swarm carries over from the fact sheet for a positive/negative answer.
  // Stored on the prefill row as-is (jsonb). Loose + nullish so a v17-and-older
  // payload (which never emits it) still parses. Kept independent of the
  // Route A/B transform below — evidence can accompany a definitive answer.
  evidence: z.array(z.object({
    doc_label: z.string().default(""),
    loc: z.string().nullish().default(null),
    quote: z.string().nullish().default(null),
  })).nullish().default(null),
});

export const SwarmPrefill = SwarmPrefillRaw.transform((raw) => {
  // Routing invariant: drop contextual_hint if suggested_toelichting is also
  // populated. Defensive — keeps a bad LLM payload from breaking the row.
  if (raw.suggested_toelichting && raw.contextual_hint) {
    return { ...raw, contextual_hint: null, suggested_toelichting_unknown: null, client_question: null };
  }
  // suggested_toelichting_unknown and client_question only ride along with
  // contextual_hint.
  if (!raw.contextual_hint && (raw.suggested_toelichting_unknown || raw.client_question)) {
    return { ...raw, suggested_toelichting_unknown: null, client_question: null };
  }
  return raw;
}).refine(
  (v) => v.suggested_toelichting !== null || v.contextual_hint !== null,
  { message: "Either suggested_toelichting or contextual_hint must be populated" },
);
export type SwarmPrefillType = z.infer<typeof SwarmPrefill>;

// compose_client_letter schema v2 (prompt v3): ONE composed client letter
// with a short prose intro and 2-4 thematic groups. Each output question may
// MERGE several input drafts; question_ids carries the source register
// question ids it covers (the merge mapping the coverage guard checks). An
// optional table renders a per-entity grid (one row per entity, one column
// per sub-question). Caps are deliberately generous per house precedent:
// per-question text cap raised to 2000 because merged questions carry
// sub-asks; groups capped at 6 while the prompt demands 2-4; title allows ""
// (no min) so the legacy-normalized unnamed group below validates.
const LetterTableSchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(z.array(z.string())).min(1),
});
export const ComposedLetterSchema = z.object({
  intro: z.string().max(2500),
  groups: z.array(z.object({
    title: z.string().max(150),
    questions: z.array(z.object({
      question_ids: z.array(z.string().min(1)).min(1),
      text: z.string().min(1).max(2000),
      table: LetterTableSchema.nullish().default(null),
    })).min(1),
  })).min(1).max(6),
});
export type ComposedLetterType = z.infer<typeof ComposedLetterSchema>;

// compose_client_letter v1 (legacy): the flat shape the deployed prompt v1/v2
// still emits. The edge parses the new shape FIRST and falls back to this +
// normalizeLegacyComposedLetter, which makes the VM deploy order-safe (new
// edge with the old prompt still composes).
export const ComposedLetterLegacySchema = z.object({
  understandings: z.array(z.string().min(1)),
  questions: z.array(z.object({
    question_id: z.string().min(1),
    text: z.string().min(1).max(1200),
  })).min(1),
});
export type ComposedLetterLegacyType = z.infer<typeof ComposedLetterLegacySchema>;

/**
 * Normalizes a legacy (v1-shape) letter into the v2 shape using EXACTLY the
 * same rule as the frontend old-shape branch (letterShape.ts): understandings
 * become a "We understand that:" bullet block in the intro (trimmed, blank
 * entries dropped; "" when none remain) and the questions become ONE unnamed
 * group (title "") of single-id questions without tables.
 */
export function normalizeLegacyComposedLetter(
  legacy: ComposedLetterLegacyType,
): ComposedLetterType {
  const bullets = legacy.understandings
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const intro = bullets.length > 0
    ? `We understand that:\n${bullets.map((entry) => `- ${entry}`).join("\n")}`
    : "";
  return {
    intro,
    groups: [{
      title: "",
      questions: legacy.questions.map((q) => ({
        question_ids: [q.question_id],
        text: q.text,
        table: null,
      })),
    }],
  };
}

export const TokenUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
});
export type TokenUsageType = z.infer<typeof TokenUsage>;
