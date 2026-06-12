-- Appendix prompt v5: ground the article reasoning on the Part A facts.
-- Inserts an ESTABLISHED FACTS section (with the {{FACTS_BLOCK}} placeholder)
-- before the INPUTS. Apply on the VM as supabase_admin. Idempotent.
update public.atad2_prompts
set
  version = 5,
  system_prompt = replace(
    system_prompt,
    '=== INPUTS ===',
    '=== ESTABLISHED FACTS (Part A) ===
Reference these by entity name; the ids E#/T# are internal. Do not re-derive them.
{{FACTS_BLOCK}}

=== INPUTS ==='
  )
where key = 'appendix_system' and system_prompt not like '%ESTABLISHED FACTS%';
