-- Swarm prompt v20: TERMINOLOGY + STYLE + HYBRID-vs-REVERSE-HYBRID, on v19.
--
-- Advisor feedback on the live suggestions:
--   * write "non-transparent", never "opaque";
--   * write "transaction", never "flow"/"flows";
--   * plainer corporate prose, not storytelling ("both are held below X", not
--     "both sit beneath the Dutch parent ...");
--   * do not label an entity that is non-transparent in NL and transparent
--     abroad a "reverse hybrid" (it is a hybrid entity); a reverse hybrid is the
--     distinct NL outcome (art 2(12) CIT Act), a separate concept.
--
-- Derived by REPLACE on the LIVE v19 row: insert Rules 21-22 before the FINAL
-- CHECK and renumber "20. FINAL CHECK" to "23. FINAL CHECK". Model / template /
-- temperature / max_tokens inherited from v19.
--
-- DRAFT, pending tax review (the hybrid/reverse-hybrid wording awaits confirm).
-- Flip: demote active < 20 first, INSERT guarded, re-assert, DO block RAISE.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'prefill_swarm_system' AND is_active = true AND version < 20;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'prefill_swarm_system',
  20,
  REPLACE(
    v19.system_prompt,
    $a$20. FINAL CHECK before emitting JSON. Verify:$a$,
    $ra$21. TERMINOLOGY AND STYLE. Write "non-transparent", never "opaque". Write "transaction", never "flow" or "flows". Keep the prose plain and corporate, not narrative: state the fact directly (for example "both are held below WMC Group B.V.") rather than a storytelling clause (for example "both sit beneath the Dutch parent ..."). Do not over-explain; a short factual statement is better than a paragraph.

22. HYBRID VERSUS REVERSE HYBRID. An entity that is non-transparent in the Netherlands and transparent in another state (for example a Dutch B.V. that is disregarded in the United States under a check-the-box election) is a hybrid entity. Do NOT call such an entity a reverse hybrid. A reverse hybrid is the distinct Dutch outcome where an entity is transparent in the Netherlands but treated as non-transparent by the state of its participants (article 2(12) of the Dutch Corporate Income Tax Act); it is a separate concept and is not what a "is the recipient a hybrid entity" question asks about.

23. FINAL CHECK before emitting JSON. Verify:$ra$
  ),
  v19.user_prompt_template,
  v19.model,
  v19.temperature,
  v19.max_tokens,
  true,
  'DRAFT, pending tax review. v20: v19 plus TERMINOLOGY AND STYLE (non-transparent not opaque; transaction not flow/flows; plain corporate prose, not narrative) and HYBRID VERSUS REVERSE HYBRID (a NL-non-transparent / abroad-transparent entity is a hybrid, not a reverse hybrid; reverse hybrid = art 2(12), the transparent-in-NL outcome). Old "20. FINAL CHECK" renumbered to 23. Derived from live v19 via REPLACE with a RAISE guard. Model/template/temperature/max_tokens inherited. Flip: demote active < 20 first.'
FROM atad2_prompts v19
WHERE v19.key = 'prefill_swarm_system' AND v19.version = 19
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'prefill_swarm_system' AND version = 20
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'prefill_swarm_system' AND version = 20;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'prefill_swarm_system' AND version = 20
      AND system_prompt LIKE '%21. TERMINOLOGY AND STYLE.%'
      AND system_prompt LIKE '%22. HYBRID VERSUS REVERSE HYBRID.%'
      AND system_prompt LIKE '%23. FINAL CHECK before emitting JSON. Verify:%'
      AND system_prompt LIKE '%never "opaque"%'
      AND system_prompt LIKE '%never "flow" or "flows"%'
  ) THEN
    RAISE EXCEPTION 'v20 REPLACE did not apply: the v19 FINAL-CHECK anchor likely changed. Inspect the live v19 system_prompt and update the anchor.';
  END IF;
END $$;
