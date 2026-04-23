import { z } from "zod";

export const DocumentCategory = z.enum([
  "financial_statements",
  "tax_returns",
  "local_file",
  "master_file",
  "previous_year_atad2_analysis",
  "trial_balance",
  "general_ledger",
  "other",
]);

export const EntityType = z.enum([
  "BV", "NV", "Cooperative", "LLC", "Ltd", "Inc", "Partnership",
  "Branch", "PE", "Trust", "Foundation", "Individual", "Unknown",
]);

export const EntityRole = z.enum([
  "taxpayer", "parent", "subsidiary", "counterparty",
  "permanent_establishment", "other",
]);

export const Stage1Output = z.object({
  document_kind: DocumentCategory,
  language: z.string(),
  fiscal_periods: z.array(z.string()).default([]),
  entities: z.array(z.object({
    name: z.string(),
    type: EntityType,
    jurisdiction: z.string(),
    role: EntityRole,
    tax_residency: z.string().nullable().optional(),
    classification_notes: z.string().nullable().optional(),
  })).default([]),
  jurisdictions: z.array(z.string()).default([]),
  amounts: z.array(z.object({
    label: z.string(),
    value: z.string(),
    period: z.string(),
    source_location: z.string(),
  })).default([]),
  agreements: z.array(z.object({
    kind: z.string(),
    parties: z.array(z.string()),
    key_terms: z.array(z.string()),
  })).default([]),
  payment_flows: z.array(z.object({
    from: z.string(),
    to: z.string(),
    kind: z.string(),
    amount: z.string(),
    source_location: z.string(),
  })).default([]),
  prior_atad2_conclusions: z.array(z.object({
    topic: z.string(),
    conclusion: z.string(),
  })).default([]),
  other_facts: z.array(z.string()).default([]),
  raw_text_excerpts: z.array(z.object({
    location: z.string(),
    text: z.string().max(500),
  })).default([]),
  warnings: z.array(z.string()).default([]),
});
export type Stage1OutputType = z.infer<typeof Stage1Output>;

export const Stage2Prefill = z.object({
  question_id: z.string(),
  suggested_toelichting: z.string().max(1000),
  source_refs: z.array(z.object({
    document_id: z.string(),
    doc_label: z.string(),
    location: z.string(),
  })).min(1),
  verbatim_quote: z.string().max(300).nullable(),
});
export type Stage2PrefillType = z.infer<typeof Stage2Prefill>;

export const Stage2Output = z.object({
  prefills: z.array(Stage2Prefill),
});
export type Stage2OutputType = z.infer<typeof Stage2Output>;

export const TokenUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
});
export type TokenUsageType = z.infer<typeof TokenUsage>;
