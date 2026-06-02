-- Add heartbeat_at so a dead background extraction can be detected and
-- recovered. The extract-structure edge function writes this column
-- every ~15s while the pipeline is alive. On the next trigger, if status
-- is still 'extracting:*' but heartbeat_at is older than 90s, the
-- function assumes the previous worker died and restarts the pipeline.
ALTER TABLE public.atad2_structure_charts
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

COMMENT ON COLUMN public.atad2_structure_charts.heartbeat_at IS
  'Last sign of life from the background extraction pipeline. Compared against now() to detect stuck "extracting:*" status.';
