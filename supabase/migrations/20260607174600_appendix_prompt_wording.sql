-- Reword "limb" out of the live appendix_system prompt to plain wording.
-- Apply on the VM as supabase_admin. Idempotent (no-op if already reworded).
update public.atad2_prompts
set system_prompt = replace(
  replace(system_prompt, 'then this limb engages', 'then this provision applies'),
  'hybrid-entity limbs', 'hybrid-entity cases'
)
where key = 'appendix_system';
