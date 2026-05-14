-- Store an accepted-state snapshot of the structure chart so the report
-- step (and later the Word export) can show it without re-rendering ReactFlow.
ALTER TABLE public.atad2_structure_charts
  ADD COLUMN IF NOT EXISTS snapshot_png text,
  ADD COLUMN IF NOT EXISTS snapshot_captured_at timestamptz;

COMMENT ON COLUMN public.atad2_structure_charts.snapshot_png IS
  'Transparent PNG of the chart as a base64 data URL, captured on finalize.';
