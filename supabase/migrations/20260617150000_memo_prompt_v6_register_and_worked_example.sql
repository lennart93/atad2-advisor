-- Memo prompt v6: register + structure tightening from a partner hand-edit, plus a
-- worked low-risk example. Built from the live v5 text by targeted replace() inserts
-- (no need to reproduce the full prompt). Apply on the VM as supabase_admin.
-- Verify v5 first:
--   select version, is_active from atad2_prompts where key='memo_system' order by version;
--
-- Changes vs v5 (TEXT ONLY; no {{VARIABLES}}, no CRITICAL OUTPUT RULE, no formatting
-- rules, no generation logic touched; appendix block and all v3/v4/v5 rules preserved):
--   1. General background: the "we understand" framing is carried once in the lead-in
--      sentence; bullets state facts directly (no per-bullet "We understand that").
--   2. Technical assessment Style block: direct register, conclusion-first paragraphs,
--      banned announcing openers + ranking language, name the jurisdictions concretely.
--      (v5's "Name the jurisdiction explicitly ... not 'here'" line sits right after this
--      block and is intentionally left in place.)
--   3. Wording list: ban "heads a fiscal unity" -> "is the parent company of a fiscal unity".
--   4a. Abbreviations: define "deemed payments"/PE only when the concept is actually used.
--   4b. Technical assessment intro: do not park an unused definition in the intro paragraph.
--   5. New worked example (low-risk) at the end of the technical assessment, before the
--      Conclusion divider. Placeholder names only (Holdco B.V., Parentco LLC, Finco AG).
--   6. Executive-summary lead-in: "After an initial review, we note the following:".
--
-- No new placeholder, so no n8n change needed.
-- The DO block asserts every replace() actually matched: a drifted anchor would
-- otherwise no-op silently and ship an unchanged prompt, so a bad apply fails loudly
-- and rolls back (the whole DO block is one statement).

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
   WHERE key = 'memo_system' AND version = 5;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'memo v6: source version 5 of memo_system not found; apply v5 first';
  END IF;

  v_new := v_src;

  -- EDIT 1 — General background: drop the per-bullet "we understand that"
  v_new := replace(
    v_new,
    $o1$Always write from internal perspective using "we understand that...".$o1$,
    $n1$Carry the "we understand" framing once, in the introductory sentence only ("We have based this assessment on the following facts and understandings:"). Each bullet then states the fact directly, with no per-bullet opener. Never begin a bullet with "We understand that". One short factual statement per bullet.$n1$
  );

  -- EDIT 2 — Technical assessment Style block: direct register, no announcing openers,
  -- no ranking, name the jurisdictions
  v_new := replace(
    v_new,
    $o2$- Every paragraph should begin with a natural sentence that introduces the mismatch type as part of the text, not as a heading.
- Maintain a professional, smooth tone appropriate for a legal/fiscal memorandum.
- Ensure the reader is guided through the assessment as a coherent story, not as a checklist.$o2$,
    $n2$- Open each paragraph with the conclusion for that mismatch type, tied to concrete facts (name the instrument, the entity, the jurisdiction). Do not open with a sentence that announces what you are about to examine.
- Banned openers and connective phrasing: "We considered", "We also considered", "We then considered", "Finally, we considered", "We turn to", "Turning to", "The most relevant area concerns", "A [X] concern can be set aside", "can be put to rest". State the point directly instead.
- Do not rank mismatch types or call any one "the most relevant", "the central", or "the key" concern. Address each relevant type on its own footing.
- Register: direct, precise and professional, the way a tax specialist writes. Not chatty, not literary (no "can be set aside on these facts"), and not heavy jargon. Short, plain sentences.
- When explaining why a classification produces no mismatch, name which jurisdiction gives which treatment. Never write "because each side gives the same classification" or "both sides treat it the same"; state both treatments concretely (e.g. the entity is non-transparent in the Netherlands and its parent's state treats it the same way under that state's law).
- Keep flowing paragraphs, no headings, no bullets. Flow comes from the order of the analysis, not from narrative glue.$n2$
  );

  -- EDIT 3 — Global wording list: ban "heads a fiscal unity"
  v_new := replace(
    v_new,
    $o3$- "observed / indicates / indicates that" → "we see / suggests / shows"$o3$,
    $n3$- "observed / indicates / indicates that" → "we see / suggests / shows"
- "heads a fiscal unity" / "is the head of a fiscal unity" → "is the parent company of a fiscal unity"$n3$
  );

  -- EDIT 4a — Only define deemed payments when actually discussed
  v_new := replace(
    v_new,
    $o4$- Define once if needed: "deemed payments are internal, notional payments between head office and permanent establishment(s) for profit attribution purposes".
- After that, only use "deemed payments".$o4$,
    $n4$- Define "deemed payments" or "PE" only if that concept is actually discussed for this taxpayer. If the facts involve no PE, omit both the definition and the concept entirely; never leave a floating definition for something the memo does not use.
- If "deemed payments" is used, define it once: "deemed payments are internal, notional payments between head office and permanent establishment(s) for profit attribution purposes", and after that only use "deemed payments".$n4$
  );

  -- EDIT 4b — Section intro must not park an unused definition
  v_new := replace(
    v_new,
    $o5$- Always begin with a short introductory paragraph (max. 3 sentences) that sets out the purpose of this section.$o5$,
    $n5$- Always begin with a short introductory paragraph (max. 3 sentences) that sets out the purpose of this section. Do not place in it any definition of a concept that is not discussed for this taxpayer (for example, do not define deemed payments or PE when there is no PE).$n5$
  );

  -- EDIT 5 — Insert worked example at the end of the technical assessment, immediately
  -- before the "---" divider that precedes "**Conclusion and next steps**"
  v_new := replace(
    v_new,
    $o6$- Instead, use "Hybrid permanent establishment mismatches" or "Hybrid PE mismatches" where relevant.
---

**Conclusion and next steps**$o6$,
    $n6$- Instead, use "Hybrid permanent establishment mismatches" or "Hybrid PE mismatches" where relevant.

WORKED EXAMPLE — required register and paragraph structure (low-risk case)

Use this as the style and structure reference for the technical assessment in a low-risk case. Match the directness, the sentence length, and the paragraph shape: each paragraph opens with the conclusion, then gives the supporting facts; entities and jurisdictions are named; no paragraph announces what it is about and none ranks a mismatch type; defaults are stated where they resolve a point.

The names below (Holdco B.V., Parentco LLC, Finco AG) are generic placeholders for illustration only. Do NOT reuse them, or the facts and conclusions below, in any actual memo — build the narrative from this case's own data.

--- begin example ---

Holdco B.V. operates within an almost entirely Dutch group. The only cross-border elements are a US shareholder, Parentco LLC, and a Swiss lender, Finco AG. Given that structure, only a few hybrid-mismatch types could apply, and none is triggered.

Holdco B.V.'s financing produces no D/NI. It pays deductible interest on the shareholder loan from Parentco LLC, on subordinated loans from Dutch lenders, and on the term loans from Finco AG. Each lender includes that interest in its own taxable base. Parentco LLC is a US LLC, an entity US law can disregard. Here it acts as an ordinary corporate shareholder, and no election treats Holdco B.V. as transparent. None of these loans splits the return between two owners, so no hybrid instrument or hybrid transfer arises.

None of the entities Holdco B.V. pays is a hybrid entity. Parentco LLC is non-transparent under US law and is treated as non-transparent in the Netherlands as well. Finco AG is an ordinary Swiss corporation, and the Dutch lenders and service providers are non-transparent under Dutch law. No recipient is classified one way by its own state and another by the Netherlands, so no payment reaches a hybrid entity and no D/NI arises.

Holdco B.V. is not a reverse hybrid. It is a Dutch BV, non-transparent in the Netherlands by default, and no related party treats it as transparent. The reverse-hybrid rule reaches a Dutch transparent entity, typically a partnership, that related parties treat as non-transparent. The group holds no such entity, so the rule does not apply.

--- end example ---

NOTICE (so the model generalises rather than copies):
- Opens with the outcome ("produces no D/NI", "is not a reverse hybrid"), not with "We considered" or "The most relevant area concerns".
- Names the jurisdiction giving each treatment. Never "because each side gives the same classification".
- States the relevant default explicitly (a US LLC can be disregarded; a Dutch BV is non-transparent by default) and uses it to close the point.
- Short, plain sentences. No literary framing, no headings, no bullets.

---

**Conclusion and next steps**$n6$
  );

  -- EDIT 6 — Crisper executive-summary lead-in
  v_new := replace(
    v_new,
    $o7$This sentence must clarify that the summary reflects an initial assessment, subject to further review ("After a first analysis, the following points can be noted:").$o7$,
    $n7$This sentence must clarify that the summary reflects an initial assessment, subject to further review ("After an initial review, we note the following:").$n7$
  );

  -- Assert every edit landed (replace() is a silent no-op if an anchor drifted).
  IF position($v$Carry the "we understand" framing once$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 1 did not apply (anchor not found)'; END IF;
  IF position($v$Banned openers and connective phrasing$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 2 did not apply (anchor not found)'; END IF;
  IF position($v$is the parent company of a fiscal unity$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 3 did not apply (anchor not found)'; END IF;
  IF position($v$never leave a floating definition$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 4a did not apply (anchor not found)'; END IF;
  IF position($v$Do not place in it any definition of a concept$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 4b did not apply (anchor not found)'; END IF;
  IF position($v$WORKED EXAMPLE — required register$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 5 did not apply (anchor not found)'; END IF;
  IF position($v$After an initial review, we note the following$v$ IN v_new) = 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 6 did not apply (anchor not found)'; END IF;

  -- Assert the fully-replaced phrases are gone.
  IF position($v$Always write from internal perspective using$v$ IN v_new) > 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 1 old text still present'; END IF;
  IF position($v$Ensure the reader is guided through the assessment as a coherent story$v$ IN v_new) > 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 2 old text still present'; END IF;
  IF position($v$Define once if needed$v$ IN v_new) > 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 4a old text still present'; END IF;
  IF position($v$After a first analysis, the following points can be noted$v$ IN v_new) > 0 THEN
    RAISE EXCEPTION 'memo v6: EDIT 6 old text still present'; END IF;

  -- Flip active flag first (uniq_atad2_prompts_active allows one active row per key).
  UPDATE atad2_prompts SET is_active = false WHERE key = 'memo_system' AND is_active = true;

  INSERT INTO atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
  VALUES (
    'memo_system', 6, v_new, v_model, v_temp, v_max, true,
    $notes$v6: register + structure edits from a partner hand-edit, on top of v4 appendix block and v5 currency/jurisdiction. (1) "we understand" framing carried once, not per bullet. (2) Technical-assessment Style block: conclusion-first paragraphs, banned announcing openers and ranking language, name the jurisdictions concretely. (3) Wording list bans "heads a fiscal unity". (4) Define deemed payments/PE only when used; no floating definition. (5) Worked low-risk example at the end of the technical assessment (generic placeholder names only). (6) Executive-summary lead-in -> "After an initial review, we note the following:". Built from v5 text via replace(); no new placeholder, no n8n change.$notes$
  );
END
$migrate$;
