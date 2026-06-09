import { z } from "zod";

// Tolerant: the model occasionally omits a field. Keep only the keys (entity
// ids) required; everything else is nullish and coalesced in buildFacts, so a
// near-miss output still populates the classification matrix + transactions
// instead of failing the whole parse and falling back to empty.
export const FactsModelOutput = z.object({
  classifications: z.array(z.object({
    entityId: z.string().min(1),
    homeState: z.string().nullish(),
    homeClass: z.string().nullish(),
    sourceState: z.string().nullish(),
    sourceClass: z.string().nullish(),
    hybrid: z.boolean().nullish(),
  })).optional().default([]),
  transactions: z.array(z.object({
    fromEntityId: z.string().min(1),
    toEntityId: z.string().min(1),
    kind: z.string().nullish(),
    instrument: z.string().nullish(),
    note: z.string().nullish(),
    articlesTested: z.array(z.string()).nullish(),
  })).optional().default([]),
  actingTogether: z.array(z.object({
    memberEntityIds: z.array(z.string().min(1)).min(1),
    combinedPct: z.number().nullish(),
    likelihood: z.enum(["highly_unlikely", "unlikely", "unclear", "likely", "highly_likely"]).nullish(),
    rationales: z.object({
      highly_unlikely: z.string().nullish(),
      unlikely: z.string().nullish(),
      unclear: z.string().nullish(),
      likely: z.string().nullish(),
      highly_likely: z.string().nullish(),
    }).partial().nullish(),
  })).optional().default([]),
  nlTaxStatusByEntityId: z.record(z.string(), z.string()).optional(),
});
export type FactsModelOutputT = z.infer<typeof FactsModelOutput>;
