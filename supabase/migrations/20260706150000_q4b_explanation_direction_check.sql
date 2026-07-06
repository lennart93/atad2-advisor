-- Question 4b explanation: add an explicit DIRECTION CHECK.
--
-- Companion to swarm prompt v17. 4b asks whether the Dutch taxpayer makes
-- payments to a shareholder/participant that are deductible in the Netherlands
-- AND not included in that recipient's jurisdiction. That is one specific
-- direction: NL deducts, the FOREIGN recipient fails to include. On the WMC
-- group dossier the situation is the reverse: the Netherlands is the INCLUDING
-- side (a taxable pick-up at the Dutch parent above the hybrid entities), so 4b
-- must be answered "no". The swarm was answering "yes" because it pattern-matched
-- on the presence of hybrids / check-the-box without checking direction.
--
-- The client (src/hooks/usePrefill.ts) loads questions from atad2_questions
-- deduped by question_id and passes question_explanation to the swarm, so this
-- text reaches the model directly as {{question_explanation}}. All rows for
-- question_id = '4b' get the appended paragraph.
--
-- Re-runnable: the WHERE guard (NOT LIKE the sentinel phrase) means the
-- paragraph is appended at most once, whatever the current base text is (even if
-- it was edited live via the admin Questions editor). A trailing DO block RAISEs
-- if no 4b row ended up with the direction check.

UPDATE atad2_questions
SET question_explanation = question_explanation || E'\n\n' ||
  $expl$Establish the direction before answering. This question applies only where the Netherlands is the deducting jurisdiction and the foreign shareholder or participant is the one that does not include the corresponding income. If the Netherlands is instead the including jurisdiction, for example where there is a taxable pick-up in the Netherlands (such as at a Dutch parent above a hybrid entity), then the payment is included and the answer is "no", even if the structure contains hybrid entities, disregarded entities or check-the-box elections. A disregarded entity in another country does not, by itself, create a Dutch deduction without a corresponding foreign inclusion.$expl$
WHERE question_id = '4b'
  AND question_explanation IS NOT NULL
  AND question_explanation NOT LIKE '%Establish the direction before answering%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_questions
    WHERE question_id = '4b'
      AND question_explanation LIKE '%Establish the direction before answering%'
  ) THEN
    RAISE EXCEPTION 'q4b direction-check append did not land on any atad2_questions row for question_id = ''4b''. Check the question exists and its explanation is not NULL.';
  END IF;
END $$;
