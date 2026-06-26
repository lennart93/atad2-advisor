-- compose_client_letter v4: collapse "same fact asked of multiple recipients"
-- into ONE question + a per-recipient table (per-entity grid threshold lowered
-- from 4+ to 2+; rule 4 gains an explicit case (b)). Nuance guard HARDENED so
-- substantively different asks never merge: double deduction vs deduction
-- without inclusion, and the taxpayer's own classification vs a participant's
-- hybridity, stay as separate questions. All other v3 rules carried over
-- verbatim (grounding, intro, define-names-once, coverage, groups, phrasing,
-- dash + statute bans).
--
-- Motivation: under v3 the SAME inclusion question asked about overlapping but
-- non-identical recipient sets (e.g. "interest included at CCI + Percival" and
-- "interest included at CCI + Leclanche") stayed two near-duplicate questions,
-- because rule 4 forbade cross-party merging and rule 7's table only triggered
-- at 4+ entities. v4 routes those into one table.
--
-- Single-active invariant: there is a unique constraint uniq_atad2_prompts_active
-- (one is_active row per key), enforced per statement. ALWAYS deactivate the
-- currently-active version BEFORE activating the new one, or the activate
-- statement violates the constraint. Applied to the VM 2026-06-17.
--
-- Re-runnable: INSERT is WHERE NOT EXISTS guarded; the flip UPDATEs are idempotent.

-- PART A: insert v4 inactive, guarded for reruns.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'compose_client_letter',
  4,
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
          "table": { "columns": string[], "rows": string[][] } | null
        }
      ]
    }
  ]
}

RULES:

1. STRICT GROUNDING. You may ONLY merge, deduplicate and rephrase the provided client_question and why_it_matters texts. Introducing any party, percentage, jurisdiction, instrument, date or other fact that is not present in the inputs is forbidden. Never use world knowledge about the group or its entities, even when the group is well known. If the inputs do not state a fact, the letter does not state it.

2. INTRO AS PROSE. intro is ONE short prose paragraph, at most 4 sentences, no bullets, no numbering. It only frames the questions that follow; never re-confirm facts the documents already established. The lead-in "Could you please confirm:" is rendered by the caller; never write it inside intro or questions.

3. DEFINE NAMES ONCE. When an entity is mentioned 3 or more times across the letter, the intro introduces a shorthand on first mention, e.g. Castleton Commodities International LLC ("CCI"). Recurring sets of parties get ONE collective term defined in the intro, e.g. X B.V., Y B.V. and Z B.V. (together "the Dutch lenders"). After definition, questions use only the shorthand; never repeat a full entity list inside a question.

4. DEDUPLICATE WITH MAPPING. Merge drafts that ask the SAME fact into the minimum question set; the merged question_ids carries ALL source ids it covers. Two cases:
   (a) Same fact, same party: merge into ONE question.
   (b) Same fact, DIFFERENT parties: when the SAME underlying question is asked about several recipients or participants (for example "is the interest included in the taxable base" asked for one party, then another, then a subset of them), do NOT emit one question per party or per party-subset. Emit ONE question that states the shared ask, with a per-recipient table (see rule 7) listing every party, and let its question_ids cover all those source ids.
   NUANCE GUARD: never collapse substantively DIFFERENT asks. A deduction taken twice (double deduction) and a deduction without a matching inclusion (deduction without inclusion) are DIFFERENT facts and stay separate questions; likewise the classification of the taxpayer itself versus the hybridity of a participant. Where "included as taxable income" and "neutralised under a comparable anti-hybrid rule" both apply, keep them distinguishable, preferably as two columns of one recipient table rather than two separate questions. Merge on shared fact, never merely to shorten the letter.

5. COVERAGE. Every input question_id appears in EXACTLY ONE output question's question_ids array. Never invent, drop or duplicate ids.

6. GROUPS. Organise the questions under 2 to 4 thematic groups ordered by addressee/topic, e.g. "US treatment of S4 Energy B.V.", "Classification and inclusion per recipient", "Flow of funds and permanent establishments". Every question sits in exactly one group. Do NOT number the questions and do NOT letter the groups; the caller renders continuous numbering and group labels.

7. PER-RECIPIENT / PER-ENTITY GRID. When one ask applies to TWO OR MORE parties, output ONE question plus a table: the first column names the party (one row per party), the remaining columns one per sub-question (for example "included in the taxable base?", "neutralised under a local anti-hybrid rule?"). The question text introduces the table (e.g. "for each party listed below ..."). Prefer one question plus a table over repeating the same ask for different parties or subsets. table is null only for an ask that genuinely concerns a single party. Never use a table to introduce a party or fact absent from the inputs.

8. QUESTION TEXT. Do NOT repeat context that already sits in the intro, but keep each ask self-contained enough to answer on its own: name the entity, instrument or arrangement it concerns (using the defined shorthand). Plain client-friendly English: no statute or article references, no document references, no tax jargon the client cannot act on.

9. QUESTION PHRASING. Each item in questions[].text must NOT begin with a polite opener. Do not start any item with "Could you confirm", "Could you please", "Can you", "Please confirm", or any similar phrase. Each item must be a direct clause or phrase that completes the collective lead-in "Could you please confirm:" and reads naturally after it. Start items with "whether ...", "how ...", "in which country ...", "for each ...", "the amount of ...", or a similar direct opener. A question mark at the end is correct only when the item is phrased as a full direct question (e.g. "how does Entity X treat Entity Y for US tax purposes?"); otherwise end with a period.

10. why_it_matters steers emphasis only. It tells you what the question is really after so you can sharpen the ask; it is never quoted or paraphrased to the client.

11. BANNED: em-dashes and en-dashes anywhere in the output (hyphen-minus for compound words is fine); Dutch statute short titles (write "Dutch Corporate Income Tax Act", never "Wet Vpb").

12. FINAL CHECK before emitting: every input question_id appears in exactly one output question's question_ids array; 2 to 4 groups, every question in exactly one group; the same fact asked of several parties is ONE question with a recipient table, not several near-identical questions; substantively different facts (double deduction vs deduction without inclusion; taxpayer classification vs participant hybridity) remain separate; intro is at most 4 sentences of prose with no bullets; no fact in any output sentence or table is absent from the inputs; no item in questions[].text begins with a polite opener; no dash characters other than hyphen-minus; output is a single JSON object in the exact shape above.$prompt$,
  $template$## Letter context

taxpayer_name: {{taxpayer_name}}
fiscal_year: {{fiscal_year}}

## Question drafts

{{questions_block}}

Output the JSON letter now.$template$,
  'claude-opus-4-7',
  0,
  6000,
  false,
  'v4: same fact asked of multiple recipients collapses into ONE question + per-recipient table (grid threshold lowered from 4+ to 2+; rule 4 case b). Nuance guard hardened: double deduction vs deduction-without-inclusion, and taxpayer classification vs participant hybridity, stay separate. All other v3 rules verbatim.'
WHERE NOT EXISTS (
  SELECT 1 FROM atad2_prompts
  WHERE key = 'compose_client_letter' AND version = 4
);

-- PART B: flip active to v4 (deactivate-first for uniq_atad2_prompts_active).
UPDATE atad2_prompts SET is_active = false
WHERE key = 'compose_client_letter' AND version IN (1, 2, 3);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'compose_client_letter' AND version = 4;
