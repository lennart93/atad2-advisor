-- Q6 "Is at least one of these recipients a hybrid entity? = Yes" is a GATE, not a
-- mismatch. The mere existence of a hybrid recipient does not create a hybrid
-- mismatch: the risk only materialises when the corresponding income is not
-- included (deduction without inclusion). That is already tested downstream by
-- Q8 ("...corresponding income at the level of the recipient included in a tax
-- base for a profit tax within a reasonable period...?"), where the "No" answer
-- carries risk_points 1.00.
--
-- Previously Q6 = Yes carried 1.00 by itself, which alone meets the
-- risk_identified threshold (final_score >= 1.0). Because the score only ever
-- sums (the only negative row in the tree is Q4d), a later Yes on Q6 could not
-- be neutralised by a "picked up in NL" answer on Q8 -> false positive
-- "ATAD2 risk identified" for structures where the mismatch is neutralised by a
-- Dutch taxable pick-up.
--
-- Fix: Q6 = Yes -> 0.00 (a gate that only routes forward). The 1.00 stays on the
-- inclusion question (Q8 = No). Q6 = No / Unknown are already 0.00 / 0.10 and
-- are left untouched. Existing sessions keep their stored final_score; only new
-- or re-run assessments pick this up.

UPDATE public.atad2_questions
SET risk_points = '0.00',
    updated_at = now()
WHERE question_id = '6'
  AND answer_option = 'Yes';
