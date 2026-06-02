# Prompt strengthening — silence rule (v5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship swarm prefill prompt v5 — replaces v4 — so the model returns `suggested_answer: null` when documents are silent on a topic instead of dressing absence-of-mention as a "no" verdict (e.g., "There do not appear to be any dual-resident mismatches").

**Architecture:** A new Supabase migration deactivates the active v4 row in `atad2_prompts` and inserts a v5 row with an updated `system_prompt` (new Rule 9 + expanded Rule 1 banned-phrase list). Plus a copy-paste reference doc for the n8n memo Code node, which is hand-maintained outside the repo. No source code, schema, or UI changes.

**Tech Stack:** PostgreSQL migration via Supabase CLI / Studio. Markdown reference document. Manual verification through the prefill flow.

---

## File Structure

**Create:**
- `supabase/migrations/20260512100000_swarm_prompt_v5.sql` — deactivates v4, inserts v5
- `docs/prompts/n8n-memo-system.md` — manual reference for n8n memo Code node

**Modify:** none.

**Reference (read-only):**
- `supabase/migrations/20260506100000_swarm_prompt_v4.sql` — pattern to mirror exactly
- `docs/superpowers/specs/2026-05-12-prompt-strengthening-silence-rule-design.md` — approved spec

---

### Task 1: Create v5 migration file

**Files:**
- Create: `supabase/migrations/20260512100000_swarm_prompt_v5.sql`

- [ ] **Step 1: Confirm timestamp is greater than every existing migration**

Run from repo root (PowerShell):

```powershell
Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | Select-Object -Last 1
```

Expected: the listed filename is `20260507100000_create_structure_chart_tables.sql` (or any timestamp < `20260512100000`). If a newer migration exists, bump the new file's timestamp to one second after the latest.

- [ ] **Step 2: Create the migration file with full content**

Create `supabase/migrations/20260512100000_swarm_prompt_v5.sql` with this exact content:

```sql
-- v5: add Rule 9 (no inference from absence) and extend Rule 1 banned phrases
-- so the model returns null instead of dressing absence-of-mention as a "no"
-- verdict. Other rules unchanged from v4.

UPDATE atad2_prompts
SET is_active = false
WHERE key = 'prefill_swarm_system' AND is_active = true;

INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
) VALUES (
  'prefill_swarm_system',
  5,
  $prompt$You are an ATAD2 (Dutch anti-hybrid mismatch) tax advisor. You receive a set of uploaded documents AND ONE assessment question at a time. Produce a single suggestion package as JSON with this exact shape:

{
  "suggested_answer": "yes" | "no" | "unknown" | null,
  "confidence_pct": 0..100,
  "answer_rationale": string | null,
  "suggested_toelichting": string,
  "source_refs": [{ "doc_label": string, "location": string }]
}

RULES:

1. ADVISOR FIRST-PERSON VOICE WITH HEDGED INFERENCE. Speak as the advisor typing their own toelichting. NEVER reference any document by name or category. Banned phrases include but are not limited to: "the documents", "the memorandum", "the memo", "the local file", "the master file", "the report", "the VDD", "the VDR", "the financials", "the jaarrekening", "the analysis", "according to...", "based on...", "the analysis covers...", "as noted in...", "the [doc type] notes/states/says/specifies/indicates that...", "I don't see any indication of...", "There do not appear to be...", "Based on the available information, no...", "No indication of...", "Nothing suggests...", "It is not apparent that...". The general rule: NEVER say or imply you are reading from a document, and NEVER dress absence-of-mention as a "no" conclusion. Speak as if YOU have direct knowledge of these facts.
   - When evidence is fact-dense and explicit (named parties, jurisdictions stated, numbers cited): state directly. Example: "Camden B.V. is a Dutch BV that...".
   - When the conclusion involves an inference — drawn from indirect derivation or partial evidence: hedge AT the conclusion, inside the advisor voice. Use "It seems that...", "Likely...", "Appears to be...", "Based on the indications,...". Do NOT hedge by pointing at documents — hedge the conclusion itself. If the inference is "no" specifically and is drawn from absence of mention rather than from positive evidence, follow Rule 9 instead of hedging.

   BAD example: "The VDD specifically notes for the German entities that S4 DE BV is a limited taxpayer in Germany following the conversion of the German GmbHs into KGs."
   GOOD example: "S4 DE BV is a limited taxpayer in Germany following the conversion of the German GmbHs into KGs. It seems this concerns the partners' limited tax liability via partnership transparency rather than a Dutch head office operating a foreign branch."

2. ANCHOR ON THE TAXPAYER. Identify the Dutch taxpayer (the entity that is the subject of this assessment) from the documents. Begin every output with that taxpayer's name and frame all facts from their perspective.

3. CONFIDENCE CALIBRATION. confidence_pct measures evidence strength in the documents, not your internal certainty.
   - 100 = the documents literally and unambiguously state the answer.
   - 70-99 = strong support; the advisor should still verify.
   - 40-69 = weak signal worth surfacing.
   - <40 = guessing; set suggested_answer to null and confidence_pct to null.

4. ANSWER RATIONALE. If suggested_answer is non-null, answer_rationale MUST be present, <=200 chars, ONE sentence, advisor-voice. It explains the answer in concrete terms, not "because the document says X". Apply the same hedging tier as Rule 1.

5. TOELICHTING. 2-5 sentences, <=1000 chars, advisor-voice, factual. No legal conclusions of your own. EXCEPTION: if a prior memo in the docs literally contains a legal conclusion, you may quote it as a reported prior conclusion with citation. Apply Rule 1 hedging where the conclusion is inferred. Apply Rule 1 banned phrases strictly — there is NO scenario where "The VDD/report/memo/etc. notes..." is acceptable; rewrite the same fact in advisor voice.

6. SOURCE_REFS. At least one entry. Precise location (page, section, account, table). Never "throughout the document". Exception: Rule 9 silence-case allows source_refs: [].

7. ENTITY-SPECIFIC FACTS FROM THE BACKGROUND DOCUMENTS: You may incorporate verifiable facts from those documents (entity names, subsidiary structure, fiscal unities, specific intercompany financing, group composition, ownership changes) directly into the narrative as internal knowledge, without citing the documents themselves. This makes the memo read as a tailored analysis of this taxpayer rather than generic ATAD2 commentary. Stick to structural facts that bear on the hybrid-mismatch analysis; skip incidental details (individual director names, salaries, audit firm) that do not affect the assessment.

8. JSON ONLY. No prose before or after. No markdown fences.

9. NO INFERENCE FROM ABSENCE. The documents either provide positive evidence about a topic or they do not. Positive evidence means: an explicit statement of the answer, a substantive analysis with a conclusion, OR plain-reading facts that directly establish the answer (e.g., a single tax-residency jurisdiction stated for an entity is positive evidence regarding dual residency). Absence of mention is NOT positive evidence.

   If positive evidence is present, answer per Rules 1-8.

   If the documents are silent on the topic, output:
   - suggested_answer: null
   - confidence_pct: null
   - answer_rationale: null
   - suggested_toelichting: ONE short sentence describing what kind of evidence would be needed to assess this, in advisor voice, without making any verdict. If you cannot describe it neutrally, set to empty string.
   - source_refs: [] (this is the ONLY exception to Rule 6)

   BAD example (silence reported as "no"):
   {
     "suggested_answer": "no",
     "confidence_pct": 55,
     "answer_rationale": "There do not appear to be any dual-resident mismatches based on the available information.",
     "suggested_toelichting": "Based on the available documents, no dual residency issue is identified for Camden B.V."
   }

   GOOD example (silence reported as silence):
   {
     "suggested_answer": null,
     "confidence_pct": null,
     "answer_rationale": null,
     "suggested_toelichting": "Assessing this requires a residency analysis with treaty tie-breaker review, which falls outside what has been provided.",
     "source_refs": []
   }$prompt$,
  $template$## Documents

{{documents_block}}

## Question

question_id: {{question_id}}
question: {{question_text}}
explanation: {{question_explanation}}

Output the JSON suggestion now.$template$,
  'claude-opus-4-7',
  0,
  4000,
  true,
  'v5: adds Rule 9 (no inference from absence — silence => null), extends Rule 1 banned-phrase list with absence-as-conclusion phrasings ("I don''t see any indication of", "There do not appear to be", "Based on the available information, no", "No indication of", "Nothing suggests", "It is not apparent that"). Rule 6 carves out source_refs:[] for silence case. Rules 1-8 otherwise unchanged from v4.'
);
```

- [ ] **Step 3: Sanity-check the SQL syntax locally without running it**

Run from repo root:

```powershell
Get-Content supabase/migrations/20260512100000_swarm_prompt_v5.sql | Measure-Object -Line
```

Expected: > 50 lines (the v5 file should be substantially longer than v4 due to Rule 9).

Then visually confirm:
- The file contains `UPDATE atad2_prompts SET is_active = false WHERE key = 'prefill_swarm_system' AND is_active = true;`
- The `INSERT` row has `version = 5` and `is_active = true`
- Two dollar-quote tags: `$prompt$ ... $prompt$` around the system prompt, and `$template$ ... $template$` around the user template
- The literal text `9. NO INFERENCE FROM ABSENCE.` appears exactly once
- The literal text `"I don''t see any indication of..."` appears exactly once (note the doubled single-quote inside the SQL `notes` string, but ONLY in the notes — inside the `$prompt$` block single quotes do NOT need escaping)

- [ ] **Step 4: Commit migration file**

```powershell
git add supabase/migrations/20260512100000_swarm_prompt_v5.sql
git commit -m "feat(prompt): swarm v5 — no inference from absence rule"
```

---

### Task 2: Apply migration and verify in database

This project runs a self-hosted Supabase on a VM (per `CLAUDE.md`). The migration must be applied against that DB. Standard workflow is `supabase db push` against the linked project, or paste-and-run via Supabase Studio at `http://135.225.104.142:3000`.

- [ ] **Step 1: Apply the migration**

Pick ONE of the two paths below.

**Path A — Supabase CLI (preferred if linked):**

```powershell
npx supabase db push
```

Expected: output ending in `Finished supabase db push.` with `20260512100000_swarm_prompt_v5.sql` listed as applied.

**Path B — Supabase Studio SQL editor:**

1. Open `http://135.225.104.142:3000`
2. SQL Editor → New query
3. Paste the entire contents of `supabase/migrations/20260512100000_swarm_prompt_v5.sql`
4. Run

Expected: "Success. No rows returned." (because `UPDATE` and `INSERT` produce no result set in the editor).

- [ ] **Step 2: Verify exactly one active row for the swarm key**

In Supabase Studio SQL editor, run:

```sql
SELECT key, version, is_active, left(notes, 80) AS notes_preview
FROM atad2_prompts
WHERE key = 'prefill_swarm_system'
ORDER BY version;
```

Expected rows:

| key | version | is_active | notes_preview |
| --- | --- | --- | --- |
| prefill_swarm_system | 1 | false | (older notes) |
| prefill_swarm_system | 2 | false | (older notes) |
| prefill_swarm_system | 3 | false | (older notes) |
| prefill_swarm_system | 4 | false | v4: stricter banned-meta list ... |
| prefill_swarm_system | 5 | true | v5: adds Rule 9 (no inference from absence ... |

The critical assertions: exactly ONE row with `is_active = true`, and that row has `version = 5`.

- [ ] **Step 3: Verify the prompt body contains Rule 9**

In Supabase Studio SQL editor, run:

```sql
SELECT
  position('9. NO INFERENCE FROM ABSENCE' IN system_prompt) AS rule9_pos,
  position('There do not appear to be' IN system_prompt)   AS banned_phrase_pos,
  length(system_prompt) AS prompt_len
FROM atad2_prompts
WHERE key = 'prefill_swarm_system' AND is_active = true;
```

Expected: both `rule9_pos` and `banned_phrase_pos` are non-zero positive integers, and `prompt_len` is substantially larger than the v4 length (v4 is ~4000 chars; v5 should be ~5500+).

---

### Task 3: Create n8n memo reference doc

**Files:**
- Create: `docs/prompts/n8n-memo-system.md`

- [ ] **Step 1: Create the docs/prompts directory if missing**

```powershell
if (-not (Test-Path docs/prompts)) { New-Item -ItemType Directory -Path docs/prompts | Out-Null }
```

Expected: no output, directory exists afterwards.

- [ ] **Step 2: Create the reference markdown file**

Create `docs/prompts/n8n-memo-system.md` with this exact content:

```markdown
# n8n memo system prompt — silence rule reference

This file is a **manual reference**, not a runtime source of truth. The actual
prompt for ATAD2 memorandum generation lives in the n8n workflow at
`https://n8n.atad2.tax`, inside the `Build prompt + metrics` Code node. To
update behavior in production, edit that node directly via the n8n UI.

This document mirrors the "no inference from absence" rule applied to the
swarm prefill prompt in `atad2_prompts.prefill_swarm_system` v5
(`supabase/migrations/20260512100000_swarm_prompt_v5.sql`). Apply the same
rule to the memo prompt so the final memorandum does not contain
absence-based negations either.

## When updating the n8n memo prompt, append this rule

```
NO INFERENCE FROM ABSENCE. When the documents are silent on a topic — meaning
they contain no explicit statement, no substantive analysis, and no plain-reading
facts that directly establish an answer on that topic — do NOT write a "no
issue" conclusion for it. Treat absence of mention as absence of evidence,
not as evidence of absence.

In silence cases:
- The memo MUST state explicitly that the available documentation does not
  cover this topic, and that verification is needed before drawing a
  conclusion. Phrase this as a scope statement, not as a verdict.
- The memo MUST NOT use any of these phrasings:
  "I don't see any indication of...",
  "There do not appear to be...",
  "Based on the available information, no...",
  "No indication of...",
  "Nothing suggests...",
  "It is not apparent that...",
  "No [topic] issue is identified".

GOOD silence phrasing examples:
- "Assessing dual residency for Camden B.V. requires a residency analysis
  with treaty tie-breaker review, which falls outside what has been provided.
  Verification is needed before this can be ruled out."
- "The classification of S4 DE BV as a hybrid entity is not determinable from
  the materials at hand. A jurisdiction-specific entity-classification
  analysis would be required."

BAD silence phrasing examples (these treat silence as "no"):
- "There do not appear to be any dual-resident mismatches based on the
  available information." — implies a verdict drawn from absence.
- "Based on the available documents, no dual residency issue is identified
  for Camden B.V." — same problem, slightly different wording.
```

## Maintenance note

When this rule changes:
1. Update the v5 (or successor) migration in
   `supabase/migrations/` if the swarm prompt is affected.
2. Update this file to reflect the new wording.
3. Manually update the `Build prompt + metrics` Code node in the n8n
   workflow to match.

There is no automated linkage between this file and n8n. Drift between this
file and the live n8n prompt is possible — treat the n8n node as the
production source of truth for the memo prompt, and this file as the
intent record.
```

- [ ] **Step 3: Verify file was created**

```powershell
Get-Content docs/prompts/n8n-memo-system.md | Measure-Object -Line
```

Expected: > 40 lines.

- [ ] **Step 4: Commit reference doc**

```powershell
git add docs/prompts/n8n-memo-system.md
git commit -m "docs(prompts): add n8n memo silence-rule reference"
```

---

### Task 4: Manual verification through the prefill flow

This task confirms the live behavior of v5 against a representative test case. There are no automated tests for prompt content — the verification is observational against the running app.

- [ ] **Step 1: Pick or create a test session with limited documentation**

Pick a session in the system where ONLY a single jaarrekening (annual report / financial statements) has been uploaded, and no tax memorandum / VDD / VDR / residency analysis. If none exists, create a new session, upload a sample jaarrekening only, and proceed.

Note the `session_id` (visible in the URL when on the Assessment page; this is the FK used by `atad2_question_prefills`).

- [ ] **Step 2: Trigger the prefill swarm**

In the Assessment UI for that assessment, trigger the AI suggestion / prefill flow (the existing button / action that runs the swarm — this is the same flow that previously produced "There do not appear to be..." outputs).

Wait for the prefill job to complete (job state can be monitored at `/admin/prefill-jobs`).

- [ ] **Step 3: Inspect prefill results for silence-topic questions**

In Supabase Studio SQL editor, run:

```sql
SELECT
  p.question_id,
  (SELECT q.question FROM atad2_questions q WHERE q.question_id = p.question_id LIMIT 1) AS question_text,
  p.suggested_answer,
  p.confidence_pct,
  left(p.answer_rationale, 120) AS rationale_preview,
  left(p.suggested_toelichting, 200) AS toelichting_preview,
  jsonb_array_length(coalesce(p.source_refs, '[]'::jsonb)) AS source_ref_count
FROM atad2_question_prefills p
WHERE p.session_id = '<paste session_id here>'
  AND p.question_id IN (
    SELECT DISTINCT q.question_id
    FROM atad2_questions q
    WHERE q.question ILIKE '%dual resident%'
       OR q.question ILIKE '%hybrid entit%'
       OR q.question ILIKE '%residency mismatch%'
  )
ORDER BY p.question_id;
```

Expected for v5: for questions about dual residency and hybrid entities where the jaarrekening cannot provide positive evidence, `suggested_answer` is `null`, `confidence_pct` is `null`, `answer_rationale` is `null`, `source_ref_count` is `0`, and `toelichting_preview` either is empty OR describes what evidence would be needed (e.g., "...requires a residency analysis...") without asserting a verdict.

- [ ] **Step 4: Verify banned phrases do not appear in any prefill output**

```sql
SELECT
  p.question_id,
  p.suggested_answer,
  left(p.answer_rationale, 200) AS rationale,
  left(p.suggested_toelichting, 300) AS toelichting
FROM atad2_question_prefills p
WHERE p.session_id = '<paste session_id here>'
  AND (
    p.answer_rationale ILIKE '%there do not appear to be%'
    OR p.answer_rationale ILIKE '%i don''t see any indication of%'
    OR p.answer_rationale ILIKE '%based on the available information, no%'
    OR p.answer_rationale ILIKE '%no indication of%'
    OR p.answer_rationale ILIKE '%nothing suggests%'
    OR p.answer_rationale ILIKE '%it is not apparent that%'
    OR p.suggested_toelichting ILIKE '%there do not appear to be%'
    OR p.suggested_toelichting ILIKE '%i don''t see any indication of%'
    OR p.suggested_toelichting ILIKE '%based on the available information, no%'
    OR p.suggested_toelichting ILIKE '%no indication of%'
    OR p.suggested_toelichting ILIKE '%nothing suggests%'
    OR p.suggested_toelichting ILIKE '%it is not apparent that%'
  );
```

Expected: zero rows. If any rows are returned, the prompt is leaking banned phrases — record the question_id and rationale, then either re-run prefill (LLM non-determinism) or treat as a v5 regression to escalate.

- [ ] **Step 5: Spot-check the UI for a silence-topic question**

In the Assessment UI, navigate to one of the silence-topic questions returned by Step 3 with `suggested_answer = null`. Confirm:

- No answer is auto-selected (no "Yes"/"No"/"Unknown" pre-highlighted)
- No "AI suggestion" badge or inline rationale block appears
- The toelichting text-area is empty OR contains the neutral evidence-needed sentence (depending on the toelichting field UX)

- [ ] **Step 6: Spot-check a question that SHOULD still be prefilled**

Verify v5 didn't over-correct: pick a question that the jaarrekening can legitimately answer (e.g., total interest expense, total assets, or any question whose plain-text answer is in the financials). Confirm in the UI that this question still has a populated `suggested_answer`, a confidence ≥ 40, and a populated rationale.

- [ ] **Step 7: Record verification outcome**

If all of steps 3-6 pass, the rollout is verified. Note the test session_id and date in a comment on the v5 migration commit, or in the upcoming PR description.

If any step fails, rollback per the spec's rollback section: create a new migration that re-activates v4 and deactivates v5, apply it, re-verify. Then iterate on the prompt text in a v6 migration.

---

## Self-Review Notes

**Spec coverage:** Every spec section maps to a task — Rule 9 + Rule 1 expansion (Task 1), migration application (Task 2), n8n reference doc (Task 3), manual verification (Task 4). Rollback procedure is referenced in Task 4 Step 7 rather than its own task because it only runs on failure.

**Placeholder scan:** Two acknowledged late-binding values — `<paste session_id here>` in Task 4 verification queries (cannot be known until the engineer picks a test session), and the timestamp in Task 1 Step 1 (may need bumping if the engineer adds another migration first). Both are clearly flagged and have explicit instructions for resolution.

**Type consistency:** The migration's column names (`key`, `version`, `system_prompt`, `user_prompt_template`, `model`, `temperature`, `max_tokens`, `is_active`, `notes`) match the v4 migration exactly. The verification queries use the real schema names confirmed from `supabase/migrations/20260423100000_document_prefill_schema.sql` and `supabase/migrations/20250803164520_b35f19b4-1e6b-4ca1-8aaa-3cf7b6ed1a34.sql`: `atad2_question_prefills` with `session_id` FK and `atad2_questions(question_id, question)`.
