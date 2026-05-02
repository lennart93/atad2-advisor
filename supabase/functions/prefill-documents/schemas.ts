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

export const SwarmPrefill = z.object({
  suggested_answer: SwarmAnswer.nullable(),
  confidence_pct: z.number().int().min(0).max(100).nullable(),
  answer_rationale: z.string().max(200).nullable(),
  suggested_toelichting: z.string().min(1).max(1000),
  source_refs: z.array(z.object({
    doc_label: z.string().min(1),
    location: z.string().min(1),
  })).min(1),
});
export type SwarmPrefillType = z.infer<typeof SwarmPrefill>;

export const TokenUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
});
export type TokenUsageType = z.infer<typeof TokenUsage>;
