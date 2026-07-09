-- Q4 (reverse hybrid) title.
--
-- The assessment screen shows the pending question's title from the answer_option='Yes'
-- row. Migration 20260706170000 only retitled the 'No' row, so the app kept showing the
-- old "Transparent treatment". Keep that familiar label but flag the reverse-hybrid context.
-- Applied to every answer_option row of question_id '4' so the title is consistent.

UPDATE public.atad2_questions
SET question_title = 'Transparent treatment (reverse hybrid)'
WHERE question_id = '4';
