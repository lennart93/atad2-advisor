-- Add `contextual_hint` to atad2_question_prefills and relax suggested_toelichting to nullable.
-- Routing rule (enforced in the edge function, not in DB): exactly one of
-- suggested_toelichting or contextual_hint is populated per row, never both.
-- We deliberately do NOT add a CHECK constraint here — defensive handling
-- lives in the Zod refinement so a bad LLM payload does not 500 a row insert.

ALTER TABLE public.atad2_question_prefills
  ALTER COLUMN suggested_toelichting DROP NOT NULL;

ALTER TABLE public.atad2_question_prefills
  ADD COLUMN contextual_hint text
    CHECK (contextual_hint IS NULL OR length(contextual_hint) <= 1000);
