-- Payment flow routing — persisted manual path edits per transaction bundle.
-- A row exists iff the flow has been hand-edited; auto flows have no row.

CREATE TABLE public.atad2_structure_flow_routing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id        uuid NOT NULL
                    REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  from_entity_id  uuid NOT NULL
                    REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  to_entity_id    uuid NOT NULL
                    REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  waypoints       jsonb NOT NULL DEFAULT '[]'::jsonb,
  label_position  jsonb,
  routing_mode    text NOT NULL DEFAULT 'manual'
                    CHECK (routing_mode IN ('auto','manual')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chart_id, from_entity_id, to_entity_id)
);
CREATE INDEX idx_structure_flow_routing_chart
  ON public.atad2_structure_flow_routing(chart_id);

CREATE TRIGGER trg_flow_routing_updated_at
  BEFORE UPDATE ON public.atad2_structure_flow_routing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.atad2_structure_flow_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_routing_select" ON public.atad2_structure_flow_routing FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "flow_routing_insert" ON public.atad2_structure_flow_routing FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "flow_routing_update" ON public.atad2_structure_flow_routing FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "flow_routing_delete" ON public.atad2_structure_flow_routing FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));

GRANT ALL ON public.atad2_structure_flow_routing TO service_role;
