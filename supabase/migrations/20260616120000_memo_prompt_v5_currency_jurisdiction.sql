-- Memo prompt v5: two wording/format conventions from a partner hand-edit.
-- Built from the live v4 text (no need to reproduce the full prompt) by two
-- targeted replace() inserts. Apply on the VM as supabase_admin. Verify v4 first:
--   select version, is_active from atad2_prompts where key='memo_system' order by version;
--
-- Changes vs v4 (nothing else touched; appendix block and all v3/v2 rules preserved):
--   1. CURRENCY: monetary amounts as ISO code "EUR 25,000", never the euro sign.
--      (Added to the "Formatting rules (strict)" block.)
--   2. JURISDICTION: name the country instead of the deictic "here", especially
--      when a sentence contrasts two jurisdictions. (Added to the technical
--      assessment "Style:" block, where "deducted here" was the failure case.)
--
-- NOT included on purpose: a reliance/limitation closing paragraph. That text is
-- already hardcoded in the Word template, so adding it to the prompt would
-- duplicate it in the memo.
--
-- No n8n change needed: these two do not introduce a new placeholder.

update public.atad2_prompts set is_active = false where key = 'memo_system' and is_active = true;

insert into public.atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
select
  'memo_system',
  5,
  replace(
    replace(
      system_prompt,
      -- 1. Currency formatting
      $a1$- Avoid vague or repetitive wording. Use direct phrasing.$a1$,
      $r1$- Avoid vague or repetitive wording. Use direct phrasing.
- Monetary amounts: write the ISO currency code followed by a space and the amount, e.g. "EUR 25,000". Never use the euro sign or any currency symbol.$r1$
    ),
    -- 2. Name the jurisdiction instead of "here"
    $a2$- Ensure the reader is guided through the assessment as a coherent story, not as a checklist.$a2$,
    $r2$- Ensure the reader is guided through the assessment as a coherent story, not as a checklist.
- Name the jurisdiction explicitly (e.g. "in the Netherlands", "in Belgium") rather than the deictic "here", especially when a sentence contrasts two jurisdictions. Write "the cost is deducted in the Netherlands but the income is not taxed in Belgium", not "deducted here".$r2$
  ),
  model,
  temperature,
  max_tokens,
  true,
  'v5: two partner conventions on top of v4. (1) Monetary amounts as ISO code "EUR 25,000", no euro sign. (2) Name the jurisdiction instead of deictic "here" when contrasting two jurisdictions. Reliance/limitation paragraph deliberately NOT added (already hardcoded in the Word template). Built from v4 text via two replace() inserts; no new placeholder, no n8n change.'
from public.atad2_prompts
where key = 'memo_system' and version = 4;
