-- Add `committed_text` to atad2_question_prefills.
-- Stores the exact text the user accepted (Accept) or edited-then-saved (Edit).
-- This lets the UI render the AI portion as a read-only "locked" block above
-- the explanation textarea, while atad2_answers.explanation keeps the combined
-- text (committed_text + user notes) for downstream reports and PDFs.
--
-- We intentionally do NOT backfill historical rows: existing accepted prefills
-- will fall back to suggested_toelichting at render time (see SuggestionCard).

ALTER TABLE public.atad2_question_prefills
  ADD COLUMN committed_text text;
