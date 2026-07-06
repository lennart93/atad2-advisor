-- Swarm prompt v17: ANSWER-NARRATIVE CONSISTENCY + DIRECTION CHECK on top of v16.
--
-- Problem (flagged by Lennart on the WMC group dossier): the swarm answers
-- question 4b ("Does the Dutch taxpayer make payments ... deductible for Dutch
-- tax purposes AND not included in the taxable base of that shareholder under
-- the recipient's jurisdiction?") with "yes" even though its OWN toelichting
-- correctly concludes there is a taxable pick-up in the Netherlands and no
-- deduction-without-inclusion is expected. Two causes:
--   1. Each question is answered in isolation (the swarm fires one call per
--      question), so the group-level conclusion never carries over.
--   2. On a mismatch-trigger question the model pattern-matches on "hybrid
--      entity + check-the-box -> D/NI = yes" WITHOUT establishing the DIRECTION:
--      which jurisdiction deducts and which includes. In the WMC case the
--      Netherlands is the INCLUDING side (pick-up at the Dutch parent above the
--      hybrids), which is the reverse of what 4b describes, so 4b must be "no".
--
-- v17 adds ONE new rule (a general answer/narrative consistency + direction
-- check) as Rule 13, renumbers the old "13. FINAL CHECK" to "14. FINAL CHECK",
-- and adds one bullet to the FINAL CHECK list. The 4b question_explanation is
-- sharpened separately (companion migration ..._q4b_explanation_direction_check).
--
-- The new Rule 13 text (as inserted):
--   13. ANSWER CONSISTENT WITH YOUR OWN REASONING (direction check). The
--   suggested_answer must follow from, and never contradict, your own
--   answer_rationale and suggested_toelichting. Before answering "yes" to any
--   question that triggers a hybrid-mismatch risk (a deduction without
--   inclusion, a double deduction, or a non-inclusion), first establish the
--   DIRECTION: which jurisdiction takes the deduction and which jurisdiction
--   includes the corresponding income. A "yes" is correct only when the
--   deduction and the missing inclusion actually sit on the sides the question
--   describes. If your own reasoning concludes that the corresponding income IS
--   included or picked up somewhere (for instance a taxable pick-up in the
--   Netherlands, such as at a Dutch parent above a hybrid entity), or that the
--   mismatch is otherwise neutralised, the answer is "no", not "yes". The mere
--   presence of hybrid entities, disregarded entities or check-the-box elections
--   in the structure is not, by itself, a "yes".
--
-- Derivation via REPLACE on the LIVE v16 row (not a hand-retyped literal) so the
-- rest of the prompt stays byte-identical to whatever is active on the VM, even
-- if it was tuned there. A trailing DO block RAISEs if either anchor failed to
-- match, so a silent no-op REPLACE cannot ship an unchanged prompt.
--
-- Model / template / temperature / max_tokens are inherited from v16 unchanged.
-- No JSON-shape change, so the prefill-documents EDGE FUNCTION NEEDS NO REDEPLOY
-- and compose_client_letter is unaffected.
--
-- Flip order matters (partial unique index uniq_atad2_prompts_active = one active
-- row per key): demote the current active row FIRST, then insert v17 active.
-- Re-runnable: demote only versions < 17, INSERT guarded by NOT EXISTS, trailing
-- UPDATE re-asserts v17 active.

-- 1. Demote the current active row (v16) before inserting a new active one.
UPDATE atad2_prompts
SET is_active = false
WHERE key = 'prefill_swarm_system' AND is_active = true AND version < 17;

-- 2. Insert v17, derived from v16 by two REPLACEs.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'prefill_swarm_system',
  17,
  REPLACE(
    REPLACE(
      v16.system_prompt,
      $a$13. FINAL CHECK before emitting JSON. Verify:$a$,
      $ra$13. ANSWER CONSISTENT WITH YOUR OWN REASONING (direction check). The suggested_answer must follow from, and never contradict, your own answer_rationale and suggested_toelichting. Before answering "yes" to any question that triggers a hybrid-mismatch risk (a deduction without inclusion, a double deduction, or a non-inclusion), first establish the DIRECTION: which jurisdiction takes the deduction and which jurisdiction includes the corresponding income. A "yes" is correct only when the deduction and the missing inclusion actually sit on the sides the question describes. If your own reasoning concludes that the corresponding income IS included or picked up somewhere (for instance a taxable pick-up in the Netherlands, such as at a Dutch parent above a hybrid entity), or that the mismatch is otherwise neutralised, the answer is "no", not "yes". The mere presence of hybrid entities, disregarded entities or check-the-box elections in the structure is not, by itself, a "yes".

14. FINAL CHECK before emitting JSON. Verify:$ra$
    ),
    $b$    If any of these is violated, fix it before emitting.$b$,
    $rb$    - suggested_answer does not contradict your own answer_rationale or suggested_toelichting; if your reasoning says the corresponding income is included or picked up (for instance a taxable pick-up in the Netherlands) or that the mismatch is neutralised, the answer is not "yes" (Rule 13).
    If any of these is violated, fix it before emitting.$rb$
  ),
  v16.user_prompt_template,
  v16.model,
  v16.temperature,
  v16.max_tokens,
  true,
  'v17: v16 plus ANSWER-NARRATIVE CONSISTENCY + DIRECTION CHECK. Fixes the swarm answering hybrid-mismatch trigger questions (notably 4b) with "yes" while its own toelichting concludes there is a taxable pick-up in NL / no D/NI. New Rule 13 forces suggested_answer to follow from the model''s own rationale/toelichting and to establish the direction (who deducts, who includes) before a "yes"; a taxable pick-up in the Netherlands (e.g. a Dutch parent above a hybrid) means "no", and hybrid/disregarded/check-the-box presence alone is not a "yes". Old "13. FINAL CHECK" renumbered to 14, one FINAL CHECK bullet added. Derived from the live v16 row via REPLACE (byte-identical remainder) with a RAISE guard if anchors do not match. No JSON-shape change: no edge-function redeploy, compose_client_letter unaffected. Model/template/temperature/max_tokens inherited from v16. Flip order: demote active < 17 first, INSERT guarded by NOT EXISTS, trailing UPDATE re-asserts v17 active. Companion: q4b explanation direction-check migration.'
FROM atad2_prompts v16
WHERE v16.key = 'prefill_swarm_system' AND v16.version = 16
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts
  WHERE key = 'prefill_swarm_system' AND version = 17
);

-- 3. Re-assert v17 active on rerun (INSERT only sets is_active on first insert).
UPDATE atad2_prompts SET is_active = true
WHERE key = 'prefill_swarm_system' AND version = 17;

-- 4. Fail loudly if either REPLACE anchor did not match (silent no-op guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'prefill_swarm_system' AND version = 17
      AND system_prompt LIKE '%13. ANSWER CONSISTENT WITH YOUR OWN REASONING%'
      AND system_prompt LIKE '%14. FINAL CHECK before emitting JSON. Verify:%'
      AND system_prompt LIKE '%does not contradict your own answer_rationale%'
  ) THEN
    RAISE EXCEPTION 'v17 REPLACE did not apply: Rule 13, renumbered FINAL CHECK, or the FINAL CHECK bullet is missing. The v16 anchor strings likely changed on the VM; inspect the live v16 system_prompt and update the anchors.';
  END IF;
END $$;
