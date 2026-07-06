-- Swarm prompt v18: FACT SHEET PRIMACY + EVIDENCE-BASED NEGATIVES + HARD
-- DECISION RULES + LENGTH, on top of v17.
--
-- Part of the factsheet pipeline. The swarm now receives a
-- "## Verified group fact sheet (cross-document, pre-analysed)" block (injected
-- by the prefill-documents edge function, inside the cache prefix, before the
-- raw documents). v18 tells the model to treat that block as its primary,
-- cross-document-verified fact source, to answer evidenced negatives as "no"
-- (not "unknown"), to apply a fixed set of hard US-CTB / consolidation /
-- relatedness rules, and to write a fuller (up to 4000 char) toelichting.
--
-- v17 richting-check (Rule 13), v14 jurisdictional sanity and v15/v16
-- multi-entity/group framing all stay in place.
--
-- DEPLOY ORDER (STRICT, placeholder rule): the fase-2 prefill-documents edge
-- function (which fills the factsheet placeholder AND widens the zod caps to
-- 4000 + accepts the evidence field) MUST be live on the VM BEFORE this prompt
-- is activated. Otherwise v18's longer toelichting (>1000 chars) is rejected by
-- the OLD zod cap and 500s the row. Flip order: demote active < 18 first, INSERT
-- guarded by NOT EXISTS, trailing UPDATE re-asserts v18 active, DO block RAISEs
-- if any REPLACE anchor failed to match.
--
-- Derived by REPLACE on the LIVE v17 row (not a hand-retyped literal) so the
-- rest of the prompt stays byte-identical to whatever is active on the VM.
-- Model / template / temperature / max_tokens (4000, enough for a 4000-char
-- toelichting) inherited from v17.

-- 1. Demote the current active row before inserting a new active one.
UPDATE atad2_prompts
SET is_active = false
WHERE key = 'prefill_swarm_system' AND is_active = true AND version < 18;

-- 2. Insert v18, derived from v17 by two REPLACEs.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'prefill_swarm_system',
  18,
  REPLACE(
    REPLACE(
      v17.system_prompt,
      $a$14. FINAL CHECK before emitting JSON. Verify:$a$,
      $ra$14. FACT SHEET PRIMACY. When a "## Verified group fact sheet (cross-document, pre-analysed)" block is present, it is your PRIMARY, cross-document-verified source of facts; the raw documents are secondary evidence. Prefer the fact sheet for entity identities, TINs, aliases, ownership, financing, flow directions and negatives. Carry the fact sheet's source references (doc_label + loc) into the evidence array for every claim you rely on. If no fact sheet is present, work from the raw documents as before.

15. EVIDENCE-BASED NEGATIVES. Answer "no" (not "unknown") whenever the documents affirmatively show the negative: for example the objectvrijstelling / foreign permanent-establishment boxes are nil in every return, there are no repo positions, or there is no foreign address, provided you cite the evidence (doc_label + loc) per claim in the evidence array. Reserve "unknown" for facts the documents cannot show by their nature (the foreign tax treatment at a counterparty, future intentions) and for a genuine contradiction; in that case name in client_question exactly what the client or the foreign adviser must confirm.

16. HARD DECISION RULES (apply verbatim):
   - A company incorporated under U.S. state law (Inc./Corp.) is a per-se corporation and cannot make a check-the-box election.
   - A single-member LLC is disregarded by default; a multi-member LLC is a partnership by default; only an explicit corporate election makes it opaque. Without evidence of an election, treat the status as to_verify, never assumed.
   - Profit distributions by a Dutch entity are not deductible and therefore are never, on their own, a deduction-without-inclusion payment.
   - Consolidated is not standalone: attribute debts and interest expense to the borrowing entity per the fact sheet, never to the consolidating parent.
   - Relatedness covers, besides 25% or more ownership, the 2:24b Dutch Civil Code group (consolidation, including de-facto control without a shareholding) and the acting-together group (samenwerkende groep).
   - A domestic flow to a hybrid recipient: if payer and recipient are both in the Netherlands and the income sits fully in the Dutch base, there is no allocation mismatch (the Rule 13 direction check still applies in full).

17. LENGTH. With the fact sheet in hand, write a full, specific suggested_toelichting in complete sentences (up to 4000 characters), naming amounts and counterparties. Be complete, not verbose; do not pad.

18. FINAL CHECK before emitting JSON. Verify:$ra$
    ),
    $b$    If any of these is violated, fix it before emitting.$b$,
    $rb$    - if a fact sheet is present, your entity identities, financing, flow directions and negatives agree with it, and evidence carries the fact sheet's doc_label + loc citations (Rules 14, 16).
    - a negative the documents affirmatively support is answered "no", not "unknown", with evidence (Rule 15).
    If any of these is violated, fix it before emitting.$rb$
  ),
  v17.user_prompt_template,
  v17.model,
  v17.temperature,
  v17.max_tokens,
  true,
  'v18: v17 plus FACT SHEET PRIMACY, EVIDENCE-BASED NEGATIVES, HARD DECISION RULES (US per-se corp / single- vs multi-member LLC default / NL distribution not D-NI / consolidated != standalone / relatedness incl 2:24b BW group + samenwerkende groep / domestic hybrid = no mismatch) and a LENGTH rule (toelichting up to 4000 chars). Consumes the factsheet block injected by prefill-documents. Old "14. FINAL CHECK" renumbered to 18; two FINAL CHECK bullets added. Derived from live v17 via REPLACE with a RAISE guard. DEPLOY AFTER the fase-2 prefill-documents redeploy (widened zod caps + factsheet placeholder + evidence field), never before. Model/template/temperature/max_tokens inherited from v17. Flip order: demote active < 18 first, INSERT guarded by NOT EXISTS, trailing UPDATE re-asserts v18 active. DRAFT, pending tax review (hard decision rules await Lennart sign-off).'
FROM atad2_prompts v17
WHERE v17.key = 'prefill_swarm_system' AND v17.version = 17
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts
  WHERE key = 'prefill_swarm_system' AND version = 18
);

-- 3. Re-assert v18 active on rerun (INSERT only sets is_active on first insert).
UPDATE atad2_prompts SET is_active = true
WHERE key = 'prefill_swarm_system' AND version = 18;

-- 4. Fail loudly if either REPLACE anchor did not match (silent no-op guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'prefill_swarm_system' AND version = 18
      AND system_prompt LIKE '%14. FACT SHEET PRIMACY.%'
      AND system_prompt LIKE '%15. EVIDENCE-BASED NEGATIVES.%'
      AND system_prompt LIKE '%16. HARD DECISION RULES (apply verbatim):%'
      AND system_prompt LIKE '%18. FINAL CHECK before emitting JSON. Verify:%'
      AND system_prompt LIKE '%a negative the documents affirmatively support is answered "no"%'
  ) THEN
    RAISE EXCEPTION 'v18 REPLACE did not apply: a FACT SHEET / NEGATIVES / HARD RULES block, the renumbered FINAL CHECK, or a FINAL CHECK bullet is missing. The v17 anchor strings likely changed on the VM; inspect the live v17 system_prompt and update the anchors.';
  END IF;
END $$;
