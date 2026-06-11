-- compose_client_letter v1: prompt for the "Compose client letter" action in
-- the open-questions panel. The edge action (prefill-documents, action
-- 'compose_client_letter') makes ONE Claude call that merges the per-question
-- client_question drafts into a single letter: shared "We understand that ..."
-- facts stated exactly once, plus one ask per question without the repeated
-- context. The action does NO database writes; flips and audit events stay
-- client-side.
--
-- DEPLOY: goes live together with the prefill-documents edge-function rsync
-- (deploy_client_letter_v1.sh). Safe in EITHER order: the UI soft-fails on
-- both halves missing ("Unknown action: ..." from the old index.ts and
-- "No active prompt for ..." from loadActivePrompt both surface as the
-- "Letter composition is not deployed yet" toast).
--
-- Re-runnable: the constraint rebuild is drop-and-recreate and the INSERT is
-- WHERE NOT EXISTS guarded. No deactivation UPDATE needed for a first version.

-- PART A: widen the atad2_prompts key CHECK to admit 'compose_client_letter'.
-- DELIBERATE DEVIATION from the usual hardcoded drop-and-recreate list: the
-- live VM also carries appendix prompt keys (appendix_system and friends)
-- deployed from the technical-appendix branch, whose migrations are NOT in
-- this branch. A hardcoded list would make ADD CONSTRAINT fail while
-- validating those existing rows. So the new CHECK is rebuilt from the UNION
-- of the required key list and whatever keys already exist in the table,
-- which is idempotent and branch-order-proof.
DO $$
DECLARE
  key_list text;
BEGIN
  SELECT string_agg(quote_literal(k), ',') INTO key_list
  FROM (
    SELECT unnest(ARRAY[
      'prefill_stage1_system',
      'prefill_stage2_system',
      'prefill_swarm_system',
      'structure_stage1_initial',
      'structure_stage1_refine',
      'structure_stage2_initial',
      'structure_stage2_refine',
      'memo_system',
      'compose_client_letter'
    ]) AS k
    UNION
    SELECT DISTINCT key FROM public.atad2_prompts
  ) keys;

  EXECUTE 'ALTER TABLE public.atad2_prompts DROP CONSTRAINT IF EXISTS atad2_prompts_key_check';
  EXECUTE format(
    'ALTER TABLE public.atad2_prompts ADD CONSTRAINT atad2_prompts_key_check CHECK (key IN (%s))',
    key_list
  );
END $$;

-- PART B: insert the v1 prompt, guarded for reruns.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'compose_client_letter',
  1,
  $prompt$You assemble ONE client letter from per-question drafts prepared during an ATAD2 (Dutch anti-hybrid mismatch) assessment. Each draft repeats its own context; your job is to merge the shared context so it is stated once, and keep one clean ask per question.

Output EXACTLY this JSON shape, JSON only, no code fences, no preamble:

{
  "understandings": string[],
  "questions": [{ "question_id": string, "text": string }]
}

RULES:

1. STRICT GROUNDING. You may ONLY merge, deduplicate and rephrase the provided client_question and why_it_matters texts. Introducing any party, percentage, jurisdiction, instrument, date or other fact that is not present in the inputs is forbidden. Never use world knowledge about the group or its entities, even when the group is well known. If the inputs do not state a fact, the letter does not state it.

2. understandings: the shared "We understand that ..." facts across the inputs, merged and deduplicated. Each distinct fact appears EXACTLY once in the whole list, even when several drafts repeat it. Phrase every entry as a standalone sentence that reads naturally after the lead-in "We understand that:". Do NOT repeat the words "We understand that" inside the entries. No numbering and no bullet characters inside the strings. When the drafts share no facts, return an empty array.

3. questions: exactly one entry per input question_id. Never invent ids, never merge two inputs into one entry, never split one input into two. Do NOT repeat the merged context that already sits in understandings, but keep each ask self-contained enough to answer on its own: name the entity, instrument or arrangement it concerns. Plain client-friendly English: no statute or article references, no document references, no tax jargon the client cannot act on. Do not number the questions; the caller numbers them.

4. why_it_matters steers emphasis only. It tells you what the question is really after so you can sharpen the ask; it is never quoted or paraphrased to the client.

5. BANNED: em-dashes and en-dashes anywhere in the output (hyphen-minus for compound words is fine); Dutch statute short titles (write "Dutch Corporate Income Tax Act", never "Wet Vpb").

6. FINAL CHECK before emitting: every input question_id appears exactly once in questions; no fact in any output sentence is absent from the inputs; no dash characters other than hyphen-minus; output is a single JSON object in the exact shape above.$prompt$,
  $template$## Letter context

taxpayer_name: {{taxpayer_name}}
fiscal_year: {{fiscal_year}}

## Question drafts

{{questions_block}}

Output the JSON letter now.$template$,
  'claude-opus-4-7',
  0,
  4000,
  true,
  'v1: compose ONE client letter from per-question drafts; merged understandings stated once + one ask per question_id; strict grounding, no dashes.'
WHERE NOT EXISTS (
  SELECT 1 FROM atad2_prompts
  WHERE key = 'compose_client_letter' AND version = 1
);
