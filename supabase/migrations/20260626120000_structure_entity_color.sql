-- Per-entity colour in the structure chart.
--
-- Advisors can assign each entity a fill colour from the fixed Office
-- "Theme Colors" palette (see src/lib/structure/entityPalette.ts). The value is
-- a "#RRGGBB" hex string, or NULL for the default white fill. Purely cosmetic:
-- the AI extractor never sets it; it survives because loadChart selects '*' and
-- upsertEntity writes the whole row.
ALTER TABLE public.atad2_structure_entities
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.atad2_structure_entities.color IS
  'Optional advisor-assigned node fill, "#RRGGBB" from the theme palette; NULL = default white.';
