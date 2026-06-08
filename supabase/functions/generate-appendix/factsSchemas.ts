import { z } from "zod";

export const FactsModelOutput = z.object({
  classifications: z.array(z.object({
    entityId: z.string().min(1),
    homeState: z.string(),
    homeClass: z.string(),
    sourceState: z.string().nullable(),
    sourceClass: z.string().nullable(),
    hybrid: z.boolean(),
  })),
  transactions: z.array(z.object({
    fromEntityId: z.string().min(1),
    toEntityId: z.string().min(1),
    kind: z.string(),
    instrument: z.string().nullable(),
    note: z.string().nullable(),
    articlesTested: z.array(z.string()),
  })),
  actingTogether: z.array(z.object({
    memberEntityIds: z.array(z.string().min(1)).min(2),
    combinedPct: z.number().nullable(),
    rationale: z.string(),
  })),
  nlTaxStatusByEntityId: z.record(z.string(), z.string()).optional(),
});
export type FactsModelOutputT = z.infer<typeof FactsModelOutput>;
