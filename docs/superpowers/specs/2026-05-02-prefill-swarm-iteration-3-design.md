# Document Pre-Fill — Iteration 3: Swarm + suggested answer (design)

**Date:** 2026-05-02
**Author:** Lennart Wilming (with Claude)
**Status:** Approved design, ready for implementation plan
**Replaces:** the Stage 1 + Stage 2 pipeline introduced in 2026-04-23 spec.

---

## 1. Context

The previous pipeline (Stage 1 = per-doc fact summary via Haiku, Stage 2 = one Opus call over all questions) keeps biting on three structural problems:

- **Throughput**: even after 90 seconds the user often arrives at the questions with no prefills yet. Stage 1 + Stage 2 are sequential and Stage 2 is a single long-output call.
- **Wallclock**: the Supabase edge-runtime kills isolates around the 60-second mark. Long Anthropic generations frequently get cancelled mid-flight.
- **UX**: a static 90s wait screen with two stacked progress bars feels like a freeze, especially when nothing is delivered at the end of it.

We also want to extend what each suggestion carries:
- A suggested **answer** (yes / no / unknown)
- A **confidence percentage** (0–100)
- A short **answer_rationale** sentence — why the AI suggests this answer
- The existing `suggested_toelichting` and `source_refs` for the explanation field

The advisor remains in control: the suggested answer is a chip next to the Yes/No/Unknown radio, never auto-applied.

The fix is to drop the staged pipeline and run a **per-question swarm** with prompt caching: one Opus call per ATAD2 question, all in parallel, sharing a cached document-context prefix. Total user-visible latency becomes the slowest single call (~10–15s), not the sum.

## 2. Goals

- **Latency**: from the moment the user clicks Continue, ≥80% of suggestions land within 15 seconds; full set within 25 seconds in the typical case (3 docs, 50KB total text).
- **Reliability**: a single failed question never blocks the others. Failures degrade gracefully — the question simply has no suggestion.
- **Visibility**: realtime per-question feedback. The user sees the count tick up while they navigate.
- **Trust**: every suggestion carries source_refs and (where applicable) a confidence-grounded answer chip. No auto-fills.
- **Simplicity**: one Edge Function action (`analyze`) replacing today's `summarize` + `extract`. One DB table for prefills. The intermediate `atad2_document_summaries` table is dropped.

## 3. Non-goals (this iteration)

- Replacing the Anthropic SDK / model.
- New file format support (PDF/DOCX/XLSX/PPTX/text/images stay as today).
- Cost optimization beyond using prompt caching (cost is not a concern per user direction).
- Persisting per-call internal rationale beyond what the schema requires.
- Re-running the swarm after the user uploads more docs mid-session — extraction stays one-shot, locked after the user clicks Continue.

---

## 4. Pipeline architecture

### 4.1 What gets dropped

- `atad2_document_summaries` table (drop via migration)
- `supabase/functions/prefill-documents/stage1.ts`
- The `summarize` action in `index.ts`
- The Stage-1-prompt row in `atad2_prompts` (mark inactive; row stays for audit)
- The auto-coordination logic in `stage1.ts` that triggered Stage 2
- Frontend's `AssessmentReviewPrefills.tsx` (already out of routing; remove the lazy import + Route)
- The wait/progress screen in `AssessmentUpload.tsx`
- The `ExtractionProgress` component

### 4.2 What stays

- `atad2_session_documents` (uploads, mime, category, relevance_note)
- Storage bucket `session-documents`
- `atad2_question_prefills` (extended — see §5)
- `atad2_prefill_jobs` (for status + token usage tracking)
- `atad2_prompts` (admin-managed prompts)
- The cleanup action (auto-delete on Generate Report)
- Client-side PDF/DOCX text extraction in `useUploadDocument`

### 4.3 The new `analyze` action

Single Edge Function action with this contract:

```ts
POST /functions/v1/prefill-documents
body: { action: "analyze", session_id: string }
```

Server-side flow:

1. **Verify** caller JWT owns the session (existing pattern).
2. **Atomically claim**: insert `atad2_prefill_jobs` row with `status = 'analyzing'`, `started_at = now()`, `locked_at = now()`. UNIQUE on `session_id` ensures only one swarm per session.
3. **Load context once**:
   - Fetch all `atad2_session_documents` for the session that are in `status = 'uploaded'`
   - Download the text content from Storage for each (PDF/DOCX already converted client-side to text/plain; .txt/.csv/.md/.xlsx text)
   - Concatenate into a single context block, with each doc clearly labelled (`<document doc_label="…" category="…" relevance_note="…">…content…</document>`)
4. **Load all questions**:
   - `SELECT DISTINCT ON (question_id) question_id, question, question_explanation FROM atad2_questions ORDER BY question_id`
   - This naturally adapts to whatever question count exists today (no hardcoded 36).
5. **Build the system + cached user prefix once**.
6. **Spawn the swarm**:
   - For each question, fire `callOpus({ ... systemPrompt, userContent: [cachedPrefix, oneQuestionSuffix] })`.
   - Use `Promise.allSettled` (not `Promise.all`) so one failure doesn't tank the rest.
   - Concurrency cap: 16 simultaneous calls (configurable; Anthropic tier 4 allows 1000/min, this is a conservative bulkhead).
   - For each settled result:
     - On success → validate Zod, drop bad lead-ins (existing filter), `INSERT` into `atad2_question_prefills` (or `UPSERT` on conflict).
     - On failure → log structured warning, no row inserted.
7. **Finalize job row**: `status = 'completed'`, `stage2_finished_at = now()`, `total_token_usage` aggregated.

The `stage2_*` columns and statuses are reused for now (no rename of fields) to minimize surface area; semantically they now represent the single swarm pass.

### 4.4 Prompt caching

Anthropic's `cache_control: { type: "ephemeral" }` is set on:
- The full system prompt block
- The document-context user message block (the big shared prefix)

The per-question text block is small (≤500 chars) and not cached. With 38 calls sharing the prefix, the first call writes the cache (cost = full input), the next 37 read it (cost ~10% input + their own small per-question suffix). Latency drops further on cached reads (Anthropic reports ~50% faster TTFT for cache hits).

### 4.5 Concurrency cap & rate-limit handling

- `analyze.ts` uses a small concurrency limiter (custom inline, no library — 12 lines): a queue of question tasks, N workers each pulling next-task until done.
- On `429` from Anthropic: existing exponential-backoff in `anthropic.ts` (2s → 4s → 8s) applies per-call.
- Hard limit per swarm: 5 minutes wallclock (set on the Edge Function action). At that point we mark the job `failed` if not yet completed.

---

## 5. Per-question output schema

Each Opus call produces one object with this contract:

```json
{
  "question_id": "27",
  "suggested_answer": "yes",          // "yes" | "no" | "unknown" | null
  "confidence_pct": 82,               // 0–100, REQUIRED if suggested_answer is non-null
  "answer_rationale": "Camden B.V. pays disregarded royalties to a US LLC.",
  "suggested_toelichting": "Camden B.V. ...",
  "source_refs": [
    { "doc_label": "Local file 2025", "location": "§3.2 p.14" }
  ]
}
```

**Field rules:**

- `suggested_answer`: lowercase enum. Set to `null` if confidence would be <40% — model is instructed not to guess.
- `confidence_pct`: integer 0–100. Calibrated: 100 = docs literally state it; 70 = strong support, advisor should verify; 40–69 = weak signal, surface but de-emphasize; <40 = return null answer.
- `answer_rationale`: 1 short sentence, ≤200 chars, advisor-voice (no "the documents...", no "according to..."), only present when `suggested_answer` is non-null.
- `suggested_toelichting`: ≤1000 chars, advisor-voice, factual prose.
- `source_refs`: at least one entry. Defensive filter drops entries without precise location.

**Storage in `atad2_question_prefills`** — three new columns:

```sql
ALTER TABLE atad2_question_prefills
  ADD COLUMN suggested_answer text
    CHECK (suggested_answer IS NULL OR suggested_answer IN ('yes', 'no', 'unknown')),
  ADD COLUMN confidence_pct integer
    CHECK (confidence_pct IS NULL OR (confidence_pct >= 0 AND confidence_pct <= 100)),
  ADD COLUMN answer_rationale text
    CHECK (answer_rationale IS NULL OR length(answer_rationale) <= 200);
```

`verbatim_quote` becomes optional/null in practice — kept on the table for backward compatibility but no longer populated by the new prompt.

**Confidence display tiers (UI logic):**
- `≥70` — green chip, "Suggested answer: Yes (82%)"
- `40–69` — amber chip, "Suggested answer: No (55%) — verify"
- `<40` or `null` — no chip rendered; only the toelichting card if available

---

## 6. UX changes

### 6.1 Upload screen (`AssessmentUpload.tsx`)

- Stays as-is for the upload widgets, sentence-case categories, and required relevance-note (≥30 chars).
- **Bug fix #1 (relevance note input freeze)**: the keystroke handler currently triggers `kickUpload` on every change once length ≥30. This re-renders the row with `disabled={status === "uploading"}` mid-stroke. Fix: gate kick on the boolean transition `wasReadyBefore === false && isReadyNow === true`, not on every keystroke. Once status flips, the input becomes read-only as before — but the user has at that point definitely finished typing the kick-trigger.
- **Continue button**: navigates immediately to `/assessment?session=...`. No wait screen.
- Continue handler also kicks the `analyze` action (fire-and-forget). The action runs server-side while the user is on /assessment.
- All wait-screen code paths and the `ExtractionProgress` component are removed.

### 6.2 Sidebar status pill (`AssessmentSidebar.tsx`)

A new compact status pill appears at the top of the sidebar when a prefill job exists for the current session:

| Job status | Pill content |
|---|---|
| `analyzing` | *"Analyzing documents · 12 / 38 questions ready"* (live count) |
| `completed` | *"Analysis complete · 31 suggestions ready"* — auto-hides after 5s |
| `failed` | *"Analysis failed — continuing without suggestions"* — manual dismiss |

The count comes from `useAllPrefills(sessionId)` (already exists; React Query + Realtime subscription). Total comes from a small `useQuestionCount()` hook that reads `SELECT count(distinct question_id)` from `atad2_questions` once per session.

### 6.3 Suggested-answer chip on the question

Inside the existing question-rendering block in `Assessment.tsx`, just above the radio group:

```
Suggested answer: Yes (82%) · Camden B.V. pays disregarded royalties to a US LLC.   [Use]
```

- Only rendered when `currentPrefill?.suggested_answer != null` AND `confidence_pct >= 40`.
- Visual chip with a colored left-border based on confidence tier.
- "Use" button → fills the radio with the suggested answer + marks the prefill as `accepted`. The existing toelichting SuggestionCard renders separately below.
- Same chip pattern is reused on the Report page (`EditableAnswer.tsx`) when the user clicks Edit.

### 6.4 SuggestionCard for toelichting

Existing component continues to work. Two small changes:
- It now reads `suggested_toelichting` from the same prefill row (no schema change for it).
- The "From: …" line now lists `source_refs` directly. The `verbatim_quote` collapsible is removed (not populated anymore).

---

## 7. Migration & deploy steps

1. **Migration `20260502_swarm_pipeline.sql`** — committed to repo, applied via Studio:
   - `ALTER TABLE atad2_question_prefills ADD COLUMN suggested_answer text`, `confidence_pct integer`, `answer_rationale text`, with the CHECK constraints from §5.
   - `DROP TABLE atad2_document_summaries CASCADE;` (no live data dependency).
2. **Prompt seed migration `20260502_seed_swarm_prompt.sql`** — inserts the new system prompt + cacheable user template under a new key `prefill_swarm_system`. Marks the old `prefill_stage1_system` and `prefill_stage2_system` rows `is_active = false`.
3. **Edge Function rewrite** — `analyze.ts` replacing `stage2.ts`; `stage1.ts` deleted; `index.ts` dispatcher updated to handle only `analyze` and `cleanup`.
4. **Frontend changes** — UI updates per §6.
5. **Deploy via `az vm run-command`** — same pattern as iteration 2: tarball → `/root/supabase-docker/volumes/functions/prefill-documents/` → `docker compose up -d --force-recreate functions`.

Older session data with rows in `atad2_document_summaries` is destroyed — that's fine, no production usage of this feature yet.

---

## 8. The new system prompt (sketch — final wording in implementation)

```
You are an ATAD2 (Dutch anti-hybrid) tax advisor. You receive a set of
uploaded documents and ONE assessment question at a time. Produce a
suggestion package as a single JSON object with this exact shape:

{
  "suggested_answer": "yes" | "no" | "unknown" | null,
  "confidence_pct": 0..100,
  "answer_rationale": "<≤1 sentence, ≤200 chars, advisor voice>" | null,
  "suggested_toelichting": "<2-5 sentences, advisor voice>",
  "source_refs": [{ "doc_label": "...", "location": "..." }]
}

RULES:
- Speak in the advisor's first-person voice. Never reference "the documents",
  "the memorandum", "the local file" or similar meta-language. Just state
  the facts directly: "Camden B.V. is a Dutch BV that..."
- Calibrate confidence_pct based on document evidence, not on your own
  internal certainty. 100 = docs literally state the answer. <40 = guessing,
  set suggested_answer to null.
- If suggested_answer is non-null, answer_rationale MUST be present and
  must explain in one short sentence why this answer is supported.
- Always anchor on the taxpayer name first. Frame everything from their
  perspective.
- Provide source_refs with precise locations (page, section, account).
- Output JSON only. No prose, no markdown fences.
```

User-message template (cached prefix + per-question suffix):

```
[CACHED PREFIX]
## Documents
<each doc as a labeled block with category + relevance_note>

[NOT CACHED]
## Question
question_id: <id>
question: <text>
explanation: <question_explanation>

Output the JSON suggestion now.
```

---

## 9. Verification

1. **Latency target**: upload 3 docs (~50 KB text total), click Continue, navigate to /assessment. Within 25 seconds, sidebar pill shows ≥30 of 38 ready. Within 60s, all settled.
2. **Per-question realtime**: open Q1 mid-analysis. As suggestions land for other questions, sidebar count ticks up; Q1's own suggestion appears the moment its call returns.
3. **Confidence chip**:
   - For an unambiguous Yes case → chip shows ≥70%, green.
   - For an ambiguous case (no clear evidence in docs) → no chip rendered.
4. **One-failure resilience**: simulate a single Opus 400 (e.g. malformed call) → swarm completes the other questions; failed question has no row; sidebar shows X/N with X < N + a small "1 question failed" amber note.
5. **Prompt caching active**: edge logs show `cache_creation_input_tokens > 0` on the first call and `cache_read_input_tokens > 0` on subsequent calls.
6. **Bug fixes verified**:
   - Relevance note: type past 30 chars without the input freezing or losing focus.
   - Wait screen: gone. Continue takes you straight to /assessment.

---

## 10. Spec self-review

- No TBDs / placeholders.
- Internal consistency: schema (§5) matches output JSON (§5) matches prompt (§8). Job-status reuse explicit.
- Scope: single feature — swarm pipeline + answer chip + UX cleanup. Doesn't drag in unrelated work.
- Ambiguity: confidence tiers explicit (§5 last block + §6.3); answer-chip render condition explicit; "what happens if some calls fail" explicit (§9.4).
- Backward compat: `verbatim_quote` kept nullable; `atad2_prefill_jobs` columns reused with relaxed semantics.
