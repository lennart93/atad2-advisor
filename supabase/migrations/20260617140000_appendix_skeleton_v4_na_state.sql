-- Appendix skeleton v4: add "N/A" to the controlled status vocabulary.
-- Apply on the VM as supabase_admin. Idempotent (a plain UPDATE).
--
-- "N/A" is now part of the single status set used on the condition screen and in
-- the memo: a satisfied scope/definition gate, or a condition that is moot
-- because the trigger above it is absent. The generate-appendix edge function
-- validates the model's status against this list (statuses outside it fall back
-- to "Insufficient information"), and the front-end status dropdown is built from
-- it, so both must allow "N/A" before the prompt v4 / safety net can emit it.
--
-- Order matches src/lib/appendix/status.ts STATUS_VALUES and skeleton.ts:
--   Not triggered, N/A, Triggered, Insufficient information.

update public.atad2_appendix_skeleton
set allowed_states = '["Not triggered","N/A","Triggered","Insufficient information"]'::jsonb;
