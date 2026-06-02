-- Remove payment-flow / transaction-edge feature entirely.
-- The structure chart is now ownership-only.

-- 1. Drop the manual flow-routing table (rows and policies cascade).
DROP TABLE IF EXISTS public.atad2_structure_flow_routing CASCADE;

-- 2. Purge any existing transaction-kind edges so the tightened CHECK passes.
DELETE FROM public.atad2_structure_edges WHERE kind = 'transaction';

-- 3. Tighten edge `kind` CHECK to ownership-only.
ALTER TABLE public.atad2_structure_edges
  DROP CONSTRAINT IF EXISTS atad2_structure_edges_kind_check;
ALTER TABLE public.atad2_structure_edges
  ADD CONSTRAINT atad2_structure_edges_kind_check
  CHECK (kind = 'ownership');
