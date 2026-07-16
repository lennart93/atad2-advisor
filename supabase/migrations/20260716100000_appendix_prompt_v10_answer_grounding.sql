-- appendix_system v10: recorded client answers can DECIDE a row.
--
-- Trigger (advisor review, 16 Jul 2026): a dossier with questionnaire outcome
-- "No risk identified" (every driving question answered "No") still produced
-- "Insufficient information" on rows 3.7 / 6.2 / 6.3. Root cause: the edge
-- function sent the answers as bare "Q19 answer: No" (no question text) and
-- stripped drivenByQuestionIds from the skeleton JSON, so the model could not
-- connect the client's explicit "No" to the row it decides and fell back on
-- the fact sheet, which is silent on foreign deductions.
--
-- Pairs with the generate-appendix edge function change that (a) includes the
-- full question text in ANSWERS_BLOCK and (b) passes drivenByQuestionIds per
-- skeleton row. DEPLOY ORDER: edge function FIRST, then this migration (the
-- block below refers to inputs only the new edge function provides; the new
-- edge function is harmless under v9).
--
-- Built by INSERT from the live v9 row (append pattern, like v9 on v8), so it
-- carries all earlier blocks verbatim and only adds this one.
-- Model / template / temperature / max_tokens inherited.
-- DRAFT, pending tax review.
--
-- Flip: demote active < 10, INSERT guarded by NOT EXISTS, re-assert active,
-- RAISE if the v9 source row was missing.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'appendix_system' AND is_active = true AND version < 10;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'appendix_system',
  10,
  v9.system_prompt || E'\n\n' || $ansgnd$=== RECORDED CLIENT ANSWERS DECIDE THEIR ROWS ===
ANSWERS_BLOCK lists the intake questions with their full question text and the recorded answer. A skeleton row may carry drivenByQuestionIds: the numbers of the questions that test exactly that row's condition.

- A recorded answer on a driving question is a deciding fact for that row, on a par with the fact sheet. An explicit "No" on the question that asks for the row's mismatch or condition means that condition is not present on the file: the row is "Not triggered", not "Insufficient information". An explicit "Yes" means the condition is present, or must be assessed as potentially firing against the other facts.
- Use "Insufficient information" for a reachable row ONLY when its driving questions are unanswered or answered "unknown" AND the fact sheet, established facts and evidence notes do not decide the condition either.
- Silence in the fact sheet or the documents does NOT override an explicit answer. The absence of a fact is not a contradiction. Only an affirmative contradiction (the fact sheet or established facts state the opposite of the answer) sets the answer aside; in that case return "Insufficient information" and name the contradiction in the reasoning.
- Wording stays under the SOURCE REFERENCES rule: never name the question, the question number or the questionnaire in the reasoning. Where the recorded answer is the deciding ground, state it as a client confirmation, for example: "The group has confirmed that these costs are deducted only in the Netherlands. No double deduction arises." Put the question ids (for example Q19) in provenance.$ansgnd$,
  v9.user_prompt_template,
  v9.model,
  v9.temperature,
  v9.max_tokens,
  true,
  'DRAFT, pending tax review. v10: v9 plus RECORDED CLIENT ANSWERS DECIDE THEIR ROWS (advisor review 16 Jul 2026): ANSWERS_BLOCK now carries full question text and skeleton rows carry drivenByQuestionIds (edge function change, deploy edge first); an explicit answer on a driving question decides the row (No = Not triggered, Yes = present/assess), Insufficient information only when the driving questions are unanswered/unknown AND the facts do not decide either; document silence never overrides an explicit answer, only an affirmative contradiction does; reasoning states the fact or a client confirmation, question ids go in provenance. Built by INSERT from live v9; model/template/temperature/max_tokens inherited.'
FROM atad2_prompts v9
WHERE v9.key = 'appendix_system' AND v9.version = 9
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'appendix_system' AND version = 10
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'appendix_system' AND version = 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'appendix_system' AND version = 10
      AND system_prompt LIKE '%=== RECORDED CLIENT ANSWERS DECIDE THEIR ROWS%'
      AND system_prompt LIKE '%drivenByQuestionIds%'
      AND system_prompt LIKE '%=== SOURCE REFERENCES AND CADENCE%'
  ) THEN
    RAISE EXCEPTION 'appendix_system v10 did not apply: the source v9 row is missing or inactive. Deploy v9 first, then re-run this migration.';
  END IF;
END $$;
