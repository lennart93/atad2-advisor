-- Memo prompt v9: eight wording/reasoning refinements from Lennart's redline of a
-- generated memo (Prompt Tuner feedback round, 20 Jul 2026). Built from the live
-- v8 text by targeted replace() edits. Apply on the VM as supabase_admin, AFTER v8
-- (reads version 8). Verify the chain first:
--   select version, is_active from atad2_prompts where key='memo_system' order by version;
--
-- Changes vs v8 (TEXT ONLY; no {{VARIABLES}}, no generation logic touched):
--   1. Introduction: name the actual sources reviewed (incl. tax returns where
--      available) instead of the hard-coded "financial statements and
--      supplementary information".
--   2. CIT is used as-is EVERYWHERE, including the introduction/first use; the
--      fixed template text above the memo already spells out corporate income
--      tax (CIT). Enforced both in the intro guidance and the abbreviation rule.
--   3. General background: foreign-jurisdiction tax treatment of a specific
--      entity is qualified with "we understand"; the Dutch-side classification
--      stays a direct assertion.
--   4. Never state the number of assessed entities; refer to them generically
--      ("the assessed entities"), and say "entities", not "companies".
--   5. Analytical discipline: name a "blocker entity" where a regarded corporate
--      owner above disregarded entities closes the D/NI or DD point.
--   6. Wording: "vehicle" -> "entity"; never join two facts with a semicolon.
--   7. Article-rule exception: the provision establishing the ATAD2 documentation
--      obligation (Article 12ag Dutch CIT Act 1969) may be cited when confirming
--      that obligation is met. Everything else stays article-free.
--   8. No-risk phrasing: firm "does not / is not" only for points the file
--      resolves structurally; fact-dependent categories (hybrid instruments,
--      imported mismatches) use "we have not identified".
--
-- No new placeholder, so no n8n change needed.
-- The DO block asserts every replace() landed.

DO $migrate$
DECLARE
  v_src   text;
  v_new   text;
  v_model text;
  v_temp  numeric;
  v_max   integer;
  nl      text := chr(10);
BEGIN
  SELECT system_prompt, model, temperature, max_tokens
    INTO v_src, v_model, v_temp, v_max
    FROM atad2_prompts
   WHERE key = 'memo_system' AND version = 8;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'memo v9: source version 8 of memo_system not found; apply v8 first';
  END IF;

  v_new := v_src;

  -- EDIT 1+2a — Introduction purpose bullet: real sources + CIT-as-is in the intro.
  IF position($a1$- Position the purpose of this report: this is a risk assessment based on available financial statements and supplementary information.$a1$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 1 anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o1$- Position the purpose of this report: this is a risk assessment based on available financial statements and supplementary information.$o1$,
    $n1$- Position the purpose of this report: this is a risk assessment based on the information reviewed. Name the actual sources used, for example the financial statements, the tax returns where available, and supplementary information.
- The fixed template text above the memorandum already explains corporate income tax (CIT). Write "CIT" as-is from the first sentence of the introduction onward; never spell it out or bracket the abbreviation, not even on first use.$n1$
  );

  -- EDIT 2b — Abbreviations: CIT rule covers the introduction and first mention.
  IF position($a2$- CIT usage: Always use "CIT" throughout the memorandum.$a2$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 2 anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o2$- CIT usage: Always use "CIT" throughout the memorandum.$o2$,
    $n2$- CIT usage: Always use "CIT" throughout the memorandum, including the introduction and the very first mention. The fixed template text above the memo already spells out corporate income tax (CIT), so the first-mention-in-full rule does NOT apply to CIT.$n2$
  );

  -- EDIT 3 — General background: qualify foreign-jurisdiction treatment.
  IF position($a3$Never begin a bullet with "We understand that". One short factual statement per bullet.$a3$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 3 anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o3$Never begin a bullet with "We understand that". One short factual statement per bullet.$o3$,
    $n3$Never begin a bullet with "We understand that". One short factual statement per bullet. Exception: a foreign jurisdiction's tax treatment of a specific entity is outside our direct knowledge. State the Dutch-side classification directly, and qualify the foreign-jurisdiction treatment with "we understand" (for example: "Parentco Inc. is treated as non-transparent in the Netherlands. We understand that it is also treated as such by the United States.").$n3$
  );

  -- EDIT 4 — Entity name usage: no counts, "entities" not "companies".
  IF position($a4$- The entity name must appear consistently throughout the memorandum.$a4$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 4 anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o4$- The entity name must appear consistently throughout the memorandum.$o4$,
    $n4$- The entity name must appear consistently throughout the memorandum.
- When referring to the assessed entities collectively, never state their number (not "the nine assessed entities", not "the nine companies"). Write "the assessed entities" or "the Dutch entities".
- Say "entities", not "companies", when referring to the assessed group collectively.$n4$
  );

  -- EDIT 5 — Analytical discipline: blocker entities.
  IF position($a5$Holistic sweep before narrowing.$a5$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 5 anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o5$Holistic sweep before narrowing.$o5$,
    $n5$Name blocker entities. Where a regarded (non-transparent) corporate owner sits directly above one or more disregarded entities, so that the deduction and the corresponding income fall within one and the same country's tax base, call that owner a "blocker entity" and use it to close the D/NI or DD point precisely.

Holistic sweep before narrowing.$n5$
  );

  -- EDIT 6a — Wording: "vehicle" -> "entity".
  IF position($a6$Wording to avoid (replace with simpler terms):$a6$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 6a anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o6$Wording to avoid (replace with simpler terms):$o6$,
    $n6$Wording to avoid (replace with simpler terms):
- "vehicle" -> "entity" (write "any such entities", never "any such vehicles")$n6$
  );

  -- EDIT 6b — Formatting: no semicolon-joined facts.
  IF position($a7$- Avoid inline enumerations inside paragraphs; turn them into bullet lists.$a7$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 6b anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o7$- Avoid inline enumerations inside paragraphs; turn them into bullet lists.$o7$,
    $n7$- Avoid inline enumerations inside paragraphs; turn them into bullet lists.
- Do not join two facts with a semicolon in one sentence or bullet. Use two separate sentences, or put the second fact in a short parenthetical aside.$n7$
  );

  -- EDIT 7 — Article-rule exception for the documentation obligation.
  IF (length(v_new) - length(replace(v_new, 'Plain English (tone)', ''))) <> length('Plain English (tone)') THEN
    RAISE EXCEPTION 'memo v9: EDIT 7 anchor "Plain English (tone)" not found exactly once'; END IF;
  v_new := replace(
    v_new,
    $o8$Plain English (tone)$o8$,
    $n8$Exception to the article rule: when confirming that the taxpayer's ATAD2 documentation obligation has been met, you may cite the single provision that establishes that obligation (Article 12ag of the Dutch Corporate Income Tax Act 1969). Every other part of the analysis stays in plain language without article numbers.

Plain English (tone)$n8$
  );

  -- EDIT 8 — No-risk phrasing: firm only where the file resolves the point.
  IF position($a9$State directly why each of those types does not produce a mismatch on these facts (use "does not", "is not", or "no ... arises"); do not hedge with "was not identified" or "does not appear". Keep the sentences short and plain.$a9$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: EDIT 8 anchor not found'; END IF;
  v_new := replace(
    v_new,
    $o9$State directly why each of those types does not produce a mismatch on these facts (use "does not", "is not", or "no ... arises"); do not hedge with "was not identified" or "does not appear". Keep the sentences short and plain.$o9$,
    $n9$Where the file structurally resolves the point (entity classifications, known defaults, the mechanics of the structure), state directly why the type does not produce a mismatch on these facts (use "does not", "is not", or "no ... arises") and do not hedge with "does not appear". Where a category's absence depends on facts the file cannot fully contain (for example whether any intra-group hybrid instrument or hybrid transfer exists, or whether an imported mismatch sits elsewhere in the group), write "we have not identified" instead of asserting non-existence. Keep the sentences short and plain.$n9$
  );

  -- Sanity: text must have grown and key new phrases must be present.
  IF length(v_new) <= length(v_src) THEN
    RAISE EXCEPTION 'memo v9: new text is not longer than v8; edits did not apply'; END IF;
  IF position('blocker entity' IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: blocker-entity wording missing after edits'; END IF;
  IF position('we have not identified' IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: fact-dependent phrasing missing after edits'; END IF;
  IF position('Article 12ag of the Dutch Corporate Income Tax Act 1969' IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v9: documentation-obligation exception missing after edits'; END IF;

  -- Flip active flag first (uniq_atad2_prompts_active allows one active row per key).
  UPDATE atad2_prompts SET is_active = false WHERE key = 'memo_system' AND is_active = true;

  INSERT INTO atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
  VALUES (
    'memo_system', 9, v_new, v_model, v_temp, v_max, true,
    $notes$v9: eight redline-driven refinements (20 Jul 2026): intro names real sources incl. tax returns; CIT used as-is everywhere incl. first mention (fixed template text above the memo already spells it out); foreign-jurisdiction treatment qualified with "we understand" while the Dutch side stays direct; no entity counts and "entities" over "companies"; blocker-entity concept in the analytical discipline; "vehicle"->"entity"; no semicolon-joined facts; article-rule exception for the documentation obligation (Art. 12ag Wet Vpb 1969); no-risk register split into file-resolved (firm) vs fact-dependent ("we have not identified"). Built from v8 via replace(); no new placeholder, no n8n change.$notes$
  );
END
$migrate$;
