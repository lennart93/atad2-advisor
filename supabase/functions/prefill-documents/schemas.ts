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
});

export const SwarmPrefill = SwarmPrefillRaw.transform((raw) => {
  // Routing invariant: drop contextual_hint if suggested_toelichting is also
  // populated. Defensive — keeps a bad LLM payload from breaking the row.
  if (raw.suggested_toelichting && raw.contextual_hint) {
    return { ...raw, contextual_hint: null };
  }
  return raw;
}).refine(
  (v) => v.suggested_toelichting !== null || v.contextual_hint !== null,
  { message: "Either suggested_toelichting or contextual_hint must be populated" },
);
export type SwarmPrefillType = z.infer<typeof SwarmPrefill>;

export const TokenUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
});
export type TokenUsageType = z.infer<typeof TokenUsage>;
