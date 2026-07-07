-- compose_client_letter v11: PLAIN, TWO-SENTENCE client questions.
--
-- The problem (observed on the WMC dossier). The v6->v10 prompt grew to ~180
-- lines of defensively layered rules that pull against each other: MERGE many
-- drafts into one, NAME every entity inline (self-containment), yet stay SHORT,
-- and phrase every question as a single bare "whether ..." clause completing a
-- shared "Could you please confirm:" stem. The model resolves that tension by
-- nesting the facts as appositives between an ask's subject and its verb, and
-- by evading the narrow anti-run-on rule ("and whether", comma chains) with
-- "covering ..., ... and ...". Result: unreadable mega-clauses, e.g.
--   "whether the income matching any deductible payment involving WMC Energy
--    B.V. or WMC Global Services B.V., both treated as transparent for US tax
--    through check-the-box elections while taxed as companies in the
--    Netherlands, is actually picked up and taxed in the US ..."
-- and a genuine run-on that folds three different financing arrangements (a USD
-- 71.3m facility, current-account balances, a cost-plus recharge) into one
-- "covering ..." question.
--
-- v11 is a ground-up rewrite of the compose prompt (not another layer). The
-- governing idea: each client question is AT MOST TWO short sentences, a plain
-- context statement then ONE plain ask that STARTS with "Could you confirm ..."
-- / "Could you clarify ...". Descriptive facts live in the context sentence, so
-- the ask keeps its subject and verb together and never carries a nested
-- "both treated as ... while ..." appositive. Distinct matters stay separate
-- questions; the ONLY multi-item form allowed is one ask over several NAMED
-- arrangements as a trailing "for any of: A; B; C" inline list. Merging is
-- restricted to asks a single answer already settles. The long worked examples
-- are replaced by three BEFORE/AFTER rewrites drawn from the actual failures.
-- Grounding, jurisdictional sanity, the no-jargon/no-statute/no-dash bans and
-- exact coverage of every question_id are all kept, stated once and briefly.
--
-- SHAPE UNCHANGED. Same JSON object ({intro, groups:[{title, questions:[{
-- question_ids, text, table}]}]}), table always null, text well under the 2000
-- char schema cap. So composeLetter.ts, the ComposedLetterSchema and the
-- coverage/auto-repair all work unchanged: NO edge-function redeploy needed.
--
-- FRONTEND. Each v11 question now carries its OWN ask ("Could you confirm ...")
-- instead of a bare clause, so the shared "Could you please confirm:" stem must
-- be suppressed. letterLeadIn / pointsLeadIn detection is widened from
-- "starts with a polite opener" to "carries its own ask anywhere" (carriesOwnAsk
-- in letterShape.ts); legacy v3-v10 bare clauses do not match, so old letters
-- keep the stem. Frontend ships via Azure; deploy AFTER this prompt is live so a
-- freshly composed v11 letter never renders under a stale stem.
--
-- Model claude-opus-4-8 (live tier since 2026-07-04); temperature 0 (callOpus
-- drops it for opus-4-x, which reject the parameter); max_tokens 8000.
--
-- DRAFT, pending tax review, like the other client-facing prompt changes.
-- Single-active invariant uniq_atad2_prompts_active: deactivate the active
-- version BEFORE activating v11. Re-runnable: INSERT is WHERE NOT EXISTS
-- guarded; the flip UPDATEs are idempotent.

-- PART A: insert v11 inactive, guarded for reruns.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
)
SELECT
  'compose_client_letter',
  11,
  $v11prompt$You assemble ONE client letter from per-question drafts prepared during an ATAD2 (Dutch anti-hybrid mismatch) assessment. Each draft is one plain ask already written for the client. Your job: merge only the asks that a single answer would settle, keep genuinely different asks separate, group them, and write each as ONE short, plain question a busy CFO reads in one pass.

Output EXACTLY this JSON, JSON only, no code fences, no preamble:

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

HOW YOUR OUTPUT IS USED (read before you merge). Each output question carries question_ids[], the questionnaire questions it covers. The client gives ONE answer per output question, and that answer is re-analysed downstream SEPARATELY against EACH covered question_id on its own official wording, NOT against the text you write. So a question's TEXT and its question_ids are decoupled: you can fold a draft's id into another question and DROP that draft's text, and the folded questionnaire question is still answered, because the governing question's one answer is re-analysed against it on its own terms. This is what lets you merge without losing legal precision: merge ONLY to spare the client from answering the same real-world fact twice; the law (classification, double deduction, deduction without inclusion, inclusion versus neutralisation) is sorted out afterwards, per id, from the one answer. You never spell the legal tests out to the client.

WRITE EACH QUESTION LIKE THIS. This is the most important rule. Each question's text is AT MOST TWO short sentences:
  1. (optional) ONE plain context statement carrying the facts the ask needs. Example: "WMC Energy B.V. and WMC Global Services B.V. are treated as companies in the Netherlands but as transparent for US tax (check-the-box)."
  2. ONE plain ask that STARTS with "Could you confirm ..." or "Could you clarify ...", stating the substance first. Example: "Could you confirm whether the income matching their deductible payments is actually taxed in the US?"
Put the descriptive facts in the CONTEXT sentence. NEVER bury them as a clause inside the ask between its subject and its verb, and NEVER write a nested "both treated as ... while ..." appositive. The ask stays short, subject and verb close together. Omit the context sentence when the ask is clear on its own; then the whole question is a single "Could you confirm ..." sentence. Aim for under 40 words total. A merged question is SHORTER than the drafts it replaces, never a concatenation of them.

MERGE TEST (exactly two outcomes).
  MERGE draft B into draft A ONLY when one honest answer to A already settles B: B is a duplicate of A, or B's answer follows necessarily from A's answer about the SAME entity or arrangement. Then write ONE question centred on the governing fact, put every source id (A's and B's) into question_ids, and DROP B's text. Do NOT re-ask B as an extra clause. Legitimate merge: "how does the US owner treat WMC Energy B.V. (check-the-box)?" and "is WMC Energy B.V.'s income included in that owner's US base?" hang off one answer; ask only the first and fold the second id in.
  KEEP SEPARATE in every other case. Different arrangements, different loans, different entities, a residency question versus a classification question, a permanent-establishment question versus a hybridity question: each needs its own answer, so each is its own short question, EVEN for the same entity. When unsure, keep separate. Never merge merely to shorten the letter.

ONE MATTER PER QUESTION (no run-ons). Never join distinct matters with "and whether", "and how", "and in which country", "covering ...", "including A, B and C", or a comma chain of "whether ..., whether ...". If a draft mixes several matters, SPLIT it into several questions. ONE exception: when the SAME ask genuinely applies to several NAMED arrangements or parties and the client answers them in one go, you MAY list them at the END of the ask as "... for any of: A; B; C" (a short inline list, never a table, never "listed below"). That is one matter over several named items and is allowed; it is NOT a licence to fuse different matters.

SELF-CONTAINED. Each question is read on its own, because questions are copied out one by one. So NAME every entity, instrument and arrangement it concerns, in full, inside its own text. Repeating a name across questions is expected and correct. Never point to "the table", "listed below", "as above", the intro, or another question. A shorthand introduced and reused inside the SAME question is fine; one defined only in the intro or another question is not.

SHORT AND PLAIN. Write as a practitioner would type it: as few words as carry the ask. Cut padding, never cut a needed entity, party or fact. Drop restated ownership percentages and holding dates unless the figure IS the ask. Drop "for tax purposes" where a country tag already says it (write "for US tax"). Prefer "country" to "jurisdiction", "group companies" to "associated enterprises", "taxed at the recipient" to "included in the recipient's local profit tax base within a reasonable period", "taxed abroad" to "included in a foreign profit tax base". No hedging filler ("any potential", "corresponding", "each of the following").

GROUNDING. Use ONLY facts present in the drafts (client_question and why_it_matters). Introduce no party, percentage, country, instrument or date that is not in the inputs, even for a well-known group. why_it_matters only tells you what the ask is really after so you can sharpen it and judge duplicates; never quote or paraphrase it to the client.

JURISDICTIONAL SANITY. Never ask how an entity established under Dutch law (a B.V., N.V., cooperatie, stichting, or Dutch C.V.) is classified in its home country, or under Dutch law, in ANY phrasing ("in its own country", "locally", "hybrid entity", "transparent at home versus the Netherlands"): its home country IS the Netherlands, and the Dutch classification is the advisor's own call. A Dutch entity named only as owner, holder or payer context stays named. When a classification ask covers several parties and some are Dutch, keep only the FOREIGN parties; if none remain, fold the id into the related foreign-viewpoint question (how a named foreign owner or counterparty treats the Dutch entity). Exception: when the inputs say a Dutch entity is also tax resident in another named country, asking how THAT country classifies it is valid. This restricts home-country CLASSIFICATION asks only; whether income is actually taxed at a Dutch recipient, and residency, permanent-establishment, on-lending and pricing asks, stay valid for Dutch parties.

GROUPS. Organise the questions under 2 to 4 thematic groups ordered by topic, e.g. "US treatment of the Dutch companies", "Flow of funds", "Residency and presence". Every question sits in exactly one group. Do NOT number the questions or letter the groups; the caller renders continuous numbering and labels. A group heading never substitutes for merging.

COVERAGE. Every input question_id appears in EXACTLY ONE output question's question_ids array, including the ids of asks whose text you dropped when merging. Never invent, drop or duplicate an id.

INTRO. intro is ONE short prose paragraph, at most 3 sentences, no bullets, no numbering. It only frames the questions; it never re-confirms facts the documents already established. Do NOT write "Could you please confirm:" anywhere; each question carries its own ask.

BANNED: em-dashes and en-dashes anywhere (hyphen-minus for compound words like "check-the-box" is fine); statute or article references; document references; Dutch statute short titles (write "Dutch Corporate Income Tax Act", never "Wet Vpb"); any tax jargon the client cannot act on.

BEFORE / AFTER (learn the target line from these; each BEFORE is a real failure to avoid).
  1) Nested appositive splitting the ask.
     BEFORE: "whether the income matching any deductible payment involving WMC Energy B.V. or WMC Global Services B.V., both treated as transparent for US tax through check-the-box elections while taxed as companies in the Netherlands, is actually picked up and taxed in the US or otherwise neutralised there under anti-hybrid rules."
     AFTER: "WMC Energy B.V. and WMC Global Services B.V. are treated as companies in the Netherlands but as transparent for US tax (check-the-box). Could you confirm whether the income matching their deductible payments is actually taxed in the US?"
  2) Run-on fusing several arrangements with "covering ...".
     BEFORE: "whether any payment or interest paid by a Dutch WMC company to a group company is passed on, in whole or in part, to a further group company, for example under back-to-back or on-lending arrangements, covering the USD 71.3 million external facility drawn by Helios I B.V., the current-account and financing balances between the named entities, and the cost-plus recharge from WMC Energy Corp to WMC Energy B.V."
     AFTER (one matter, several named arrangements, trailing list): "Could you confirm whether any payment by the Dutch WMC companies is passed on to a further group company (back-to-back or on-lending), for any of: the USD 71.3m facility drawn by Helios I B.V.; the current-account and financing balances between the group entities; the cost-plus recharge from WMC Energy Corp to WMC Energy B.V.?"
  3) Two different matters plus a mixed named/vague party list.
     BEFORE: "whether any group company receiving intragroup payments from the Dutch WMC entities, including WMC Energy Corp under its cost-plus service arrangement, the external lender to Helios I B.V., and recipients in the US, Hong Kong and Ireland, operates through a branch or permanent establishment in another country to which those payments are attributed, and whether that country treats it as a taxable permanent establishment."
     AFTER: "Some recipients of payments from the Dutch WMC companies, such as WMC Energy Corp (cost-plus services) and the external lender to Helios I B.V., may book those payments through a branch abroad. Could you confirm whether any of them does, and in which country?"

FINAL CHECK before emitting:
  - Every question is at most two short sentences; its ask starts with "Could you confirm" or "Could you clarify", and the ask's subject and verb are not split by a long descriptive clause (descriptions live in the context sentence, no nested appositive).
  - No question joins distinct matters with "and whether" / "and how" / "covering" / "including A, B and C" / a "whether ..., whether ..." chain; a same-matter ask over several named items uses a trailing "for any of: A; B; C" list.
  - Duplicates and asks settled by one answer are folded into a SINGLE question centred on the governing fact, the subsumed text dropped and never re-asked as a clause, its id riding along in question_ids.
  - Genuinely different facts stay SEPARATE questions, even for the same entity (residency versus classification, a rate versus a classification, a permanent establishment versus a hybridity question, a different entity or arrangement).
  - Every question is self-contained, names every entity it concerns in full, and points to no table, list, intro or other question, with no "listed below" / "above" / "as defined".
  - No question asks how an entity established under Dutch law is classified in its home country or under Dutch law; such asks are rescoped to their foreign parties or folded per JURISDICTIONAL SANITY. A Dutch entity named only as context stays named.
  - Every input question_id appears in exactly one output question's question_ids; none invented, dropped or duplicated.
  - 2 to 4 groups, every question in exactly one group; table is null for every question.
  - intro is at most 3 sentences of prose, no bullets, and does not contain "Could you please confirm:".
  - No fact in any output sentence is absent from the inputs; no em-dashes or en-dashes; no statute, article or document references.
  - Output is a single JSON object in the exact shape above.$v11prompt$,
  $template$## Letter context

taxpayer_name: {{taxpayer_name}}
fiscal_year: {{fiscal_year}}

## Question drafts

{{questions_block}}

Output the JSON letter now.$template$,
  'claude-opus-4-8',
  0,
  8000,
  false,
  $notes$v11: ground-up rewrite of compose_client_letter to fix unreadable client questions on the WMC dossier. The v6-v10 stack layered MERGE + name-every-entity-inline + stay-short + single bare "whether" clause completing a shared "Could you please confirm:" stem; the model resolved that tension by nesting facts as appositives between an ask''s subject and verb and by evading the narrow anti-run-on rule with "covering ..., ... and ...". v11 replaces the layers with one governing form: each question is AT MOST TWO short sentences, a plain context statement then ONE ask starting "Could you confirm/clarify ..."; descriptive facts go in the context sentence so the ask keeps subject and verb together; distinct matters are separate questions; the only multi-item form is one ask over several NAMED arrangements as a trailing "for any of: A; B; C" list; merging is restricted to asks a single answer settles. The long worked examples are replaced by three BEFORE/AFTER rewrites from the real failures. Grounding, jurisdictional sanity, no-jargon/no-statute/no-dash bans and exact question_id coverage are kept, stated briefly. SHAPE UNCHANGED (same JSON object, table always null, text under the 2000-char cap), so composeLetter.ts, ComposedLetterSchema and the coverage/auto-repair are untouched: NO edge redeploy. FRONTEND: each question now carries its own ask instead of a bare clause, so the shared stem must be suppressed; letterLeadIn/pointsLeadIn detection widens from starts-with-polite-opener to carries-own-ask (carriesOwnAsk in letterShape.ts), and legacy v3-v10 bare clauses do not match so old letters keep the stem. Ship the frontend via Azure AFTER this prompt is live. Model claude-opus-4-8 (live tier since the 2026-07-04 bump); temperature 0 (callOpus drops it for opus-4-x); max_tokens 8000. DRAFT, pending tax review. Single-active: deactivate the active version before activating v11. Re-runnable: INSERT is WHERE NOT EXISTS guarded; the flip UPDATEs are idempotent.$notes$
WHERE NOT EXISTS (
  SELECT 1 FROM atad2_prompts
  WHERE key = 'compose_client_letter' AND version = 11
);

-- PART B: flip active to v11 (deactivate-first for uniq_atad2_prompts_active).
UPDATE atad2_prompts SET is_active = false
WHERE key = 'compose_client_letter' AND version IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

UPDATE atad2_prompts SET is_active = true
WHERE key = 'compose_client_letter' AND version = 11;
