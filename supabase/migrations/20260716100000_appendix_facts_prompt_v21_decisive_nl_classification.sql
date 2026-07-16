-- appendix_facts_system v21: the NL classification of a foreign entity is DECIDED,
-- not left open, and a Dutch PE never appears as the ground for it.
--
-- Why (Duhco S.A. case, 16 jul 2026): the model returned nl status "unknown" for
-- every foreign entity while writing a reason that itself concluded
-- non-transparent, copying the v19 example's "no Dutch PE is indicated" clause.
-- Two defects in item 1/2 of the live prompt caused that:
--   1. "Use 'unknown' if the inputs do not support a choice" let uncertainty
--      about the Dutch NEXUS (resident / PE / outside CIT) spill over into the
--      CLASSIFICATION, which only depends on the legal form via the
--      rechtsvormvergelijking (and the grounded literature lists answer that
--      for every common corporate form, pre- and post-2025 alike).
--   2. The item-2 example led with "no Dutch PE indicated", teaching the model
--      to present a PE observation as classification reasoning. A PE only picks
--      WHICH non-transparent status applies, never whether the entity is
--      transparent.
--
-- Derived by REPLACE on the LIVE v20 row (v20 = v19 + factsheet block; items 1/2
-- are byte-identical to v19). Two anchors, both inherited verbatim from v19.
-- Model / template / temperature / max_tokens inherited from v20.
-- DRAFT, pending tax review (as v19/v20).
--
-- Flip order (partial unique index = one active row per key): demote active < 21
-- first, INSERT guarded by NOT EXISTS, trailing UPDATE re-asserts v21 active, DO
-- block RAISEs if either anchor did not match.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'appendix_facts_system' AND is_active = true AND version < 21;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'appendix_facts_system',
  21,
  REPLACE(
    REPLACE(
      v20.system_prompt,
      $a1$Use "unknown" if the inputs do not support a choice.$a1$,
      $r1$The classification itself (transparent or non-transparent naar Nederlandse maatstaven) follows from the LEGAL FORM via the rechtsvormvergelijking in the GROUNDED_LITERATURE and is DECISIVE for a listed corporate form: an S.A., S.a r.l., N.V., B.V., GmbH, AG, Ltd, Inc./Corp., Plc or comparable corporate (capital) form is non-transparent, before and after 2025 alike. Decide it; do not leave it open. Whether the entity is then "resident", "nonresident_pe" or "outside_cit" depends only on its Dutch nexus: pick "outside_cit" when nothing indicates Dutch residence or a Dutch PE. Use "unknown" ONLY when the legal form itself cannot be placed with the GROUNDED_LITERATURE and the documents. Uncertainty about Dutch residence or a Dutch PE is NEVER a reason for "unknown", and NEVER return "unknown" together with a reason that reaches a conclusion: the key and the reason must land on the same outcome.$r1$
    ),
    $a2$(e.g. "US LLC treated as a corporation for US purposes, incorporated and managed in the US with no Dutch PE indicated in the documents, so on the documents it appears to fall outside the scope of Dutch CIT while remaining non-transparent as a foreign corporate entity")$a2$,
    $r2$(e.g. "Luxembourg S.A., a corporate form comparable to a Dutch N.V., so it appears to be non-transparent for Dutch purposes; nothing indicates Dutch residence or a Dutch permanent establishment, so it sits outside the scope of Dutch CIT"). Lead with the legal-form comparison; a Dutch PE only determines WHICH non-transparent status applies ("nonresident_pe" instead of "outside_cit"), never whether the entity is transparent or non-transparent, so never present the presence or absence of a PE as the ground for the classification itself$r2$
  ),
  v20.user_prompt_template,
  v20.model,
  v20.temperature,
  v20.max_tokens,
  true,
  'DRAFT, pending tax review. v21: NL classification of a foreign legal form is decided via the rechtsvormvergelijking (decisive for listed corporate forms), "unknown" reserved for a form the literature cannot place, key and reason must land on the same outcome, and the item-2 example no longer leads with a Dutch-PE observation. Derived from live v20 via two REPLACEs with a RAISE guard; model/template/temperature/max_tokens inherited. Flip: demote active < 21 first.'
FROM atad2_prompts v20
WHERE v20.key = 'appendix_facts_system' AND v20.version = 20
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'appendix_facts_system' AND version = 21
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'appendix_facts_system' AND version = 21;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'appendix_facts_system' AND version = 21 AND is_active = true
      AND system_prompt LIKE '%rechtsvormvergelijking in the GROUNDED_LITERATURE%'
      AND system_prompt LIKE '%Luxembourg S.A., a corporate form comparable to a Dutch N.V.%'
      AND system_prompt NOT LIKE '%US LLC treated as a corporation for US purposes%'
      AND system_prompt NOT LIKE '%Use "unknown" if the inputs do not support a choice.%'
  ) THEN
    RAISE EXCEPTION 'v21 REPLACE did not apply: one of the two v19-inherited anchors changed on the live v20 prompt. Inspect the live v20 system_prompt and update the anchors.';
  END IF;
END $$;
