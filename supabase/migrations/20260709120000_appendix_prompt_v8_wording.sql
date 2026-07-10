-- appendix_system v8: a WORDING AND HOUSE PATTERNS block on top of v7. Derived
-- from a full hand-rewrite of the Part B reasoning by the advisor (WMC review,
-- 9 Jul 2026), read at word level:
--   words   - "entity" is the default but "company"/"corporation" is fine where
--             natural; "is allocated to"/"is attributed to" (never "flows up/
--             through", though "flow" as a NOUN for a payment is fine); explain a
--             neutralising corporate owner (optionally "blocker entity"); "head
--             office and a PE" ok, never "pairing"; no meta/apology sentences.
--   patterns- ground a negative in the concrete (name what would trigger it, then
--             confirm absence); use the real amounts/parties/instruments; name
--             jurisdiction + tax treatment; tie the consequence to the specific
--             article/paragraph; scope to what was reviewed; state what a rule
--             presupposes for a definitional row.
--   length  - one to two crisp sentences; the shortest rows are one sentence.
--
-- Built by INSERT from the live v7 row (append pattern, like v6 on v5), so it
-- carries v7's factsheet grounding + status-consistency verbatim and only adds
-- the wording block. Model / template / temperature / max_tokens inherited.
-- DRAFT, pending tax review.
--
-- DEPLOY ORDER: v7 must be active first (this reads FROM version 7). Both idempotent.
-- Flip: demote active < 8, INSERT guarded by NOT EXISTS, re-assert active, RAISE
-- if the v7 source row was missing.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'appendix_system' AND is_active = true AND version < 8;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'appendix_system',
  8,
  v7.system_prompt || E'\n\n' || $wording$=== WORDING AND HOUSE PATTERNS (how a Svalner adviser writes each row) ===
WORDS:
- "entity" / "entities" is the neutral default for a group member. "company" / "corporation" is fine where it reads naturally ("a Dutch company treated as a corporation for US tax", "the Dutch companies"); just do not mechanically call every entity "the company".
- How a tax result reaches an owner: write that the result "is allocated to" or "is attributed to" that owner. NEVER "flows up", "flow up" or "flows through" for that. Do NOT use "flow" to mean a transaction or a payment either: call a transaction a "transaction" and a payment a "payment" ("the only US-to-NL transaction is a USD 31k dividend", not "flow"). Example: "the results of X and Y are allocated to Z for US tax purposes".
- When a payment or a disregarded entity's result is intercepted by an owner its state taxes as a corporation, EXPLAIN why that neutralises the mismatch (the owner is taxed as a corporation and is itself not a taxpayer in that state, so no deduction-without-inclusion or double deduction arises). You may call such an owner a "blocker entity", but the explanation matters more than the label.
- Prefer "disregarded for US purposes" over "a hybrid entity for check-the-box purposes".
- No invented shorthand. "head office and a PE" is fine; never "head office and PE pairing" or "head office/PE structure". Describe a deemed internal payment plainly.
- BANNED PHRASES (never write these; use plain, spoken professional English, the way an adviser talks): "runs through the structure/chain" ("runs through" is not idiomatic; say what happens); "sit well above" / "well above" / "well over" (write the plain figure or "above the 25% threshold"); "stakes" (write "shareholding", or "holds 100%"); "on these facts" / "on these ownership levels" (just state the conclusion); "this is not a live question" / "not a live question"; "does not come into play" (write "is not relevant"); "financing chain" (write "structure"). We are writing a memo: short, plain, direct.
- No meta or apology sentences ("the model did not ...", "confirm manually", "cannot be assessed"). Never refer to "the file", "the documents" or "the dossier" as an actor ("the file does not trace ...", "the documents do not show ..."). Phrase a missing or unconfirmed fact as an open point instead, led by "it is unclear whether ..." (or "it is not established that ...", "we have not confirmed that ..."). If confirming it later would change the outcome, add that the provision would then need to be revisited.

PATTERNS (what makes a row read like the adviser wrote it):
- Ground a negative in the concrete: name what WOULD trigger the condition and confirm its absence ("no entity has transferred instruments under repo or securities-lending arrangements"; "no entity runs a foreign branch or fixed place of business"). Do not just assert "no hybrid mismatch".
- Use the real facts: name the actual amounts, parties and instruments reviewed (the cost-plus service fee, the name-use fee, the domestic interest; a USD 70.4m loan) rather than talking in the abstract.
- Name the jurisdiction and its tax treatment: "deductible in Ireland", "taxed in the US", "included in its Dutch taxable profit", not "treated the same on both sides".
- Tie the consequence to the specific article or paragraph: "article 12aa(1)(a) does not apply and no deduction is denied on this ground", "article 12af recapture is not in point", "the dual-residence condition under this article is not met".
- Scope the conclusion to what you actually reviewed: "on the payments reviewed", "in the shareholding chain we reviewed".
- For a definitional / precondition row, state what the rule presupposes, then confirm its absence: "The reverse-hybrid rule presupposes a Dutch partnership (samenwerkingsverband) that is transparent for Dutch tax but non-transparent to a related foreign participant. No such entity exists in the structure."

LENGTH: one to two crisp sentences; the shortest rows are a single sentence. State the fact and its consequence once; do not restate the condition back to the reader, and do not pad.$wording$,
  v7.user_prompt_template,
  v7.model,
  v7.temperature,
  v7.max_tokens,
  true,
  'DRAFT, pending tax review. v8: v7 plus a WORDING AND HOUSE PATTERNS block derived from the advisor hand-rewrite (WMC, 9 Jul 2026): entity-default but company/corporation ok; "is allocated to"/"is attributed to" not "flows up/through" (flow-as-noun ok); explain a neutralising corporate owner (optionally "blocker entity"); "head office and a PE" ok, never "pairing"; no meta/apology sentences; ground negatives in concrete facts, name jurisdiction+treatment, tie to the specific article, scope to what was reviewed; one to two crisp sentences. Built by INSERT from live v7; model/template/temperature/max_tokens inherited. Deploy after v7.'
FROM atad2_prompts v7
WHERE v7.key = 'appendix_system' AND v7.version = 7
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'appendix_system' AND version = 8
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'appendix_system' AND version = 8;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'appendix_system' AND version = 8
      AND system_prompt LIKE '%=== WORDING AND HOUSE PATTERNS%'
      AND system_prompt LIKE '%blocker entity%'
      AND system_prompt LIKE '%is allocated to%'
  ) THEN
    RAISE EXCEPTION 'appendix_system v8 did not apply: the source v7 row is missing or inactive. Deploy v7 first, then re-run this migration.';
  END IF;
END $$;
