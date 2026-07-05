-- Stop the same company appearing twice in a structure chart.
-- Two concurrent extract-structure pipelines (Phase A prewarm + Phase B refine,
-- ~5 fallback trigger sites) can each clear+insert the AI entity set. With no
-- unique key on the entity name, both sets survive and every entity (and its
-- edges) doubles, which then flows into Appendix Part A and the memo.
--
-- Apply as supabase_admin (tables are owned by supabase_admin, not postgres):
--   docker exec -i $(docker ps --filter name=supabase-db -q) \
--     psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20260703120000_structure_entities_dedupe_unique.sql

BEGIN;

-- Step 1 - remove historical duplicates, keeping the EARLIEST row per
-- (chart_id, lower(name)). atad2_structure_edges and atad2_structure_flow_routing
-- reference the entity id with ON DELETE CASCADE, so the later duplicates' edges
-- and routing drop away with them (no FK error).
DELETE FROM public.atad2_structure_entities e
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY chart_id, lower(name)
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.atad2_structure_entities
) dup
WHERE e.id = dup.id
  AND dup.rn > 1;

-- Step 2 - enforce uniqueness going forward (case-insensitive on name).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_structure_entities_chart_lower_name
  ON public.atad2_structure_entities (chart_id, lower(name));

COMMIT;
