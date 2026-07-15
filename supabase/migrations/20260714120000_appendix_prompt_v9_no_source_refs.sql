-- appendix_system v9: a SOURCE REFERENCES, STATUS VOCABULARY AND CADENCE block
-- on top of v8.
-- Trigger (advisor review, 14 Jul 2026): a Part B row wrote "Question 28 confirms
-- that ..." into the client-facing reasoning. Rows must NEVER name the process
-- that produced a fact (question numbers, the questionnaire, the assessment, the
-- tool); v8 already banned "the file/documents" as an actor, this extends the
-- same rule to the questionnaire layer. The advisor also asked for a slightly
-- more staccato cadence (shorter sentences, split anything carrying more than
-- one list or qualifier) and for a binary status vocabulary: the model no longer
-- emits "N/A" (that OVERRIDES the v4 N/A instruction carried in the base text);
-- gates and moot rows get their "N/A" from the deterministic backstop in the
-- edge function, and beyond that "N/A" is the advisor's own dropdown choice.
-- The edge function coerces a stray model "N/A" to "Not triggered" regardless
-- (index.ts + normalizeAiNaStatuses on the frontend), so this rule mainly keeps
-- the model's REASONING aligned with the status the reader ends up seeing.
--
-- Built by INSERT from the live v8 row (append pattern, like v8 on v7), so it
-- carries v8's wording/house-patterns block verbatim and only adds this block.
-- Model / template / temperature / max_tokens inherited.
--
-- DEPLOY ORDER: v8 must be active first (this reads FROM version 8). Idempotent.
-- Flip: demote active < 9, INSERT guarded by NOT EXISTS, re-assert active, RAISE
-- if the v8 source row was missing.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'appendix_system' AND is_active = true AND version < 9;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'appendix_system',
  9,
  v8.system_prompt || E'\n\n' || $srcref$=== SOURCE REFERENCES AND CADENCE ===
NEVER NAME THE PROCESS THAT PRODUCED A FACT. The reasoning reads as the adviser's own analysis of the facts, not as output of a questionnaire or a tool:
- BANNED as a source, subject or reference: "Question 28" or ANY question number ("Q4", "question 12", "the answer to question ..."); "the questionnaire"; "the intake"; "the client's answer(s)" / "the answers provided"; "the assessment"; "the analysis"; "the tool"; "the system"; "the review performed". None of these ever confirms, shows, indicates or states anything. This is the same rule as for "the file" / "the documents" / "the dossier": sources never act.
- Rewrite pattern: drop the source and state the fact itself. NOT "Question 28 confirms that any third-party dealings are ordinary commercial banking relationships priced on standard terms" BUT "Third-party dealings are ordinary commercial banking and supplier relationships on standard terms."
- If it matters that a fact rests on a client confirmation, write "the group has confirmed that ..." (or "management has confirmed that ..."), never the question, form or step it was confirmed in.

STATUS VOCABULARY (this OVERRIDES any earlier instruction to return "N/A"):
- Return only "Triggered", "Not triggered" or "Insufficient information". NEVER return "N/A". Which rows are out of scope or moot is decided deterministically after your run, and beyond that "N/A" is the adviser's own call.
- Where you would have written "N/A", answer the binary question instead: does the condition fire on these facts or not. A satisfied scope gate is "Triggered" (the gate condition holds); a downstream condition whose trigger is absent is "Not triggered", with one short sentence saying why it is not reached.

CADENCE (staccato):
- Prefer two short sentences over one long one. Split any sentence that carries more than one list, or a list plus a qualifier. A sentence enumerating payments does only that; the conclusion gets its own sentence.
- Lead with the key fact or the conclusion. The article consequence follows in its own short sentence ("No structured arrangement within the meaning of article 12ac is present.").
- Keep enumerations tight: name the items once, no re-description of each item as it is listed.$srcref$,
  v8.user_prompt_template,
  v8.model,
  v8.temperature,
  v8.max_tokens,
  true,
  'DRAFT, pending tax review. v9: v8 plus a SOURCE REFERENCES, STATUS VOCABULARY AND CADENCE block (advisor review 14 Jul 2026): never reference question numbers, the questionnaire, the assessment or any tool as the source of a fact (extends the v8 file/documents rule); state the fact itself, or "the group has confirmed that ..." where the confirmation matters; model status vocabulary is binary (Triggered / Not triggered / Insufficient information, NEVER N/A; overrides the v4 N/A instruction; the moot backstop and the advisor own N/A); slightly more staccato cadence (split long sentences, conclusion in its own sentence, tight enumerations). Built by INSERT from live v8; model/template/temperature/max_tokens inherited. Deploy after v8.'
FROM atad2_prompts v8
WHERE v8.key = 'appendix_system' AND v8.version = 8
AND NOT EXISTS (
  SELECT 1 FROM atad2_prompts WHERE key = 'appendix_system' AND version = 9
);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'appendix_system' AND version = 9;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM atad2_prompts
    WHERE key = 'appendix_system' AND version = 9
      AND system_prompt LIKE '%=== SOURCE REFERENCES AND CADENCE%'
      AND system_prompt LIKE '%ANY question number%'
      AND system_prompt LIKE '%NEVER return "N/A"%'
      AND system_prompt LIKE '%=== WORDING AND HOUSE PATTERNS%'
  ) THEN
    RAISE EXCEPTION 'appendix_system v9 did not apply: the source v8 row is missing or inactive. Deploy v8 first, then re-run this migration.';
  END IF;
END $$;
