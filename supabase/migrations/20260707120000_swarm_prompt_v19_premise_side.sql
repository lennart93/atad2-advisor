-- Swarm prompt v19: QUESTION PREMISE + its SIDE, on top of v18.
--
-- Companion to the frontend "Question context" block (questionPremise.ts), which
-- now tells the swarm WHY each question is reached (the earlier answers that
-- route here, derived from the decision tree). v19 tells the model how to USE
-- that premise: verify it against the facts, and distinguish the taxpayer's own
-- side (a premise the facts show is absent -> a grounded negative, not a client
-- question) from the foreign counterparty's side (genuinely a client question).
--
-- Fixes the observation that clear own-side negatives (no foreign PE, no such
-- payment) were being routed to the client as "unknown" (Route B) instead of a
-- definitive "no". Signed off by Lennart as the intended fiscal behaviour;
-- remains DRAFT, pending tax review, until the checklist rules are formally
-- confirmed.
--
-- Derived by REPLACE on the LIVE v18 row: insert Rule 19 before the FINAL CHECK,
-- renumber "18. FINAL CHECK" to "20. FINAL CHECK", and add one FINAL CHECK
-- bullet. Model / template / temperature / max_tokens inherited from v18.
--
-- Flip: demote active < 19 first, INSERT guarded by NOT EXISTS, re-assert active,
-- DO block RAISEs if an anchor did not match.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'prefill_swarm_system' AND is_active = true AND version < 19;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'prefill_swarm_system',
  19,
  REPLACE(
    v18.system_prompt,
    $a$18. FINAL CHECK before emitting JSON. Verify:$a$,
    $ra$19. QUESTION PREMISE AND ITS SIDE. A "Question context" block in the question explanation states the premise under which this question is reached (the earlier answers in the ATAD2 flow that route here). Test that premise against the facts and the fact sheet before answering. If the premise concerns the taxpayer's OWN structure (a foreign permanent establishment, a specific payment, a hybrid entity on the Dutch side) and the facts affirmatively show it is ABSENT, answer with a grounded negative, that the condition is not triggered, citing the evidence, rather than routing it to the client as unknown. Reserve the client-question route for facts that are genuinely on the FOREIGN COUNTERPARTY's side (its tax treatment, whether its permanent establishment is recognised by its own country) which the Dutch documents cannot establish. Do not send a question to the client when the documents already settle its premise on the Dutch side.

20. FINAL CHECK before emitting JSON. Verify:$ra$
  ),
  v18.user_prompt_template,
  v18.model,
  v18.temperature,
  v18.max_tokens,
  true,
  'DRAFT, pending tax review (Lennart-approved intent). v19: v18 plus QUESTION PREMISE AND ITS SIDE (Rule 19). Uses the frontend "Question context" premise block: verify the premise; an own-side premise the facts show absent -> grounded negative (not triggered), not a client question; reserve the client route for genuine foreign-counterparty facts. Old "18. FINAL CHECK" renumbered to 20. Derived from live v18 via REPLACE with a RAISE guard. Model/template/temperature/max_tokens inherited. Flip: demote active < 19 first.'
FROM atad2_prompts v18
WHERE v18.key = 'prefill_swarm_system' AND v18.version = 18
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'prefill_swarm_system' AND version = 19
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'prefill_swarm_system' AND version = 19;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'prefill_swarm_system' AND version = 19
      AND system_prompt LIKE '%19. QUESTION PREMISE AND ITS SIDE.%'
      AND system_prompt LIKE '%20. FINAL CHECK before emitting JSON. Verify:%'
      AND system_prompt LIKE '%Reserve the client-question route for facts that are genuinely on the FOREIGN COUNTERPARTY%'
  ) THEN
    RAISE EXCEPTION 'v19 REPLACE did not apply: the v18 FINAL-CHECK anchor likely changed. Inspect the live v18 system_prompt and update the anchor.';
  END IF;
END $$;
