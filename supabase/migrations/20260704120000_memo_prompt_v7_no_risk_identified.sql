-- Memo prompt v7: retire the "low risk" outcome language. Everywhere the memo
-- previously described the clean outcome as "low risk", it now concludes that
-- NO (hybrid-mismatch) risk was identified, and states that conclusion with a
-- firmer, less-hedged register. Built from the live v5+v6 text by targeted
-- replace() inserts (no need to reproduce the full prompt). Apply on the VM as
-- supabase_admin, AFTER v5 and v6 (this reads version 6 as its source).
-- Verify the chain first:
--   select version, is_active from atad2_prompts where key='memo_system' order by version;
--
-- The printed outcome line itself ("Risk assessment outcome: ...") is NOT set
-- here: it comes from {{RISK_CATEGORY}}, which the n8n "Build prompt + metrics"
-- node substitutes. That node must be changed in lockstep ('Low.' ->
-- 'No risk identified.'); see scripts/update-n8n-memo-prompt.py. Without the n8n
-- change the memo BODY reads "no risk identified" but the outcome line still
-- prints "Low.".
--
-- Changes vs v6 (TEXT ONLY; no {{VARIABLES}}, no CRITICAL OUTPUT RULE, no
-- formatting rules, no generation logic touched):
--   1. Executive-summary branch: "If low risk" -> "If no risk identified", and
--      the instruction now demands a confident, direct conclusion.
--   2. Executive-summary caution rule: carve out the clean outcome, so the "never
--      state a mismatch as fact" restraint no longer softens the no-risk conclusion.
--   3. Technical-assessment branch: "If the outcome is 'low risk'" ->
--      "'No risk identified'"; state directly that each type does not apply.
--   4. Conclusion branch: "If outcome = low risk" -> "No risk identified"; firm,
--      no "appears triggered" hedging.
--   5+6. Worked example header + intro relabelled "(no-risk-identified case)".
--
-- No new placeholder, so no n8n placeholder change needed (the n8n edit above is
-- to the substituted VALUE, not a new {{VARIABLE}}).
-- The DO block asserts every replace() actually matched: a drifted anchor would
-- otherwise no-op silently and ship an unchanged prompt, so a bad apply fails
-- loudly and rolls back (the whole DO block is one statement).

DO $migrate$
DECLARE
  v_src   text;
  v_new   text;
  v_model text;
  v_temp  numeric;
  v_max   integer;
BEGIN
  SELECT system_prompt, model, temperature, max_tokens
    INTO v_src, v_model, v_temp, v_max
    FROM atad2_prompts
   WHERE key = 'memo_system' AND version = 6;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'memo v7: source version 6 of memo_system not found; apply v5 and v6 first';
  END IF;

  v_new := v_src;

  -- EDIT 1 — Executive summary: retire "If low risk", demand a confident conclusion.
  v_new := replace(
    v_new,
    $o1$- If low risk:
o Summarize in two bullets why, based on available information, no ATAD2 impact is expected.$o1$,
    $n1$- If no risk identified:
o State plainly, in two bullets, that the assessment identifies no hybrid-mismatch risk for the year, and give the concrete reason on these facts (the group's structure and its cross-border elements do not give rise to a hybrid mismatch). Write the conclusion with confidence: use "does not", "is not", or "no ... arises", not "is not expected", "appears", or "should not". The grounding phrase "based on the information provided" may appear once, but do not hedge the conclusion itself.$n1$
  );

  -- EDIT 2 — Caution rule applies to asserting a mismatch, not to a clean outcome.
  v_new := replace(
    v_new,
    $o2$- Never present a mismatch outcome (e.g. D/NI or DD) as a confirmed fact. Such outcomes may only be described in qualified terms: "may result in", "appears to involve", or "based on available information could indicate".$o2$,
    $n2$- Never present a mismatch outcome (e.g. D/NI or DD) as a confirmed fact. Such outcomes may only be described in qualified terms: "may result in", "appears to involve", or "based on available information could indicate". This restraint applies to asserting that a mismatch exists. When the outcome is "No risk identified", state the absence of a mismatch directly and firmly (the group's facts do not give rise to a hybrid mismatch); do not soften a clean conclusion into "no impact is expected" or "does not appear".$n2$
  );

  -- EDIT 3 — Technical assessment branch: "No risk identified", state it directly.
  v_new := replace(
    v_new,
    $o3$- If the outcome is "low risk": only cover the few mismatch types that could plausibly be relevant on these facts; skip clearly irrelevant categories. Each mismatch should read as part of a continuous narrative — no bullet points, no sub-headings. Don't produce overly complex sentences, just inform the reader on why a specific mismatch was not identified.$o3$,
    $n3$- If the outcome is "No risk identified": only cover the few mismatch types that could plausibly be relevant on these facts; skip clearly irrelevant categories. Each mismatch should read as part of a continuous narrative, with no bullet points and no sub-headings. State directly why each of those types does not produce a mismatch on these facts (use "does not", "is not", or "no ... arises"); do not hedge with "was not identified" or "does not appear". Keep the sentences short and plain.$n3$
  );

  -- EDIT 4 — Conclusion branch: firm, no "appears triggered".
  v_new := replace(
    v_new,
    $o4$- If outcome = low risk: state in one or two sentences that no mismatch appears triggered and that the ATAD2 documentation obligation is fulfilled for the year.$o4$,
    $n4$- If outcome = No risk identified: state firmly, in one or two sentences, that the assessment identifies no hybrid mismatch for the year and that the taxpayer's ATAD2 documentation obligation is met for the year. Do not hedge this conclusion with "appears", "seems", or "no mismatch appears triggered"; the file supports a clean outcome.$n4$
  );

  -- EDIT 5 — Worked example header relabel.
  v_new := replace(
    v_new,
    $o5$WORKED EXAMPLE — required register and paragraph structure (low-risk case)$o5$,
    $n5$WORKED EXAMPLE — required register and paragraph structure (no-risk-identified case)$n5$
  );

  -- EDIT 6 — Worked example intro relabel.
  v_new := replace(
    v_new,
    $o6$Use this as the style and structure reference for the technical assessment in a low-risk case.$o6$,
    $n6$Use this as the style and structure reference for the technical assessment in a no-risk-identified case.$n6$
  );

  -- Assert every edit landed (replace() is a silent no-op if an anchor drifted).
  IF position($v$- If no risk identified:$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v7: EDIT 1 did not apply (anchor not found)'; END IF;
  IF position($v$This restraint applies to asserting that a mismatch exists$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v7: EDIT 2 did not apply (anchor not found)'; END IF;
  IF position($v$If the outcome is "No risk identified"$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v7: EDIT 3 did not apply (anchor not found)'; END IF;
  IF position($v$If outcome = No risk identified:$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v7: EDIT 4 did not apply (anchor not found)'; END IF;
  IF position($v$(no-risk-identified case)$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v7: EDIT 5 did not apply (anchor not found)'; END IF;
  IF position($v$in a no-risk-identified case.$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v7: EDIT 6 did not apply (anchor not found)'; END IF;

  -- Blanket sweep: no "low risk" / "low-risk" wording may survive anywhere.
  IF position('low risk' IN lower(v_new)) > 0 THEN
    RAISE EXCEPTION 'memo v7: "low risk" wording still present after edits'; END IF;
  IF position('low-risk' IN lower(v_new)) > 0 THEN
    RAISE EXCEPTION 'memo v7: "low-risk" wording still present after edits'; END IF;

  -- Flip active flag first (uniq_atad2_prompts_active allows one active row per key).
  UPDATE atad2_prompts SET is_active = false WHERE key = 'memo_system' AND is_active = true;

  INSERT INTO atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
  VALUES (
    'memo_system', 7, v_new, v_model, v_temp, v_max, true,
    $notes$v7: retire "low risk" outcome language. The clean outcome is now "No risk identified" throughout, stated with a firmer, less-hedged register: (1) executive-summary branch demands a confident, direct conclusion; (2) the "never state a mismatch as fact" caution is carved out so it no longer softens the clean outcome; (3) technical-assessment branch states directly that each type does not apply; (4) conclusion branch drops "appears triggered" hedging; (5+6) worked example relabelled "(no-risk-identified case)". Built from v6 text via replace(); no new placeholder. Pair with the n8n node change ({{RISK_CATEGORY}} 'Low.' -> 'No risk identified.') so the printed outcome line matches the body.$notes$
  );
END
$migrate$;
