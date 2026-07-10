-- appendix_facts_system v20: Part A (the facts proposal) consumes the verified
-- group fact sheet + gets the borrower-attribution / relatedness-basis /
-- classification-default rules (WP1/WP2, fixes F5-F9 on the appendix side).
--
-- Derived by REPLACE on the LIVE v19 row (WP0 confirmed v19 is active and has
-- {{DOCUMENTS_BLOCK}} but no {{FACTSHEET_BLOCK}}). We inject a fact-sheet section
-- + the four rules immediately BEFORE the documents block, so the rest of the
-- live prompt stays byte-identical. The edge function fills {{FACTSHEET_BLOCK}}
-- with "" when no factsheet exists (placeholder rule: the code that fills it is
-- deployed BEFORE this prompt).
--
-- Model / template / temperature / max_tokens inherited from v19.
-- DRAFT, pending tax review (borrower attribution, 2:24b relatedness and the
-- classification defaults await fiscal sign-off).
--
-- Flip order (partial unique index = one active row per key): demote active < 20
-- first, INSERT guarded by NOT EXISTS, trailing UPDATE re-asserts v20 active, DO
-- block RAISEs if the anchor did not match.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'appendix_facts_system' AND is_active = true AND version < 20;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'appendix_facts_system',
  20,
  REPLACE(
    v19.system_prompt,
    $anchor${{DOCUMENTS_BLOCK}}$anchor$,
    $repl$## Verified group fact sheet (cross-document, pre-analysed)

{{FACTSHEET_BLOCK}}

FACT SHEET PRIMACY. When the fact sheet above is present, it is your PRIMARY, cross-document-verified source of facts; the raw documents below are secondary. Take entity identities (with TIN and aliases), ownership percentages, financing (including the BORROWER), payment flows and relatedness bases from the fact sheet, and never contradict it.

BORROWER ATTRIBUTION. Attribute a debt and its interest expense to the BORROWING entity named in the fact sheet, never to the consolidating parent. A consolidated financial statement that lists a facility does not make the parent the borrower; do not invent a transaction to make the numbers fit.

RELATEDNESS BASIS. An entity is related to the taxpayer not only at 25% or more ownership but also through the 2:24b Dutch Civil Code group (consolidation, including de-facto control WITHOUT a shareholding) and the acting-together group (samenwerkende groep). An entity consolidated into the group but held at 0% is still related; state the basis, and never label such an entity "unrelated" or "third-party".

CLASSIFICATION DEFAULTS (propose, never assert). Where a well-known legal form has no other signal: a company incorporated under U.S. state law (Inc./Corp.) is a per-se corporation (non-transparent) that cannot make a check-the-box election; a single-member LLC is disregarded by default and a multi-member LLC a partnership by default, unless a corporate election is shown; a Hong Kong Limited, an Irish DAC and a Swiss AG are non-transparent. Mark any such default as to verify, never as confirmed.

## Documents

{{DOCUMENTS_BLOCK}}$repl$
  ),
  v19.user_prompt_template,
  v19.model,
  v19.temperature,
  v19.max_tokens,
  true,
  'DRAFT, pending tax review. v20: v19 plus FACT SHEET PRIMACY + BORROWER ATTRIBUTION + RELATEDNESS BASIS (2:24b / samenwerkende groep) + CLASSIFICATION DEFAULTS, injected before {{DOCUMENTS_BLOCK}}. Consumes the {{FACTSHEET_BLOCK}} the generate-appendix edge function fills ("" when absent). Fixes appendix F5-F9. Derived from live v19 via REPLACE with a RAISE guard; model/template/temperature/max_tokens inherited. Flip: demote active < 20 first.'
FROM atad2_prompts v19
WHERE v19.key = 'appendix_facts_system' AND v19.version = 19
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'appendix_facts_system' AND version = 20
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'appendix_facts_system' AND version = 20;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'appendix_facts_system' AND version = 20
      AND system_prompt LIKE '%{{FACTSHEET_BLOCK}}%'
      AND system_prompt LIKE '%FACT SHEET PRIMACY.%'
      AND system_prompt LIKE '%BORROWER ATTRIBUTION.%'
      AND system_prompt LIKE '%RELATEDNESS BASIS.%'
      AND system_prompt LIKE '%CLASSIFICATION DEFAULTS%'
  ) THEN
    RAISE EXCEPTION 'v20 REPLACE did not apply: the {{DOCUMENTS_BLOCK}} anchor likely changed on the live v19 prompt. Inspect the live v19 system_prompt and update the anchor.';
  END IF;
END $$;
