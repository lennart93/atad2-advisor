import { z } from 'zod';

const TempId = z.string().regex(/^ent_\d+$/, 'temp_id must be like "ent_1"');
const Iso = z.string().min(2).max(3);

const EntityType = z.enum([
  'corporation', 'partnership', 'dh_entity',
  'hybrid_partnership', 'reverse_hybrid',
  'individual', 'trust_or_non_entity',
]);

export const Stage1Output = z.object({
  entities: z.array(z.object({
    temp_id: TempId,
    name: z.string().min(1),
    legal_form: z.string().nullable().optional(),
    jurisdiction_iso: Iso,
    entity_type: EntityType,
    is_taxpayer: z.boolean(),
  })).min(1),
});
export type Stage1OutputT = z.infer<typeof Stage1Output>;

export const Stage2Output = z.object({
  ownership_edges: z.array(z.object({
    from_temp_id: TempId,
    to_temp_id: TempId,
    ownership_pct: z.number().min(0).max(100),
    voting_only: z.boolean().optional(),
  })),
});
export type Stage2OutputT = z.infer<typeof Stage2Output>;

// transaction_type accepts any string the LLM produces. The Edge Function
// normalizes it into the DB-allowed set ('loan' | 'royalty' | 'dividend' |
// 'service_fee' | 'management_fee' | 'other') before persisting.
const TransactionType = z.string().min(1);
const Mismatch = z.enum(['D/NI', 'DD']);

export const Stage3Output = z.object({
  transactions: z.array(z.object({
    from_temp_id: TempId,
    to_temp_id: TempId,
    transaction_type: TransactionType,
    amount_eur: z.number().nullable().optional(),
    label: z.string().nullable().optional(),
    is_mismatch: z.boolean(),
    mismatch_classification: Mismatch.nullable().optional(),
    mismatch_atad2_article: z.string().nullable().optional(),
  })),
});
export type Stage3OutputT = z.infer<typeof Stage3Output>;
