-- Bump factsheet_merge_system output budget: on the WMC dossier (19 documents)
-- the merged fact sheet JSON was truncated at ~16k tokens, so build-factsheet
-- failed with "Expected ',' or ']' after array element" and no factsheet was
-- ever produced. Opus 4.8 supports 32k output tokens; give the merge room to
-- close the JSON on large groups.
--
-- Scoped to the active row so historical versions keep their label. Re-runnable.
UPDATE public.atad2_prompts
   SET max_tokens = 32000
 WHERE key = 'factsheet_merge_system' AND is_active = true AND max_tokens < 32000;
