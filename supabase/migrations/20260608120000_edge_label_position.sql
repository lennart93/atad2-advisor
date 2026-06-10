-- Free 2D positioning + hide for ownership % labels.
--
-- label_dx / label_dy: pixel offset (chart coords) of the % label from its
-- natural anchor (just above target, centered on target X). NULL = use the
-- auto position, which itself fans out sibling labels that converge on one
-- child so they no longer stack on top of each other. Supersedes label_t once
-- the user drags a label in 2D; on first drag we write dx/dy and clear label_t.
--
-- label_hidden: user clicked the label's "x" to remove the % from the chart.
-- The ownership_pct value is kept (it still feeds the memo/analysis); only the
-- on-chart label is suppressed. Re-show via the edge inspector.
ALTER TABLE atad2_structure_edges
  ADD COLUMN IF NOT EXISTS label_dx real,
  ADD COLUMN IF NOT EXISTS label_dy real,
  ADD COLUMN IF NOT EXISTS label_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN atad2_structure_edges.label_dx IS
  'User-dragged horizontal label offset from anchor, chart px. NULL = auto.';
COMMENT ON COLUMN atad2_structure_edges.label_dy IS
  'User-dragged vertical label offset from anchor, chart px. NULL = auto.';
COMMENT ON COLUMN atad2_structure_edges.label_hidden IS
  'Hide the % label on the chart (value still feeds the memo). Default false.';
