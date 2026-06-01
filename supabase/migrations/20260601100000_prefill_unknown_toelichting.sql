-- Add `suggested_toelichting_unknown` to atad2_question_prefills.
-- This column is populated by the swarm IN ADDITION TO contextual_hint when
-- the model takes Route B (documents do not derive an answer, so the user is
-- expected to pick "Unknown"). It is the same factual content as the hint but
-- reframed in user-voice as the explanation the advisor would type when
-- selecting Unknown: parties, percentages and dates restated as concrete gaps.
-- Routing invariant (enforced in the Zod refinement, not the DB):
--   - contextual_hint populated  -> suggested_toelichting_unknown SHOULD be populated
--   - contextual_hint null       -> suggested_toelichting_unknown MUST be null
-- No CHECK constraint, mirroring the contextual_hint migration: a bad LLM
-- payload should not 500 the row insert; the edge function is the gatekeeper.

ALTER TABLE public.atad2_question_prefills
  ADD COLUMN suggested_toelichting_unknown text
    CHECK (suggested_toelichting_unknown IS NULL OR length(suggested_toelichting_unknown) <= 1000);
