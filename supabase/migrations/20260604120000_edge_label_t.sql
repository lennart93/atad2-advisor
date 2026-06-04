-- Slidable percentage label along ownership edges.
--
-- label_t is a fraction (0..1) along the source→target line where the user
-- has dragged the % label. NULL = use the default position (midpoint for
-- straight edges, just above target for jog/long-skip edges).
ALTER TABLE atad2_structure_edges
  ADD COLUMN IF NOT EXISTS label_t real;

COMMENT ON COLUMN atad2_structure_edges.label_t IS
  'User-dragged label position along edge: 0 = source, 1 = target, NULL = auto.';
