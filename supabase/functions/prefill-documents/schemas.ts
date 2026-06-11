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
  suggested_toelichting: z.string().min(1).max(1000).nullable(),
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
  suggested_toelichting_unknown: z.string().min(1).max(1000).nullable().default(null),
  // v12: Route B companion. The ready-to-send client question ("We understand
  // that ... Could you please confirm ..."), populated only alongside
  // contextual_hint. Zod cap deliberately generous at 700 (same precedent as
  // answer_rationale above); the DB CHECK is 450 and analyze.ts truncates to
  // 450, so a slight model overshoot never 500s the row. nullish().default(null)
  // keeps v11-and-older payloads (which never emit the key) parseable.
  client_question: z.string().max(700).nullish().default(null),
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

// compose_client_letter v1: ONE composed client letter assembled from the
// per-question client_question drafts. understandings = shared "We understand
// that ..." facts merged across questions (each stated exactly once);
// questions = one numbered ask per input question_id, without repeating the
// merged context. understandings may be empty (sparse inputs share no facts);
// questions must not be. The 1200-char cap per ask is deliberately generous
// (the per-question drafts are <=450 chars; merged rephrasing stays well
// under it) but still bounds a runaway model.
export const ComposedLetterSchema = z.object({
  understandings: z.array(z.string().min(1)),
  questions: z.array(z.object({
    question_id: z.string().min(1),
    text: z.string().min(1).max(1200),
  })).min(1),
});
export type ComposedLetterType = z.infer<typeof ComposedLetterSchema>;

export const TokenUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
});
export type TokenUsageType = z.infer<typeof TokenUsage>;
