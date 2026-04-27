-- Stage 2 also generates a session-level "additional context" suggestion
-- that the user can review/accept on the Confirmation screen, separate
-- from the per-question prefills.

ALTER TABLE atad2_prefill_jobs
  ADD COLUMN suggested_additional_context text;
