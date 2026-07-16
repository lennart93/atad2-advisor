-- appendix_facts_system v22: the NL classification reason stops at the
-- legal-form comparison. The v21 example still closed with "; nothing indicates
-- Dutch residence or a Dutch permanent establishment, so it sits outside the
-- scope of Dutch CIT" and the model copies that clause verbatim into every
-- foreign entity's reason (Duhco S.A. dossier, 16 jul 2026). Lennart: that
-- nexus observation is not interesting there; the status key already records it.
--
-- Derived by REPLACE on the LIVE v21 row (single anchor = the v21 example
-- sentence plus its instruction tail, inserted by 20260716100000). Model /
-- template / temperature / max_tokens inherited from v21.
-- DRAFT, pending tax review (as v19-v21).
--
-- Flip order (partial unique index = one active row per key): demote active < 22
-- first, INSERT guarded by NOT EXISTS, trailing UPDATE re-asserts v22 active, DO
-- block RAISEs if the anchor did not match.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'appendix_facts_system' AND is_active = true AND version < 22;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'appendix_facts_system',
  22,
  REPLACE(
    v21.system_prompt,
    $a1$(e.g. "Luxembourg S.A., a corporate form comparable to a Dutch N.V., so it appears to be non-transparent for Dutch purposes; nothing indicates Dutch residence or a Dutch permanent establishment, so it sits outside the scope of Dutch CIT"). Lead with the legal-form comparison; a Dutch PE only determines WHICH non-transparent status applies ("nonresident_pe" instead of "outside_cit"), never whether the entity is transparent or non-transparent, so never present the presence or absence of a PE as the ground for the classification itself$a1$,
    $r1$(e.g. "Luxembourg S.A., a corporate form comparable to a Dutch N.V., so it appears to be non-transparent for Dutch purposes."). Lead with the legal-form comparison and stop there: do NOT mention Dutch residence, a Dutch PE or the scope of Dutch CIT in the reason at all. The status key already records the Dutch nexus ("resident", "nonresident_pe" or "outside_cit"); the reason only explains the classification$r1$
  ),
  v21.user_prompt_template,
  v21.model,
  v21.temperature,
  v21.max_tokens,
  true,
  'DRAFT, pending tax review. v22: the foreign-entity NL classification reason stops at the legal-form comparison; Dutch residence / PE / scope of Dutch CIT never appear in the reason (the status key records the nexus). Derived from live v21 via one REPLACE with a RAISE guard; model/template/temperature/max_tokens inherited. Flip: demote active < 22 first.'
FROM atad2_prompts v21
WHERE v21.key = 'appendix_facts_system' AND v21.version = 21
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'appendix_facts_system' AND version = 22
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'appendix_facts_system' AND version = 22;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'appendix_facts_system' AND version = 22 AND is_active = true
      AND system_prompt LIKE '%Lead with the legal-form comparison and stop there%'
      AND system_prompt NOT LIKE '%nothing indicates Dutch residence%'
  ) THEN
    RAISE EXCEPTION 'v22 REPLACE did not apply: the v21 example anchor changed on the live v21 prompt. Inspect the live v21 system_prompt and update the anchor.';
  END IF;
END $$;
