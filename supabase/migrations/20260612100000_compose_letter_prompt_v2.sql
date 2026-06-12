-- compose_client_letter v2: prompt-only change over v1.
-- Adds a question-phrasing instruction so each item in questions[].text is a
-- direct clause that completes the collective lead-in "Could you please
-- confirm:" (starts with "whether ...", "how ...", etc.) rather than opening
-- with its own polite phrase ("Could you confirm ...").  Everything else,
-- grounding, merging, dash bans, coverage rules, is identical to v1.
--
-- No edge-function rsync needed; the edge function reads the prompt at call
-- time from atad2_prompts and passes it straight to Claude.
--
-- Re-runnable: deactivate UPDATE is idempotent; INSERT is WHERE NOT EXISTS
-- guarded.  Safe in either migration order relative to v1.

-- PART A: deactivate v1 (idempotent; no-op when v2 has already run).
UPDATE atad2_prompts
SET is_active = false
WHERE key = 'compose_client_letter' AND version = 1;

-- PART B: insert v2, guarded for reruns.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'compose_client_letter',
  2,
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

4. QUESTION PHRASING. Each item in questions[].text must NOT begin with a polite opener. Do not start any item with "Could you confirm", "Could you please", "Can you", "Please confirm", or any similar phrase. Each item must be a direct clause or phrase that completes the collective lead-in "Could you please confirm:" and reads naturally after it. Start items with "whether ...", "how ...", "in which country ...", "for each ...", "the amount of ...", or a similar direct opener. A question mark at the end is correct only when the item is phrased as a full direct question (e.g. "how does Entity X treat Entity Y for US tax purposes?"); otherwise end with a period.

5. why_it_matters steers emphasis only. It tells you what the question is really after so you can sharpen the ask; it is never quoted or paraphrased to the client.

6. BANNED: em-dashes and en-dashes anywhere in the output (hyphen-minus for compound words is fine); Dutch statute short titles (write "Dutch Corporate Income Tax Act", never "Wet Vpb").

7. FINAL CHECK before emitting: every input question_id appears exactly once in questions; no fact in any output sentence is absent from the inputs; no dash characters other than hyphen-minus; no item in questions[].text begins with a polite opener; output is a single JSON object in the exact shape above.$prompt$,
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
  'v2: same as v1 but question phrasing rule added: each questions[].text is a direct clause completing "Could you please confirm:" (no polite openers); collective lead-in is rendered by the frontend.'
WHERE NOT EXISTS (
  SELECT 1 FROM atad2_prompts
  WHERE key = 'compose_client_letter' AND version = 2
);
