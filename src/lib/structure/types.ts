import type { Database } from '@/integrations/supabase/types';

export type StructureChart   = Database['public']['Tables']['atad2_structure_charts']['Row'];
export type StructureEntity  = Database['public']['Tables']['atad2_structure_entities']['Row'];
export type StructureEdge    = Database['public']['Tables']['atad2_structure_edges']['Row'];
export type StructureGroup   = Database['public']['Tables']['atad2_structure_groupings']['Row'];

export type EntityType =
  | 'corporation'
  | 'partnership'
  | 'dh_entity'
  | 'hybrid_partnership'
  | 'reverse_hybrid'
  | 'individual'
  | 'trust_or_non_entity';

export const ENTITY_TYPES: ReadonlyArray<{ key: EntityType; label: string }> = [
  { key: 'corporation',         label: 'Corporation' },
  { key: 'partnership',         label: 'Partnership' },
  { key: 'dh_entity',           label: 'D / Hybrid Entity' },
  { key: 'hybrid_partnership',  label: 'Hybrid Partnership' },
  { key: 'reverse_hybrid',      label: 'Reverse Hybrid' },
  { key: 'individual',          label: 'Individual' },
  { key: 'trust_or_non_entity', label: 'Trust / Non-Entity' },
];

export type ChartStatus =
  | 'extracting:stage1' | 'extracting:stage2' | 'extracting:stage3'
  | 'draft_ready' | 'extraction_failed'
  | 'user_edited' | 'finalized';

export type EdgeKind = 'ownership' | 'transaction';
export type TransactionType =
  | 'loan' | 'royalty' | 'dividend' | 'service_fee' | 'management_fee' | 'other';
export type MismatchClassification = 'D/NI' | 'DD';
