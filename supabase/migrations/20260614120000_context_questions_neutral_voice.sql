-- Neutralise first-person tool-narration in the context-question prompts.
-- These prompts are shown to the advisor when they pick an answer; the app's
-- voice should not sound like a person actively doing the work ("our analysis",
-- "we're in the right place"). Switch to a neutral voice, keeping the friendly tone.
-- The encouragement copy and second-person "you" phrasing are left intact.
-- Run as supabase_admin (table is owned by supabase_admin, not postgres):
--   docker exec -i $(docker ps --filter name=supabase-db -q) \
--     psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20260614120000_context_questions_neutral_voice.sql

BEGIN;

-- was: "...might be relevant for our analysis."
UPDATE atad2_context_questions
SET context_question = 'Great, a Dutch tax resident! Feel free to share any additional context about the entity that might be relevant for the analysis.'
WHERE id = '037e602b-dc71-46cd-9afd-1468ca67947f';

-- was: "Perfect, that means we're in the right place. ..."
UPDATE atad2_context_questions
SET context_question = 'Perfect, that confirms this is the right place. Any background information you''d like to add is more than welcome.'
WHERE id = '2e1e1bbb-20bd-44df-82f3-4047b8875f12';

-- was: "...might be relevant for our analysis."
UPDATE atad2_context_questions
SET context_question = 'Got it, there are branches abroad. Feel free to provide any background that might be relevant for the analysis.'
WHERE id = '31207e4b-92e1-4a86-bd88-d4d1ddf77d0e';

-- was: "You've got our attention! ..."
UPDATE atad2_context_questions
SET context_question = 'This stands out. A structured arrangement is a major focus. Feel free to share any context about how this was set up.'
WHERE id = '41ca73e8-3932-4241-a0ea-2cadb35cab01';

-- was: "Got it, so we're looking at the Dutch branch of a foreign company. ..."
UPDATE atad2_context_questions
SET context_question = 'Got it, so this is the Dutch branch of a foreign company. Any additional details you''d like to provide are welcome.'
WHERE id = '5b9202ae-72df-44b6-af2f-a1e2a373aa01';

-- was: "Great, let's take a look at the corporate family tree! ..."
UPDATE atad2_context_questions
SET context_question = 'Great, time to look at the corporate family tree! Feel free to share any context about the structure that might be helpful.'
WHERE id = '9562a952-5989-4270-ba2c-f395832d415e';

-- was: "...This is exactly what we need to explore. ..."
UPDATE atad2_context_questions
SET context_question = 'A textbook D/NI outcome! This is exactly the point to explore. Any additional details are more than welcome.'
WHERE id = '9ff816d4-1683-416b-a597-0f5c2f8593f4';

-- was: "...any context that might help us understand the situation better."
UPDATE atad2_context_questions
SET context_question = 'A textbook deduction without inclusion scenario! Feel free to share any context that might help clarify the situation.'
WHERE id = 'a43ba0d2-7e52-4e6b-a639-2d37022457c4';

-- was: "...about this PE setup that could help our analysis."
UPDATE atad2_context_questions
SET context_question = 'Interesting, a foreign company with Dutch roots! Feel free to share any context about this PE setup that could help the analysis.'
WHERE id = 'cac044c3-cb50-4f68-8ff8-feb2336b3ff3';

COMMIT;
