-- Reword Q12 (and align Q13/Q14) so the permanent-establishment sub-branch reads
-- payment-centric, consistent with Q9/Q10.
--
-- Q12 used to ask a bald "Does the recipient have a permanent establishment?". Every route
-- into Q12 arrives from a payment-flow question (Q9 pass-through, Q10 non-EU reach, Q11
-- exclusion), so the static "the recipient" phrasing (a) broke the tone of the flow and
-- (b) was ambiguous once the payment is passed on: the disregarded-PE mismatch can sit at
-- the direct recipient OR at an onward associated recipient. The indefinite, payment-centric
-- wording ("an associated enterprise that receives the payment") covers both without needing
-- a second parallel question, because Q13 (attribution) already resolves which recipient's
-- PE is relevant.
--
-- Q13/Q14 get a light touch only: "the recipient" -> "that recipient", so they read as the
-- recipient carrying the PE from Q12, not necessarily the direct Q5 recipient. No branching
-- change; next_question_id / risk_points untouched. Filtering on question_id updates all
-- answer_option rows for that question.

UPDATE public.atad2_questions
SET question = 'Does the payment, either directly or through onward payment, reach an associated enterprise (recipient) that has a permanent establishment?'
WHERE question_id = '12';

UPDATE public.atad2_questions
SET question = 'Are any of the payments or remunerations (partially) attributable to the permanent establishment of that recipient?'
WHERE question_id = '13';

UPDATE public.atad2_questions
SET question = 'Is the permanent establishment of that recipient recognized as such by the country where it is located?'
WHERE question_id = '14';
