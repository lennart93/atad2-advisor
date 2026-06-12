-- Memo prompt v4: feed the confirmed technical appendix into the memo.
-- Builds v4 from the live v3 text (no need to reproduce the full prompt) by
-- inserting {{CONFIRMED_APPENDIX_BLOCK}} right after the documents block.
-- Apply on the VM as supabase_admin. Verify v3 exists first:
--   select version, is_active from atad2_prompts where key='memo_system' order by version;
--
-- The n8n "Build prompt + metrics" node must also be updated to replace
-- {{CONFIRMED_APPENDIX_BLOCK}} with the incoming confirmed_appendix (or "").

update public.atad2_prompts set is_active = false where key = 'memo_system' and is_active = true;

insert into public.atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
select
  'memo_system',
  4,
  replace(
    system_prompt,
    '{{DOCUMENTS_BLOCK_FORMATTED}}',
    '{{DOCUMENTS_BLOCK_FORMATTED}}' || E'\n\n{{CONFIRMED_APPENDIX_BLOCK}}\nThe confirmed technical appendix above is authoritative. Base the ATAD2 technical assessment on it and do not contradict any of its conclusions. Keep using plain language and do not cite article numbers in the memo body.'
  ),
  model,
  temperature,
  max_tokens,
  true,
  'v4: feed the confirmed technical appendix via {{CONFIRMED_APPENDIX_BLOCK}}, inserted after the documents block; memo must not contradict it. Built from v3 text.'
from public.atad2_prompts
where key = 'memo_system' and version = 3;
