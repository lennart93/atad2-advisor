-- Appendix facts prompt v2: feed the documents block into the proposal so it can
-- populate the classification matrix + transactions even before the questions are
-- answered. Apply on the VM as supabase_admin. Idempotent.
update public.atad2_prompts
set version = 2,
    system_prompt = replace(
      system_prompt,
      'ENTITY_REGISTER:',
      'DOCUMENTS:
{{DOCUMENTS_BLOCK}}

ENTITY_REGISTER:'
    )
where key = 'appendix_facts_system' and system_prompt not like '%{{DOCUMENTS_BLOCK}}%';
