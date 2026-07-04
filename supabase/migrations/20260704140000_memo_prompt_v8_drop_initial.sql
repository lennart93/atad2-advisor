-- Memo prompt v8: drop the word "initial" from the memo. It framed the memo as a
-- preliminary/tentative document, which conflicts with the firmer register adopted
-- in v7 (the memo now states a definitive outcome, e.g. "No risk identified").
-- Built from the live v7 text by two targeted replace() inserts. Apply on the VM
-- as supabase_admin, AFTER v7 (reads version 7).
-- Verify the chain first:
--   select version, is_active from atad2_prompts where key='memo_system' order by version;
--
-- Changes vs v7 (TEXT ONLY; no {{VARIABLES}}, no generation logic touched):
--   1. Introduction purpose line: "an initial risk assessment" -> "a risk assessment".
--   2. Executive-summary lead-in: "reflects an initial assessment ... 'After an
--      initial review, we note the following:'" -> "reflects the assessment ...
--      'After reviewing the available information, we note the following:'".
--      (Removes both "initial" occurrences; keeps the "subject to further review"
--      caveat; the verbatim exec-summary opener changes accordingly.)
--
-- No new placeholder, so no n8n change needed.
-- The DO block asserts every replace() landed and that no "initial" survives.

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
   WHERE key = 'memo_system' AND version = 7;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'memo v8: source version 7 of memo_system not found; apply v7 first';
  END IF;

  v_new := v_src;

  -- EDIT 1 — Introduction purpose line.
  v_new := replace(
    v_new,
    $o1$this is an initial risk assessment based on available financial statements and supplementary information.$o1$,
    $n1$this is a risk assessment based on available financial statements and supplementary information.$n1$
  );

  -- EDIT 2 — Executive-summary lead-in (removes both "initial" occurrences).
  v_new := replace(
    v_new,
    $o2$This sentence must clarify that the summary reflects an initial assessment, subject to further review ("After an initial review, we note the following:").$o2$,
    $n2$This sentence must clarify that the summary reflects the assessment, subject to further review ("After reviewing the available information, we note the following:").$n2$
  );

  -- Assert both edits landed.
  IF position($v$this is a risk assessment based on available financial statements$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v8: EDIT 1 did not apply (anchor not found)'; END IF;
  IF position($v$After reviewing the available information, we note the following$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v8: EDIT 2 did not apply (anchor not found)'; END IF;

  -- Blanket sweep: the word "initial" may not survive anywhere in the prompt.
  IF position('initial' IN lower(v_new)) > 0 THEN
    RAISE EXCEPTION 'memo v8: "initial" wording still present after edits'; END IF;

  -- Flip active flag first (uniq_atad2_prompts_active allows one active row per key).
  UPDATE atad2_prompts SET is_active = false WHERE key = 'memo_system' AND is_active = true;

  INSERT INTO atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
  VALUES (
    'memo_system', 8, v_new, v_model, v_temp, v_max, true,
    $notes$v8: drop the word "initial" from the memo (introduction "a risk assessment", executive-summary opener "After reviewing the available information, we note the following:"). "Initial" framed the memo as preliminary, which conflicts with the firmer register from v7. Built from v7 via replace(); no new placeholder, no n8n change.$notes$
  );
END
$migrate$;
