-- Row 2.1 claimed the related-party threshold is "raised to 50% for hybrid-entity
-- cases", but the deterministic register (entityRegister.ts / factsBuild.ts) only
-- ever applies the 25% associated-enterprise test. The screen must not assert a
-- rule the code does not run, so drop the parenthetical until a specialist has
-- reviewed the 50%-for-hybrid threshold. Kept in sync with the code copies in
-- src/lib/appendix/skeleton.ts and supabase/functions/generate-appendix/skeletonRows.ts.
--
-- Apply as supabase_admin (tables are owned by supabase_admin):
--   docker exec -i $(docker ps --filter name=supabase-db -q) \
--     psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20260703130000_appendix_skeleton_2_1_related_threshold.sql

UPDATE public.atad2_appendix_skeleton
SET condition_tested = 'Associated enterprise / related party: an interest of more than 25%, aggregated across an acting-together group'
WHERE row_id = '2.1'
  AND condition_tested LIKE '%raised to 50%';
