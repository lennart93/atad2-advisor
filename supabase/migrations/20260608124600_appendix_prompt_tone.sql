-- Soften the appendix_system reasoning tone: measured, advisory phrasing
-- ("we understand that", "it appears that") instead of categorical statements.
-- Idempotent (no-op once applied). Apply on the VM as supabase_admin.
update public.atad2_prompts
set system_prompt = replace(
  system_prompt,
  'no answer ids, no field names).',
  'no answer ids, no field names). Write it in a measured, advisory tone (a tax adviser''s working view, not a definitive ruling): prefer tentative phrasing such as "we understand that", "it appears that", "based on the available information" and "we have assumed that", and avoid absolute or categorical statements.'
)
where key = 'appendix_system'
  and system_prompt not like '%a tax adviser''s working view%';
