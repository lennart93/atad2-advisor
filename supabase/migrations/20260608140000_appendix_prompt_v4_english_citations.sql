-- Appendix prompt v4: anglicize the legal-accuracy guard citations
-- ("lid" -> "par.") to match the English skeleton. Idempotent. Apply as supabase_admin.
update public.atad2_prompts
set
  version = 4,
  system_prompt = replace(replace(replace(replace(replace(replace(
    system_prompt,
    'art. 12ac lid 2', 'art. 12ac par. 2'),
    'art. 2 lid 11', 'art. 2 par. 11'),
    'art. 2 lid 12', 'art. 2 par. 12'),
    'art. 2 lid 3', 'art. 2 par. 3'),
    'art. 12aa lid 3', 'art. 12aa par. 3'),
    'art. 15e lid 9', 'art. 15e par. 9')
where key = 'appendix_system';
