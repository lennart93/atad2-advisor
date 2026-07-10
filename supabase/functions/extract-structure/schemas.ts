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
    // Nullable: the model legitimately cannot pin a jurisdiction for some
    // entities (natural persons, an unclear SPV). Requiring a string made the
    // WHOLE stage-1 extraction fail on one such entity ("Expected string,
    // received null"), which the frontend read as a hang-then-retry. The DB
    // column is nullable and factsBuild handles a null jurisdiction.
    jurisdiction_iso: Iso.nullable(),
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
