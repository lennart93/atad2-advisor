-- Fix Q4 (reverse hybrid, art. 2) directionality.
--
-- Q4 previously asked whether the associated shareholder/participant treats the Dutch
-- entity as TRANSPARENT. That is the normal-hybrid direction and the OPPOSITE of a reverse
-- hybrid. A genuine Dutch reverse hybrid (art. 2 para. 11 Wet Vpb / ATAD2 art. 9a) is:
--   the Netherlands treats the entity as transparent, while the associated participant's
--   state treats that same entity as a separate, independently taxable (non-transparent)
--   entity. Under the old wording the real reverse hybrid answered Q4 "No", so appendix
--   section 8 (reverse hybrid) never fired -> false negative.
--
-- This flips the question, its explanation and the two directional context prompts to the
-- reverse-hybrid direction. Matches the corrected appendix skeleton row 8.1 (hard-coded in
-- src/lib/appendix/skeleton.ts + supabase/functions/generate-appendix/skeletonRows.ts).

UPDATE public.atad2_questions
SET question = 'Are any of the shareholder(s) or participant(s) an associated enterprise of the Dutch entity that, based on their own local tax law, treat the Dutch entity as a separate taxable entity (non-transparent), while the Netherlands treats it as tax transparent?',
    question_explanation = 'For the purpose of this question, the Dutch entity (typically a partnership such as a CV, VOF or maatschap) is treated as tax transparent in the Netherlands, meaning its income, expenses and losses are attributed directly to its participants. A reverse-hybrid classification conflict arises where an associated shareholder or participant, under its own local tax law, instead treats that same Dutch entity as a separate taxable entity (non-transparent), so that its income is not currently taxed at either level. Article 2 paragraph 11 CIT Act then treats the Dutch entity itself as a Dutch taxpayer.'
WHERE question_id = '4';

UPDATE public.atad2_questions
SET question_title = 'Reverse-hybrid classification conflict'
WHERE id = 'd92f2774-5823-4da4-8014-577f97d6e21a';

UPDATE public.atad2_context_questions
SET context_question = 'Interesting, so the Dutch entity is a chameleon - transparent here in the Netherlands, but a separate taxpayer abroad! Feel free to share any relevant details.'
WHERE id = 'b430c2ab-a6b0-4c34-9b0e-c4bb5588a50e';

UPDATE public.atad2_context_questions
SET context_question = 'Fascinating - a shareholder that treats the Dutch entity as a company in its own right! Feel free to share any context about this ''reverse hybrid'' setup.'
WHERE id = 'c909695a-5625-467b-a014-9f5120d120c6';
