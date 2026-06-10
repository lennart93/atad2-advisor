import { z } from "zod";

// Tolerant: the model occasionally omits a field. Keep only the keys (entity
// ids) required; everything else is nullish and coalesced in buildFacts, so a
// near-miss output still populates the classification matrix + transactions
// instead of failing the whole parse and falling back to empty.
export const FactsModelOutput = z.object({
  classifications: z.array(z.object({
    entityId: z.string().nullish(),
    homeState: z.string().nullish(),
    homeClass: z.string().nullish(),
    sourceState: z.string().nullish(),
    sourceClass: z.string().nullish(),
    hybrid: z.boolean().nullish(),
  })).optional().default([]),
  transactions: z.array(z.object({
    fromEntityId: z.string().nullish(),
    toEntityId: z.string().nullish(),
    kind: z.string().nullish(),
    instrument: z.string().nullish(),
    note: z.string().nullish(),
    articlesTested: z.array(z.string()).nullish(),
    relevant: z.boolean().nullish(),
    relevanceReason: z.string().nullish(),
  })).optional().default([]),
  // One acting-together assessment for the parents: a single likelihood + one
  // prose paragraph (entity names only, no source citations). No per-level texts.
  actingTogether: z.array(z.object({
    memberEntityIds: z.array(z.string()).optional().default([]),
    combinedPct: z.number().nullish(),
    likelihood: z.string().nullish(),
    reasoning: z.string().nullish(),
  })).optional().default([]),
  nlTaxStatusByEntityId: z.record(z.string(), z.string()).optional(),
  // Group entities only: one short clause per register id on how the entity
  // relates to the taxpayer (e.g. "co-investor in a named fund alongside E9").
  // Optional and tolerant: missing ids simply show nothing in the register.
  positionByEntityId: z.record(z.string(), z.string()).optional(),
  // Register ids (E2, E3 ...) that form a Dutch fiscal unity (fiscale eenheid) with
  // the taxpayer E1, derived from the documents. E1 itself is implied and need not
  // be listed. Empty/omitted when there is no fiscal unity.
  fiscalUnityMemberEntityIds: z.array(z.string()).optional().default([]),
  // One connective sentence per funnel section (register, related, flows,
  // classification). All optional: a missing sentence renders as table-only.
  narratives: z.object({
    register: z.string().nullish(),
    related: z.string().nullish(),
    flows: z.string().nullish(),
    classification: z.string().nullish(),
  }).partial().nullish(),
});
export type FactsModelOutputT = z.infer<typeof FactsModelOutput>;
