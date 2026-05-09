-- Corporate Structure Chart — schema + RLS
-- Three tables (charts, entities, edges) + groupings, all session-scoped via atad2_sessions.

-- ---------- entity-type enum ----------
DO $$ BEGIN
  CREATE TYPE public.entity_type_enum AS ENUM (
    'corporation',
    'partnership',
    'dh_entity',
    'hybrid_partnership',
    'reverse_hybrid',
    'individual',
    'trust_or_non_entity'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- atad2_structure_charts ----------
CREATE TABLE public.atad2_structure_charts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         text NOT NULL UNIQUE
                       REFERENCES public.atad2_sessions(session_id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'extracting:stage1',
  draft_extracted_at timestamptz,
  finalized_at       timestamptz,
  canvas_width       int  NOT NULL DEFAULT 1400,
  canvas_height      int  NOT NULL DEFAULT 900,
  warnings           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------- atad2_structure_entities ----------
CREATE TABLE public.atad2_structure_entities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id          uuid NOT NULL
                      REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  name              text NOT NULL,
  legal_form        text,
  jurisdiction_iso  text NOT NULL,
  entity_type       public.entity_type_enum NOT NULL,
  is_taxpayer       boolean NOT NULL DEFAULT false,
  position_x        numeric NOT NULL DEFAULT 0,
  position_y        numeric NOT NULL DEFAULT 0,
  source            text NOT NULL DEFAULT 'ai_extracted'
                      CHECK (source IN ('ai_extracted','user_added','user_edited')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_structure_entities_chart ON public.atad2_structure_entities(chart_id);

-- ---------- atad2_structure_edges ----------
CREATE TABLE public.atad2_structure_edges (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id                 uuid NOT NULL
                             REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  from_entity_id           uuid NOT NULL
                             REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  to_entity_id             uuid NOT NULL
                             REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  kind                     text NOT NULL CHECK (kind IN ('ownership','transaction')),

  -- ownership-only
  ownership_pct            numeric,
  ownership_voting_only    boolean,

  -- transaction-only
  transaction_type         text CHECK (
    transaction_type IS NULL
    OR transaction_type IN ('loan','royalty','dividend','service_fee','management_fee','other')
  ),
  amount_eur               numeric,
  is_mismatch              boolean NOT NULL DEFAULT false,
  mismatch_classification  text CHECK (
    mismatch_classification IS NULL
    OR mismatch_classification IN ('D/NI','DD')
  ),
  mismatch_atad2_article   text,

  -- common
  label                    text,
  source                   text NOT NULL DEFAULT 'ai_extracted'
                             CHECK (source IN ('ai_extracted','user_added','user_edited')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_structure_edges_chart ON public.atad2_structure_edges(chart_id);
CREATE INDEX idx_structure_edges_from ON public.atad2_structure_edges(from_entity_id);
CREATE INDEX idx_structure_edges_to   ON public.atad2_structure_edges(to_entity_id);

-- ---------- atad2_structure_groupings ----------
CREATE TABLE public.atad2_structure_groupings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id    uuid NOT NULL
                REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('fiscal_unity','consolidation_group')),
  label       text NOT NULL,
  member_ids  uuid[] NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_structure_groupings_chart ON public.atad2_structure_groupings(chart_id);

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_charts_updated_at  BEFORE UPDATE ON public.atad2_structure_charts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_entities_updated_at BEFORE UPDATE ON public.atad2_structure_entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_edges_updated_at    BEFORE UPDATE ON public.atad2_structure_edges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- RLS ----------
ALTER TABLE public.atad2_structure_charts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_structure_entities   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_structure_edges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_structure_groupings  ENABLE ROW LEVEL SECURITY;

-- charts: row visible iff session belongs to user
CREATE POLICY "charts_select" ON public.atad2_structure_charts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "charts_insert" ON public.atad2_structure_charts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "charts_update" ON public.atad2_structure_charts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "charts_delete" ON public.atad2_structure_charts FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_sessions s
    WHERE s.session_id = atad2_structure_charts.session_id AND s.user_id = auth.uid()
  ));

-- entities/edges/groupings: row visible iff chart's session belongs to user
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'atad2_structure_entities',
    'atad2_structure_edges',
    'atad2_structure_groupings'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT
        USING (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
      CREATE POLICY "%1$s_insert" ON public.%1$I FOR INSERT
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
      CREATE POLICY "%1$s_update" ON public.%1$I FOR UPDATE
        USING (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
      CREATE POLICY "%1$s_delete" ON public.%1$I FOR DELETE
        USING (EXISTS (
          SELECT 1 FROM public.atad2_structure_charts c
          JOIN public.atad2_sessions s ON s.session_id = c.session_id
          WHERE c.id = %1$I.chart_id AND s.user_id = auth.uid()
        ));
    $f$, tbl);
  END LOOP;
END $$;

-- service_role bypass (Edge Function uses service-role key)
GRANT ALL ON public.atad2_structure_charts     TO service_role;
GRANT ALL ON public.atad2_structure_entities   TO service_role;
GRANT ALL ON public.atad2_structure_edges      TO service_role;
GRANT ALL ON public.atad2_structure_groupings  TO service_role;
