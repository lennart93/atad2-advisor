-- Add facts_input_hash to atad2_appendix. Apply on the VM as supabase_admin.
-- Fingerprint of the Part A inputs (structure + documents + prompt version).
-- The refine pass reuses the stored Part A facts when this hash is unchanged,
-- so only Part B (the per-article swarm) re-runs against the new answers.
-- Idempotent.

alter table public.atad2_appendix add column if not exists facts_input_hash text;
