-- Iteration 3: per-question swarm replaces Stage 1 + Stage 2.
-- Per-question prefill rows now also carry a suggested answer + confidence
-- + a one-sentence rationale. The intermediate document-summaries table
-- is dropped (no live data depends on it).

ALTER TABLE atad2_question_prefills
  ADD COLUMN IF NOT EXISTS suggested_answer text
    CHECK (suggested_answer IS NULL OR suggested_answer IN ('yes', 'no', 'unknown')),
  ADD COLUMN IF NOT EXISTS confidence_pct integer
    CHECK (confidence_pct IS NULL OR (confidence_pct >= 0 AND confidence_pct <= 100)),
  ADD COLUMN IF NOT EXISTS answer_rationale text
    CHECK (answer_rationale IS NULL OR length(answer_rationale) <= 200);

DROP TABLE IF EXISTS atad2_document_summaries;
