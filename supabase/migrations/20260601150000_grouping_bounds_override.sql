-- atad2_structure_groupings: per-rand handmatige override op het auto-fit kader.
--
-- Wanneer de gebruiker een rand van een fiscale eenheid versleept, slaan we
-- vier delta's op (links/boven/rechts/onder) ten opzichte van de
-- auto-berekende rechthoek. NULL = volledig auto-fit (default).
--
-- Shape: { "dLeft": number, "dTop": number, "dRight": number, "dBottom": number }
-- Eenheid: canvas-coords (dezelfde als entity position_x/y).

ALTER TABLE public.atad2_structure_groupings
  ADD COLUMN bounds_override jsonb;

COMMENT ON COLUMN public.atad2_structure_groupings.bounds_override IS
  'Per-edge offsets ({dLeft,dTop,dRight,dBottom}) in canvas-coords that override the auto-fit FE rectangle. NULL = pure auto-fit.';
