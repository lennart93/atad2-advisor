-- appendix_system v7: the Part B section swarm gets the verified fact sheet (it
-- otherwise sees NO document content and improvises, F5) + a STATUS-CONSISTENCY
-- rule (F4, the v17 pattern for the appendix) + a FACTUAL-CLAIMS citation rule.
--
-- Derived by REPLACE on the LIVE v6 row (WP0 confirmed v6 is active and has
-- {{FACTS_BLOCK}} but no {{DOCUMENTS_LIST}} and no {{FACTSHEET_BLOCK}}). We inject
-- the fact-sheet section + the two rules immediately BEFORE the Part A facts
-- block. The edge function fills {{FACTSHEET_BLOCK}} with "" when absent
-- (placeholder rule: the filler ships first).
--
-- Status vocabulary is unchanged (Not triggered / N/A / Triggered / Insufficient
-- information); the consistency rule uses "N/A" for a satisfied scope gate, never
-- an out-of-vocabulary "Applicable".
--
-- Model / template / temperature / max_tokens inherited from v6.
-- DRAFT, pending tax review.
--
-- Flip: demote active < 7 first, INSERT guarded by NOT EXISTS, re-assert active,
-- DO block RAISEs if the {{FACTS_BLOCK}} anchor did not match.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'appendix_system' AND is_active = true AND version < 7;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'appendix_system',
  7,
  REPLACE(
    v6.system_prompt,
    $anchor${{FACTS_BLOCK}}$anchor$,
    $repl$## Verified group fact sheet (cross-document, pre-analysed)

{{FACTSHEET_BLOCK}}

FACT SHEET PRIMACY. The fact sheet above (when present) is your PRIMARY, cross-document-verified source of facts. You do NOT see the raw documents, so do not reconstruct, guess or improvise facts that are not in the fact sheet, the answers or the evidence notes.

FACTUAL CLAIMS. State amounts, parties, jurisdictions and foreign tax treatment ONLY from the fact sheet, the recorded answers or the evidence notes. If a fact is not in those inputs, it does not exist for you. NEVER give an entity a capacity the inputs do not state (for example, never describe a Dutch entity as a "US taxpayer").

STATUS CONSISTENT WITH YOUR OWN REASONING. The status must follow from, and never contradict, your own reasoning. If your reasoning concludes the tested condition is met, the status is "Triggered" (or the appropriate positive outcome), never "Not triggered". If it concludes the condition is not met, the status is "Not triggered", never "Triggered". A scope or definition gate that is satisfied reads "N/A", not "Not triggered" with text that says the condition applies. Before emitting a row, check that its status and its reasoning agree.

## Established facts (Part A)

{{FACTS_BLOCK}}$repl$
  ),
  v6.user_prompt_template,
  v6.model,
  v6.temperature,
  v6.max_tokens,
  true,
  'DRAFT, pending tax review. v7: v6 plus the {{FACTSHEET_BLOCK}} (Part B grounding, fixes F5) + FACTUAL CLAIMS citation rule + STATUS CONSISTENT WITH YOUR OWN REASONING (F4, appendix version of swarm v17). Injected before {{FACTS_BLOCK}}. Status vocabulary unchanged. Derived from live v6 via REPLACE with a RAISE guard; model/template/temperature/max_tokens inherited. Flip: demote active < 7 first.'
FROM atad2_prompts v6
WHERE v6.key = 'appendix_system' AND v6.version = 6
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'appendix_system' AND version = 7
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'appendix_system' AND version = 7;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'appendix_system' AND version = 7
      AND system_prompt LIKE '%{{FACTSHEET_BLOCK}}%'
      AND system_prompt LIKE '%FACT SHEET PRIMACY.%'
      AND system_prompt LIKE '%FACTUAL CLAIMS.%'
      AND system_prompt LIKE '%STATUS CONSISTENT WITH YOUR OWN REASONING.%'
  ) THEN
    RAISE EXCEPTION 'appendix_system v7 REPLACE did not apply: the {{FACTS_BLOCK}} anchor likely changed on the live v6 prompt. Inspect the live v6 system_prompt and update the anchor.';
  END IF;
END $$;
