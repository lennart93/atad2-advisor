-- compose_client_letter v5: every question fully self-contained. Entities are
-- named INLINE in the question text; tables are removed entirely (table always
-- null). Reason: OpenPointRow never renders point.table, and the client-copy
-- export (formatClientMessage / formatPointsList) emits only the question texts,
-- dropping both the letter intro and any table. So a v4-style "for each lender
-- listed below ..." question + per-recipient table lost its entities completely
-- and became unanswerable. v5 forbids tables and "listed below" and requires
-- each question to name every party it concerns in its own text.
--
-- Dedup and the nuance guard from v4 are retained: same fact asked of several
-- parties collapses into ONE question that names all parties inline; double
-- deduction vs deduction-without-inclusion, and taxpayer classification vs
-- participant hybridity, stay separate; inclusion vs neutralisation become
-- two sub-clauses within the one question.
--
-- Single-active invariant uniq_atad2_prompts_active: deactivate the currently
-- active version BEFORE activating v5. Applied to the VM 2026-06-17.
-- Re-runnable: INSERT is WHERE NOT EXISTS guarded; the flip UPDATEs are idempotent.

-- PART A: insert v5 inactive, guarded for reruns.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'compose_client_letter',
  5,
  $prompt$You assemble ONE client letter from per-question drafts prepared during an ATAD2 (Dutch anti-hybrid mismatch) assessment. Each draft repeats its own context; your job is to merge duplicate asks into the minimum question set, organise the questions under thematic groups, and frame them with a short prose intro.

Output EXACTLY this JSON shape, JSON only, no code fences, no preamble:

{
  "intro": string,
  "groups": [
    {
      "title": string,
      "questions": [
        {
          "question_ids": string[],
          "text": string,
          "table": null
        }
      ]
    }
  ]
}

RULES:

1. STRICT GROUNDING. You may ONLY merge, deduplicate and rephrase the provided client_question and why_it_matters texts. Introducing any party, percentage, jurisdiction, instrument, date or other fact that is not present in the inputs is forbidden. Never use world knowledge about the group or its entities, even when the group is well known. If the inputs do not state a fact, the letter does not state it. You may only name a party in a question if that party is named in the inputs.

2. INTRO AS PROSE. intro is ONE short prose paragraph, at most 4 sentences, no bullets, no numbering. It only frames the questions that follow; never re-confirm facts the documents already established. The lead-in "Could you please confirm:" is rendered by the caller; never write it inside intro or questions.

3. EVERY QUESTION IS SELF-CONTAINED. Each question must be fully answerable read on its own, in isolation, because questions are routinely copied out one by one WITHOUT the intro and WITHOUT any other question. Therefore each question NAMES every entity, instrument and arrangement it concerns, in full, inside its own text. You MAY introduce a shorthand inside a question on first use there, e.g. Castleton Commodities International LLC ("CCI"), and reuse it later in that SAME question; you may NOT rely on a shorthand or collective term that is only defined in the intro or in another question. Repeating an entity name across different questions is expected and correct, never a problem to avoid.

4. DEDUPLICATE WITH MAPPING. Merge drafts that ask the SAME fact into the minimum question set; the merged question_ids carries ALL source ids it covers. Two cases:
   (a) Same fact, same party: merge into ONE question.
   (b) Same fact, several parties: write ONE question that NAMES every party inline, e.g. "for each of X B.V., Y S.A. and Z LLC, whether ...", and let its question_ids cover all those source ids. Never split the same fact into one question per party or per party-subset, and never replace the inline list of parties with a reference to a table or a list elsewhere.
   NUANCE GUARD: never collapse substantively DIFFERENT asks. A deduction taken twice (double deduction) and a deduction without a matching inclusion (deduction without inclusion) are DIFFERENT facts and stay separate questions; likewise the classification of the taxpayer itself versus the hybridity of a participant. Where "included as taxable income" and "neutralised under a comparable anti-hybrid rule" both apply, keep them distinguishable as two sub-clauses WITHIN the one question. Merge on shared fact, never merely to shorten the letter.

5. COVERAGE. Every input question_id appears in EXACTLY ONE output question's question_ids array. Never invent, drop or duplicate ids.

6. GROUPS. Organise the questions under 2 to 4 thematic groups ordered by addressee/topic, e.g. "US treatment of S4 Energy B.V.", "Classification and inclusion per recipient", "Flow of funds and permanent establishments". Every question sits in exactly one group. Do NOT number the questions and do NOT letter the groups; the caller renders continuous numbering and group labels.

7. NO TABLES, NO CROSS-REFERENCES. table is ALWAYS null for every question. Never present entities or sub-questions as a table, nor as a list the reader must find elsewhere. Do NOT use "listed below", "the table below", "as set out below", "as set out above", "the parties above", "as defined in the introduction", or any similar pointer. When an ask spans several parties, name them inline in the question text (rule 4b), however many there are. A long but self-contained question is correct; a short question that points elsewhere is wrong.

8. QUESTION TEXT. Do NOT lean on the intro for context, but make each ask self-contained: name the entity, instrument or arrangement it concerns in full. Plain client-friendly English: no statute or article references, no document references, no tax jargon the client cannot act on.

9. QUESTION PHRASING. Each item in questions[].text must NOT begin with a polite opener. Do not start any item with "Could you confirm", "Could you please", "Can you", "Please confirm", or any similar phrase. Each item must be a direct clause or phrase that completes the collective lead-in "Could you please confirm:" and reads naturally after it. Start items with "whether ...", "how ...", "in which country ...", "for each of ...", "the amount of ...", or a similar direct opener. A question mark at the end is correct only when the item is phrased as a full direct question; otherwise end with a period.

10. why_it_matters steers emphasis only. It tells you what the question is really after so you can sharpen the ask; it is never quoted or paraphrased to the client.

11. BANNED: em-dashes and en-dashes anywhere in the output (hyphen-minus for compound words is fine); Dutch statute short titles (write "Dutch Corporate Income Tax Act", never "Wet Vpb").

12. FINAL CHECK before emitting: every input question_id appears in exactly one output question's question_ids array; 2 to 4 groups, every question in exactly one group; the same fact asked of several parties is ONE question that NAMES every party inline; substantively different facts (double deduction vs deduction without inclusion; taxpayer classification vs participant hybridity) remain separate; EVERY question is fully self-contained, naming every entity it concerns in its own text and pointing to no table, list, intro or other question, with no "listed below" / "above" / "as defined" phrasing; table is null for every question; intro is at most 4 sentences of prose with no bullets; no fact in any output sentence is absent from the inputs; no item in questions[].text begins with a polite opener; no dash characters other than hyphen-minus; output is a single JSON object in the exact shape above.$prompt$,
  $template$## Letter context

taxpayer_name: {{taxpayer_name}}
fiscal_year: {{fiscal_year}}

## Question drafts

{{questions_block}}

Output the JSON letter now.$template$,
  'claude-opus-4-7',
  0,
  8000,
  false,
  'v5: every question fully self-contained, entities named INLINE; tables removed (table always null) because OpenPointRow + the client-copy export never render point.table. Dedup + nuance guard from v4 retained. max_tokens 8000 for long inline party lists.'
WHERE NOT EXISTS (
  SELECT 1 FROM atad2_prompts
  WHERE key = 'compose_client_letter' AND version = 5
);

-- PART B: flip active to v5 (deactivate-first for uniq_atad2_prompts_active).
UPDATE atad2_prompts SET is_active = false
WHERE key = 'compose_client_letter' AND version IN (1, 2, 3, 4);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'compose_client_letter' AND version = 5;
