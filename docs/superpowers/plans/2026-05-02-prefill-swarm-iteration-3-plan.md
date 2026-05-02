# Pre-Fill Swarm Iteration 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the staged Stage 1 + Stage 2 pre-fill pipeline with a per-question Anthropic Opus swarm (parallel calls, prompt caching), add suggested answer + confidence + rationale per question, drop the wait screen, and fix the relevance-note input freeze.

**Architecture:** One Edge Function action `analyze` runs N parallel `Promise.allSettled` Opus calls (one per ATAD2 question), all sharing a cached document-context prefix via Anthropic ephemeral cache. Each call returns a JSON object with `suggested_answer`, `confidence_pct`, `answer_rationale`, `suggested_toelichting`, and `source_refs`. UI surfaces a chip on the Yes/No/Unknown radio (≥40% confidence only) and a sidebar status pill that ticks live as suggestions arrive via Realtime.

**Tech Stack:** TypeScript + React + Supabase JS (frontend, existing). Deno + Anthropic SDK (Edge Function, existing). Anthropic prompt caching via `cache_control: { type: "ephemeral" }`.

**Reference spec:** [docs/superpowers/specs/2026-05-02-prefill-swarm-iteration-3-design.md](../specs/2026-05-02-prefill-swarm-iteration-3-design.md).

**Delivery constraints:**
- Branch: `feat/document-prefill` (already active). No push to `main` until user explicit approval.
- DB changes apply via Supabase Studio SQL editor OR `az vm run-command` (both available).
- Edge Function deploys via `az vm run-command` with tar+base64 payload.

---

## Pre-flight

- [ ] **P1. Confirm branch + clean tree**

```bash
git branch --show-current
git status --short
```

Expected: branch `feat/document-prefill`, no uncommitted changes (or only stale background-task output files that can be ignored).

- [ ] **P2. Confirm Azure CLI session is live**

```bash
az account show --query "{user:user.name,sub:name}" -o tsv
```

Expected: `Lennart.Wilming@svalneratlas.com   adn-atad2-prod`. If missing, the user runs `az login` from their PowerShell first.

---

## Task 1: DB migration — extend atad2_question_prefills + drop atad2_document_summaries

**Files:**
- Create: `supabase/migrations/20260502120000_swarm_pipeline_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Iteration 3: per-question swarm replaces Stage 1 + Stage 2.
-- Per-question prefill rows now also carry a suggested answer + confidence
-- + a one-sentence rationale. The intermediate document-summaries table
-- is dropped (no live data depends on it).

ALTER TABLE atad2_question_prefills
  ADD COLUMN IF NOT EXISTS suggested_answer text
    CHECK (suggested_answer IS NULL OR suggested_answer IN ('yes', 'no', 'unknown')),
  ADD COLUMN IF NOT EXISTS confidence_pct integer
    CHECK (confidence_pct IS NULL OR (confidence_pct >= 0 AND confidence_pct <= 100)),
  ADD COLUMN IF NOT EXISTS answer_rationale text
    CHECK (answer_rationale IS NULL OR length(answer_rationale) <= 200);

DROP TABLE IF EXISTS atad2_document_summaries;
```

- [ ] **Step 2: Apply via az vm run-command**

```bash
cat > /tmp/m1.sh <<'SHELL'
#!/bin/bash
PGPASS=$(grep "^POSTGRES_PASSWORD=" /root/supabase-docker/.env | cut -d= -f2-)
docker exec -e PGPASSWORD="$PGPASS" -i supabase-db psql -U supabase_admin -d postgres <<'SQL'
ALTER TABLE atad2_question_prefills
  ADD COLUMN IF NOT EXISTS suggested_answer text
    CHECK (suggested_answer IS NULL OR suggested_answer IN ('yes', 'no', 'unknown')),
  ADD COLUMN IF NOT EXISTS confidence_pct integer
    CHECK (confidence_pct IS NULL OR (confidence_pct >= 0 AND confidence_pct <= 100)),
  ADD COLUMN IF NOT EXISTS answer_rationale text
    CHECK (answer_rationale IS NULL OR length(answer_rationale) <= 200);

DROP TABLE IF EXISTS atad2_document_summaries;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'atad2_question_prefills' AND column_name IN ('suggested_answer','confidence_pct','answer_rationale')
ORDER BY column_name;
SQL
SHELL
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts @/tmp/m1.sh 2>&1 | tail -15
rm -f /tmp/m1.sh
```

Expected output includes the three new column names listed.

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/20260502120000_swarm_pipeline_schema.sql
git commit -m "feat(prefill): swarm schema — add answer/confidence/rationale, drop summaries table"
```

---

## Task 2: Seed migration — insert new swarm prompt, deactivate old prompts

**Files:**
- Create: `supabase/migrations/20260502120100_seed_swarm_prompt.sql`

- [ ] **Step 1: Write the seed file**

```sql
-- Deactivate the old Stage 1 / Stage 2 prompts (kept in DB for audit).
UPDATE atad2_prompts
SET is_active = false
WHERE key IN ('prefill_stage1_system', 'prefill_stage2_system');

-- New per-question swarm prompt.
INSERT INTO atad2_prompts (
  key, version, system_prompt, user_prompt_template,
  model, temperature, max_tokens, is_active, notes
) VALUES (
  'prefill_swarm_system',
  1,
  $prompt$You are an ATAD2 (Dutch anti-hybrid mismatch) tax advisor. You receive a set of uploaded documents AND ONE assessment question at a time. Produce a single suggestion package as JSON with this exact shape:

{
  "suggested_answer": "yes" | "no" | "unknown" | null,
  "confidence_pct": 0..100,
  "answer_rationale": string | null,
  "suggested_toelichting": string,
  "source_refs": [{ "doc_label": string, "location": string }]
}

RULES:

1. ADVISOR FIRST-PERSON VOICE. Speak as the advisor typing their own toelichting. Never reference "the documents", "the memorandum", "the local file", "according to...", "based on...", "the analysis covers...", or any meta-language about documents. State facts directly: "Camden B.V. is a Dutch BV that..." not "The documents concern Camden B.V., a Dutch BV...".

2. ANCHOR ON THE TAXPAYER. Identify the Dutch taxpayer (the entity that is the subject of this assessment) from the documents. Begin every output with that taxpayer's name and frame all facts from their perspective.

3. CONFIDENCE CALIBRATION. confidence_pct measures evidence strength in the documents, not your internal certainty.
   - 100 = the documents literally and unambiguously state the answer.
   - 70-99 = strong support; the advisor should still verify.
   - 40-69 = weak signal worth surfacing.
   - <40 = guessing; set suggested_answer to null and confidence_pct to null.

4. ANSWER RATIONALE. If suggested_answer is non-null, answer_rationale MUST be present, ≤200 chars, ONE sentence, advisor-voice. It explains the answer in concrete terms, not "because the document says X".

5. TOELICHTING. 2-5 sentences, ≤1000 chars, advisor-voice, factual. No legal conclusions of your own. EXCEPTION: if a prior memo in the docs literally contains a legal conclusion, you may quote it as a reported prior conclusion with citation.

6. SOURCE_REFS. At least one entry. Precise location (page, section, account, table). Never "throughout the document".

7. JSON ONLY. No prose before or after. No markdown fences.$prompt$,
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
  'v1: per-question swarm with suggested answer + confidence + rationale'
);
```

- [ ] **Step 2: Apply via az vm run-command**

```bash
cat > /tmp/m2.sh <<'SHELL'
#!/bin/bash
PGPASS=$(grep "^POSTGRES_PASSWORD=" /root/supabase-docker/.env | cut -d= -f2-)
docker exec -e PGPASSWORD="$PGPASS" -i supabase-db psql -U supabase_admin -d postgres -f - <<'SQL'
[paste the entire SQL above here]
SQL
docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT key, version, is_active, notes FROM atad2_prompts ORDER BY key, version DESC;"
SHELL
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts @/tmp/m2.sh 2>&1 | tail -25
rm -f /tmp/m2.sh
```

(For the heredoc-in-heredoc, copy the SQL content from the migration file directly into the inner `<<'SQL' ... SQL` block when assembling the script.)

Expected: old keys show `is_active = false`, new `prefill_swarm_system` row shows `is_active = true`.

- [ ] **Step 3: Commit seed file**

```bash
git add supabase/migrations/20260502120100_seed_swarm_prompt.sql
git commit -m "feat(prefill): seed v1 swarm system prompt"
```

---

## Task 3: Regenerate Supabase types for prefills schema

**Files:**
- Modify: `src/integrations/supabase/types.ts` (the `atad2_question_prefills` interface block)

- [ ] **Step 1: Locate the prefills block**

```bash
grep -n "atad2_question_prefills:" src/integrations/supabase/types.ts | head -3
```

Open the file at that line.

- [ ] **Step 2: Add three columns to Row, Insert, and Update**

Inside the `Row` block, add (alphabetical insertion):
```ts
answer_rationale: string | null
confidence_pct: number | null
suggested_answer: "yes" | "no" | "unknown" | null
```

Inside `Insert` and `Update` blocks add the same three with `?` and `| null`:
```ts
answer_rationale?: string | null
confidence_pct?: number | null
suggested_answer?: "yes" | "no" | "unknown" | null
```

Also remove any `atad2_document_summaries:` block from the same file (search for it). It's been dropped from the DB.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(prefill): regenerate types for swarm columns + drop summaries type"
```

---

## Task 4: Edge Function — update Zod schemas for the new per-question output

**Files:**
- Modify: `supabase/functions/prefill-documents/schemas.ts`

- [ ] **Step 1: Replace the Stage2Prefill / Stage2Output exports**

Open `supabase/functions/prefill-documents/schemas.ts`. Replace the `Stage2Prefill`, `Stage2Output`, and their type exports with:

```ts
export const SwarmAnswer = z.enum(["yes", "no", "unknown"]);

export const SwarmPrefill = z.object({
  suggested_answer: SwarmAnswer.nullable(),
  confidence_pct: z.number().int().min(0).max(100).nullable(),
  answer_rationale: z.string().max(200).nullable(),
  suggested_toelichting: z.string().min(1).max(1000),
  source_refs: z.array(z.object({
    doc_label: z.string().min(1),
    location: z.string().min(1),
  })).min(1),
});
export type SwarmPrefillType = z.infer<typeof SwarmPrefill>;
```

Keep `Stage1Output` — it's no longer used at runtime but other tests may still import it; remove its tests in Task 5 instead.

- [ ] **Step 2: Run schema unit tests**

```bash
cd supabase/functions/prefill-documents
deno test --allow-net schemas.test.ts 2>&1 | tail -10
cd -
```

Some existing tests reference `Stage2Output` which no longer exists — that's expected; we fix in Task 5.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/prefill-documents/schemas.ts
git commit -m "feat(prefill): SwarmPrefill schema with answer/confidence/rationale"
```

---

## Task 5: Edge Function — replace stage1.ts/stage2.ts with analyze.ts (swarm)

**Files:**
- Create: `supabase/functions/prefill-documents/analyze.ts`
- Delete: `supabase/functions/prefill-documents/stage1.ts`
- Delete: `supabase/functions/prefill-documents/stage2.ts`
- Delete: `supabase/functions/prefill-documents/schemas.test.ts` outdated cases (re-write)

- [ ] **Step 1: Delete the old files**

```bash
git rm supabase/functions/prefill-documents/stage1.ts supabase/functions/prefill-documents/stage2.ts
```

- [ ] **Step 2: Replace schemas.test.ts with new tests for SwarmPrefill**

```ts
// supabase/functions/prefill-documents/schemas.test.ts
import { SwarmPrefill } from "./schemas.ts";
import { assertEquals, assertThrows } from "std/assert/mod.ts";

Deno.test("SwarmPrefill accepts a yes-answer with confidence + rationale", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 82,
    answer_rationale: "Camden B.V. pays disregarded royalties to a US LLC.",
    suggested_toelichting: "Camden B.V. is a Dutch BV that ...",
    source_refs: [{ doc_label: "Local file 2025", location: "§3.2 p.14" }],
  });
  assertEquals(parsed.suggested_answer, "yes");
  assertEquals(parsed.confidence_pct, 82);
});

Deno.test("SwarmPrefill accepts null answer + null confidence", () => {
  const parsed = SwarmPrefill.parse({
    suggested_answer: null,
    confidence_pct: null,
    answer_rationale: null,
    suggested_toelichting: "Some context.",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
  });
  assertEquals(parsed.suggested_answer, null);
});

Deno.test("SwarmPrefill rejects confidence > 100", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 120,
    answer_rationale: "x",
    suggested_toelichting: "y",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
  }));
});

Deno.test("SwarmPrefill rejects empty source_refs", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: "no",
    confidence_pct: 50,
    answer_rationale: "x",
    suggested_toelichting: "y",
    source_refs: [],
  }));
});

Deno.test("SwarmPrefill rejects rationale over 200 chars", () => {
  assertThrows(() => SwarmPrefill.parse({
    suggested_answer: "yes",
    confidence_pct: 80,
    answer_rationale: "x".repeat(201),
    suggested_toelichting: "y",
    source_refs: [{ doc_label: "Doc", location: "p.1" }],
  }));
});
```

- [ ] **Step 3: Run schema tests**

```bash
cd supabase/functions/prefill-documents
deno test --allow-net schemas.test.ts 2>&1 | tail -10
cd -
```

Expected: 5 pass.

- [ ] **Step 4: Write analyze.ts (the swarm)**

```ts
// supabase/functions/prefill-documents/analyze.ts
import type { SupabaseClient } from "supabase";
import { loadActivePrompt, renderTemplate } from "./prompts.ts";
import { callOpus, extractJson } from "./anthropic.ts";
import { SwarmPrefill, type SwarmPrefillType } from "./schemas.ts";

const CONCURRENCY = 12;

interface QuestionRow {
  question_id: string;
  question: string;
  question_explanation: string | null;
}

interface DocRow {
  id: string;
  doc_label: string;
  category: string;
  storage_path: string;
  mime_type: string;
  relevance_note: string | null;
}

const BAD_LEAD_INS = [
  "based on", "according to", "from the document", "from the documents",
  "the document concern", "the documents concern", "the document is", "the documents are",
  "the document suggests", "the documents suggest", "the document indicates", "the documents indicate",
  "the document shows", "the documents show", "the document states", "the documents state",
  "the financial statements", "the local file", "the master file", "the tax return",
  "the trial balance", "the general ledger", "the previous", "the linklaters memorandum",
  "the memorandum", "the memo", "the advisory letter", "the analysis",
  "it appears that", "it seems that",
  "the uploaded", "in the attached", "the attached",
  "as set out in", "as described in", "as documented in",
  "op basis van", "volgens het document", "het document suggereert",
  "uit het document blijkt", "blijkens het document",
];

const FORBIDDEN_ANYWHERE = [
  "the memorandum", "the memo ", "the advisory letter",
  "in the document", "in the documents",
  "as analysed in", "as analyzed in", "as discussed in", "as set out in", "as documented in",
  "the local file ", "the master file ", "the financial statement",
  "the trial balance ", "the previous atad2",
];

export async function runAnalyze(
  serviceClient: SupabaseClient,
  sessionId: string,
): Promise<{ ok: boolean; error?: string; prefill_count?: number }> {
  const started = Date.now();

  // 1. Atomic claim of the prefill_jobs row.
  const { error: jobInsertErr } = await serviceClient
    .from("atad2_prefill_jobs")
    .insert({
      session_id: sessionId,
      status: "stage2_running",
      started_at: new Date().toISOString(),
      stage1_finished_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    });
  if (jobInsertErr && !jobInsertErr.message.includes("duplicate")) {
    return { ok: false, error: jobInsertErr.message };
  }

  try {
    // 2. Load docs + their text content.
    const { data: docs } = await serviceClient
      .from("atad2_session_documents")
      .select("id, doc_label, category, storage_path, mime_type, relevance_note")
      .eq("session_id", sessionId);
    if (!docs || docs.length === 0) {
      throw new Error("No documents to analyze");
    }

    const docTextBlocks: string[] = [];
    for (const d of docs as DocRow[]) {
      const { data: file } = await serviceClient.storage.from("session-documents").download(d.storage_path);
      if (!file) continue;
      const text = await file.text();
      docTextBlocks.push(
        `<document doc_label="${d.doc_label}" category="${d.category}"` +
        (d.relevance_note ? ` relevance_note="${d.relevance_note.replace(/"/g, "'")}"` : "") +
        `>\n${text}\n</document>`
      );
    }
    const documentsBlock = docTextBlocks.join("\n\n");

    // 3. Load all unique questions.
    const { data: rawQuestions } = await serviceClient
      .from("atad2_questions")
      .select("question_id, question, question_explanation");
    const uniq = new Map<string, QuestionRow>();
    for (const q of rawQuestions ?? []) {
      if (!uniq.has(q.question_id)) uniq.set(q.question_id, q as QuestionRow);
    }
    const questions = Array.from(uniq.values());

    // 4. Load the active swarm prompt.
    const prompt = await loadActivePrompt(serviceClient, "prefill_swarm_system" as any);

    // 5. Build per-question worker.
    let totalIn = 0, totalOut = 0, totalCacheRead = 0, totalCacheCreate = 0;
    const failures: string[] = [];
    const inserts: Array<SwarmPrefillType & { question_id: string }> = [];

    const work = async (q: QuestionRow) => {
      try {
        const userText = renderTemplate(prompt.user_prompt_template, {
          documents_block: documentsBlock,
          question_id: q.question_id,
          question_text: q.question,
          question_explanation: q.question_explanation ?? "",
        });

        // Anthropic SDK accepts an array of content blocks for the user message.
        // We split into [cached doc block] + [non-cached question block].
        const docPrefix = userText.split("## Question")[0];
        const questionSuffix = "## Question" + userText.split("## Question")[1];

        const userContent = [
          { type: "text" as const, text: docPrefix, cache_control: { type: "ephemeral" } as const },
          { type: "text" as const, text: questionSuffix },
        ];

        const { text, usage } = await callOpus({
          model: prompt.model,
          systemPrompt: prompt.system_prompt,
          userContent,
          temperature: prompt.temperature,
          maxTokens: prompt.max_tokens,
        });

        totalIn += usage.input_tokens;
        totalOut += usage.output_tokens;
        totalCacheRead += usage.cache_read_input_tokens ?? 0;
        totalCacheCreate += usage.cache_creation_input_tokens ?? 0;

        const parsed = extractJson(text, SwarmPrefill);

        // Defensive lead-in / forbidden-phrase filter.
        const lower = parsed.suggested_toelichting.trim().toLowerCase();
        if (BAD_LEAD_INS.some((p) => lower.startsWith(p))) {
          failures.push(`${q.question_id}: bad lead-in`);
          return;
        }
        if (FORBIDDEN_ANYWHERE.some((p) => lower.includes(p))) {
          failures.push(`${q.question_id}: forbidden phrase`);
          return;
        }

        inserts.push({ ...parsed, question_id: q.question_id });
      } catch (e) {
        failures.push(`${q.question_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    // 6. Run with concurrency cap.
    const queue = [...questions];
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const q = queue.shift();
          if (q) await work(q);
        }
      })());
    }
    await Promise.allSettled(workers);

    // 7. Persist all valid prefills.
    if (inserts.length > 0) {
      await serviceClient.from("atad2_question_prefills").upsert(
        inserts.map((p) => ({
          session_id: sessionId,
          question_id: p.question_id,
          suggested_toelichting: p.suggested_toelichting,
          source_refs: p.source_refs,
          suggested_answer: p.suggested_answer,
          confidence_pct: p.confidence_pct,
          answer_rationale: p.answer_rationale,
          user_action: "pending",
        })),
        { onConflict: "session_id,question_id" },
      );
    }

    // 8. Finalize job row.
    await serviceClient.from("atad2_prefill_jobs")
      .update({
        stage2_finished_at: new Date().toISOString(),
        status: "completed",
        total_token_usage: {
          input_tokens: totalIn,
          output_tokens: totalOut,
          cache_read_input_tokens: totalCacheRead,
          cache_creation_input_tokens: totalCacheCreate,
        },
        stage2_prompt_version: prompt.version,
      })
      .eq("session_id", sessionId);

    console.log(JSON.stringify({
      level: "info", event: "swarm_completed",
      session_id: sessionId, prefill_count: inserts.length, failure_count: failures.length,
      duration_ms: Date.now() - started,
    }));

    return { ok: true, prefill_count: inserts.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await serviceClient.from("atad2_prefill_jobs")
      .update({ status: "failed", failed_at: new Date().toISOString(), error_message: message })
      .eq("session_id", sessionId);
    console.error(JSON.stringify({
      level: "error", event: "swarm_failed",
      session_id: sessionId, error: message,
    }));
    return { ok: false, error: message };
  }
}
```

- [ ] **Step 5: Verify Deno parses analyze.ts**

```bash
deno check supabase/functions/prefill-documents/analyze.ts
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/prefill-documents/
git commit -m "feat(prefill): replace stage1+stage2 with analyze.ts swarm + cached doc prefix"
```

---

## Task 6: Edge Function — index.ts dispatcher only handles `analyze` and `cleanup`

**Files:**
- Modify: `supabase/functions/prefill-documents/index.ts`

- [ ] **Step 1: Update imports**

Replace these imports near the top:
```ts
import { runSummarize } from "./stage1.ts";
import { runExtract } from "./stage2.ts";
```
with:
```ts
import { runAnalyze } from "./analyze.ts";
```

- [ ] **Step 2: Update the action dispatcher**

Find the `switch (body.action)` block. Replace its entire body with:

```ts
switch (body.action) {
  case "analyze": {
    const result = await runAnalyze(serviceClient, body.session_id);
    return json(result, result.ok ? 200 : 500);
  }
  case "cleanup": {
    const result = await runCleanup(serviceClient, body.session_id);
    return json(result, result.ok ? 200 : 500);
  }
  default:
    return json({ error: `Unknown action: ${body.action}` }, 400);
}
```

Also update the `PrefillRequest` interface near the top:
```ts
interface PrefillRequest {
  action: "analyze" | "cleanup";
  session_id: string;
}
```

(Remove `document_id` field — no longer used.)

- [ ] **Step 3: Verify Deno parses index.ts**

```bash
deno check supabase/functions/prefill-documents/index.ts
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/prefill-documents/index.ts
git commit -m "feat(prefill): dispatcher only routes analyze + cleanup"
```

---

## Task 7: Deploy edge function to VM

- [ ] **Step 1: Tar + base64 + Run Command**

```bash
tar -czf /tmp/prefill.tgz -C supabase/functions prefill-documents/
base64 -w 0 /tmp/prefill.tgz > /tmp/prefill.b64
B64=$(cat /tmp/prefill.b64)
cat > /tmp/deploy.sh <<EOF
#!/bin/bash
set -e
TARGET="/root/supabase-docker/volumes/functions/prefill-documents"
echo "$B64" | base64 -d > /tmp/prefill.tgz
mkdir -p "\$(dirname "\$TARGET")"
rm -rf "\$TARGET"
tar -xzf /tmp/prefill.tgz -C "\$(dirname "\$TARGET")"
rm -f /tmp/prefill.tgz
ls -la "\$TARGET" | tail -15
cd /root/supabase-docker
docker compose up -d --force-recreate functions 2>&1 | tail -3
sleep 3
docker ps --format '{{.Names}} :: {{.Status}}' | grep edge-functions
EOF
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts @/tmp/deploy.sh 2>&1 | tail -20
rm -f /tmp/prefill.tgz /tmp/prefill.b64 /tmp/deploy.sh
```

Expected: directory listing shows `analyze.ts` (no `stage1.ts`, no `stage2.ts`), container shows `Up 3 seconds`.

- [ ] **Step 2: Smoke-test the endpoint with the anon key**

```bash
curl -s -X POST https://api.atad2.tax/functions/v1/prefill-documents \
  -H "Authorization: Bearer eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE2NDE3NjkyMDAsICJleHAiOiAxNzk5NTM1NjAwfQ.rnsxsFRAvsoKzOta2QUNb7D_nzd4erNRN4WyqBw99UY" \
  -H "Content-Type: application/json" \
  -d '{"action":"analyze","session_id":"00000000-0000-0000-0000-000000000000"}' \
  --max-time 15
```

Expected: `{"error":"Forbidden"}` (no session ownership). Confirms the function is up and the dispatcher accepts `analyze`.

---

## Task 8: Frontend — drop wait screen + ExtractionProgress + Continue fires analyze

**Files:**
- Modify: `src/pages/AssessmentUpload.tsx`
- Delete: `src/components/prefill/ExtractionProgress.tsx`
- Modify: `src/hooks/usePrefill.ts` (rename `useStartExtraction` to `useStartAnalyze` for clarity, keep behavior)

- [ ] **Step 1: Rename the mutation in usePrefill.ts**

Find this block in `src/hooks/usePrefill.ts`:
```ts
export function useStartExtraction(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session id");
      return await invokePrefillFn({ action: "extract", session_id: sessionId });
    },
    ...
```

Replace with:
```ts
export function useStartAnalyze(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session id");
      return await invokePrefillFn({ action: "analyze", session_id: sessionId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prefill-job", sessionId] });
      qc.invalidateQueries({ queryKey: ["question-prefills", sessionId] });
    },
  });
}
```

- [ ] **Step 2: Replace AssessmentUpload.tsx with the slim version**

Open `src/pages/AssessmentUpload.tsx` and replace the entire file content with:

```tsx
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentUploader } from "@/components/prefill/DocumentUploader";
import { usePrefillStore } from "@/stores/prefillStore";
import {
  useSessionDocuments, usePrefillJob, useStartAnalyze,
} from "@/hooks/usePrefill";

export default function AssessmentUpload() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const navigate = useNavigate();
  const store = usePrefillStore();

  const { data: docs } = useSessionDocuments(sessionId);
  const { data: job } = usePrefillJob(sessionId);
  const startAnalyze = useStartAnalyze(sessionId);

  const locked = !!job?.locked_at;
  const allPendingCategorized = store.pendingFiles.every((p) => !!p.category);
  const allPendingUploaded = store.pendingFiles.every((p) => p.status === "uploaded" || p.status === "failed");
  const hasAtLeastOneUploaded = (docs?.length ?? 0) > 0;

  // Reset client-side pending list when session changes.
  useEffect(() => {
    store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!sessionId) return <div className="p-8">Missing session.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Upload supporting documents (optional)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documents are processed only for pre-fill extraction. They are not used for AI training.
          You can delete them anytime, and they are automatically removed when you generate the report.
        </p>
      </header>

      {!locked && (
        <Card className="p-4 bg-muted/40 text-sm">
          Supported formats: PDF, images (PNG/JPG/WEBP), Word (.docx), PowerPoint (.pptx), Excel (.xlsx), text/CSV/Markdown.
          Max 32 MB per file, 200 MB per session.
        </Card>
      )}

      <DocumentUploader sessionId={sessionId} locked={locked} />

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate(`/assessment?session=${sessionId}`)}>
          {hasAtLeastOneUploaded ? "Skip suggestions" : "Skip — no documents"}
        </Button>
        <Button
          disabled={
            !hasAtLeastOneUploaded ||
            !allPendingCategorized ||
            !allPendingUploaded
          }
          onClick={() => {
            // Fire the swarm and immediately navigate. Suggestions arrive
            // via Realtime as each per-question call completes.
            startAnalyze.mutate(undefined, {
              onError: (e) => console.warn("[continue] analyze dispatch failed", e),
            });
            navigate(`/assessment?session=${sessionId}`);
          }}
        >
          Continue to questions
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete ExtractionProgress component**

```bash
git rm src/components/prefill/ExtractionProgress.tsx
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If `useStartExtraction` is referenced elsewhere, change those callers to `useStartAnalyze` (likely none after this rewrite).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(prefill): drop wait screen, fire analyze + navigate immediately"
```

---

## Task 9: Frontend — fix relevance-note input freeze (kick on transition only)

**Files:**
- Modify: `src/components/prefill/DocumentUploader.tsx`

- [ ] **Step 1: Replace the relevance note onChange handler**

Find the existing block:
```tsx
<Input
  value={p.relevanceNote}
  onChange={(e) => {
    const note = e.target.value;
    store.setRelevanceNote(p.localId, note);
    if (p.status === "queued" && isReadyToUpload({ ...p, relevanceNote: note })) {
      kickUpload({ ...p, relevanceNote: note });
    }
  }}
  ...
/>
```

Replace with:
```tsx
<Input
  value={p.relevanceNote}
  onChange={(e) => {
    const note = e.target.value;
    const wasReadyBefore = isReadyToUpload(p);
    const next: PendingFile = { ...p, relevanceNote: note };
    const isReadyNow = isReadyToUpload(next);
    store.setRelevanceNote(p.localId, note);
    // Kick upload only on the transition from not-ready to ready, not on
    // every keystroke after that. Prevents the input from being disabled
    // mid-typing as soon as the threshold is crossed.
    if (p.status === "queued" && !wasReadyBefore && isReadyNow) {
      kickUpload(next);
    }
  }}
  className="text-xs"
  disabled={locked || p.status === "uploading" || p.status === "uploaded"}
  placeholder={`Why is this document relevant? (required, min ${RELEVANCE_NOTE_MIN_LENGTH} characters)`}
/>
```

Also look at the disabled prop change — the original was `disabled={locked || p.status === "uploaded"}`. We now also disable while `uploading` so the user can't type into a row that's mid-upload. (The frozen-input bug was about the kick-on-keystroke loop, not the disable-on-uploaded gate.)

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Run dev server and verify**

```bash
npm run dev
```

Open the app, upload a doc, type a relevance note past 30 characters in one continuous burst. Expected: the input remains responsive throughout; upload kicks off the moment the 30th character is typed but the input doesn't freeze before that.

- [ ] **Step 4: Commit**

```bash
git add src/components/prefill/DocumentUploader.tsx
git commit -m "fix(prefill): kick upload on ready-transition only, prevents input freeze"
```

---

## Task 10: Frontend — SuggestedAnswerChip component

**Files:**
- Create: `src/components/prefill/SuggestedAnswerChip.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Button } from "@/components/ui/button";

interface Props {
  suggestedAnswer: "yes" | "no" | "unknown" | null;
  confidencePct: number | null;
  answerRationale: string | null;
  onUse: (answer: "yes" | "no" | "unknown") => void;
}

const CONFIDENCE_THRESHOLD = 40;

export function SuggestedAnswerChip({ suggestedAnswer, confidencePct, answerRationale, onUse }: Props) {
  // Hidden when the model declined to answer or confidence is too low.
  if (!suggestedAnswer || confidencePct == null || confidencePct < CONFIDENCE_THRESHOLD) {
    return null;
  }

  const tier = confidencePct >= 70 ? "high" : "medium";
  const borderClass = tier === "high"
    ? "border-l-green-500 bg-green-50/40"
    : "border-l-amber-500 bg-amber-50/40";
  const tierLabel = tier === "medium" ? " — verify" : "";
  const answerLabel = suggestedAnswer.charAt(0).toUpperCase() + suggestedAnswer.slice(1);

  return (
    <div className={`border border-border border-l-4 ${borderClass} rounded p-3 mb-2`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">
          <div className="font-medium">
            Suggested answer: {answerLabel} ({confidencePct}%){tierLabel}
          </div>
          {answerRationale && (
            <div className="text-xs text-muted-foreground mt-1">{answerRationale}</div>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => onUse(suggestedAnswer)}>
          Use
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/prefill/SuggestedAnswerChip.tsx
git commit -m "feat(prefill): SuggestedAnswerChip component (≥40% confidence gating)"
```

---

## Task 11: Frontend — render SuggestedAnswerChip on the assessment radio + on the report Edit form

**Files:**
- Modify: `src/lib/prefill/types.ts` (extend QuestionPrefill type)
- Modify: `src/pages/Assessment.tsx`
- Modify: `src/components/EditableAnswer.tsx`

- [ ] **Step 1: Extend QuestionPrefill type**

In `src/lib/prefill/types.ts`, find the `QuestionPrefill` interface and add three fields:
```ts
export interface QuestionPrefill {
  id: string;
  session_id: string;
  question_id: string;
  suggested_toelichting: string;
  source_refs: SourceRef[];
  verbatim_quote: string | null;
  user_action: PrefillUserAction;
  actioned_at: string | null;
  created_at: string;
  suggested_answer: "yes" | "no" | "unknown" | null;
  confidence_pct: number | null;
  answer_rationale: string | null;
}
```

- [ ] **Step 2: Render the chip in Assessment.tsx**

Find the radio group block (search for `RadioGroup` near the question rendering). Just above the radio group's opening tag, add:

```tsx
{currentPrefill && (
  <SuggestedAnswerChip
    suggestedAnswer={currentPrefill.suggested_answer}
    confidencePct={currentPrefill.confidence_pct}
    answerRationale={currentPrefill.answer_rationale}
    onUse={(ans) => {
      // Use the existing answer-selection handler. Find the function
      // currently bound to RadioGroup's onValueChange — call it with the
      // suggested answer's capitalized form ("Yes", "No", "Unknown") to
      // match the existing answer_option values.
      const option = ans.charAt(0).toUpperCase() + ans.slice(1);
      handleAnswerSelection(option);  // replace with the actual handler name
    }}
  />
)}
```

Add the import at the top:
```tsx
import { SuggestedAnswerChip } from "@/components/prefill/SuggestedAnswerChip";
```

The exact handler name varies by file — `grep -n "onValueChange.*Radio" src/pages/Assessment.tsx` to find it. The handler accepts a string like `"Yes"`/`"No"`/`"Unknown"` and updates state plus may persist.

- [ ] **Step 3: Render the chip in EditableAnswer.tsx**

Open `src/components/EditableAnswer.tsx`. Find the `{isEditing ? (` block where the answer-edit radio is rendered. Above that radio, add:

```tsx
{prefill && isEditing && (
  <SuggestedAnswerChip
    suggestedAnswer={prefill.suggested_answer}
    confidencePct={prefill.confidence_pct}
    answerRationale={prefill.answer_rationale}
    onUse={(ans) => {
      const option = ans.charAt(0).toUpperCase() + ans.slice(1);
      setAnswer(option);
      updatePrefillAction.mutate({ prefillId: prefill.id, action: "accepted" });
    }}
  />
)}
```

Add the import:
```tsx
import { SuggestedAnswerChip } from "@/components/prefill/SuggestedAnswerChip";
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/prefill/types.ts src/pages/Assessment.tsx src/components/EditableAnswer.tsx
git commit -m "feat(prefill): render SuggestedAnswerChip on assessment + report edit"
```

---

## Task 12: Frontend — sidebar status pill

**Files:**
- Create: `src/hooks/useQuestionCount.ts`
- Modify: `src/components/AssessmentSidebar.tsx`

- [ ] **Step 1: Add the question-count hook**

```ts
// src/hooks/useQuestionCount.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useQuestionCount() {
  return useQuery({
    queryKey: ["question-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("question_id");
      if (error) throw error;
      const uniq = new Set((data ?? []).map((q) => q.question_id));
      return uniq.size;
    },
    staleTime: 5 * 60_000, // 5 minutes; questions don't change often
  });
}
```

- [ ] **Step 2: Add the status pill to AssessmentSidebar**

Open `src/components/AssessmentSidebar.tsx`. Add imports:
```tsx
import { usePrefillJob, useAllPrefills } from "@/hooks/usePrefill";
import { useQuestionCount } from "@/hooks/useQuestionCount";
```

Inside the component, before the return:
```tsx
const { data: job } = usePrefillJob(sessionId);
const { data: prefills } = useAllPrefills(sessionId);
const { data: questionCount } = useQuestionCount();
const readyCount = (prefills ?? []).length;

let pillContent: string | null = null;
if (job?.status === "stage2_running" && questionCount) {
  pillContent = `Analyzing documents · ${readyCount} / ${questionCount} questions ready`;
} else if (job?.status === "completed" && readyCount > 0) {
  pillContent = `Analysis complete · ${readyCount} suggestions ready`;
} else if (job?.status === "failed") {
  pillContent = `Analysis failed — continuing without suggestions`;
}
```

In the JSX (top of the sidebar render), conditionally render:
```tsx
{pillContent && (
  <div className="text-xs px-3 py-2 rounded bg-muted text-muted-foreground mb-2">
    {pillContent}
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useQuestionCount.ts src/components/AssessmentSidebar.tsx
git commit -m "feat(prefill): sidebar live status pill (X / N ready)"
```

---

## Task 13: Frontend — drop the verbatim_quote display from SuggestionCard

**Files:**
- Modify: `src/components/prefill/SuggestionCard.tsx`

- [ ] **Step 1: Remove the show-quote toggle block**

Find the block:
```tsx
{prefill.verbatim_quote && (
  <div>
    <button ...>Show source quote</button>
    {showQuote && <blockquote ...>{prefill.verbatim_quote}</blockquote>}
  </div>
)}
```

Delete that whole block. Also delete `const [showQuote, setShowQuote] = useState(false);` and the `ChevronDown`/`ChevronUp` imports at the top of the file if they're no longer used elsewhere in that file.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/prefill/SuggestionCard.tsx
git commit -m "feat(prefill): drop verbatim_quote display (no longer populated by swarm prompt)"
```

---

## Task 14: Frontend — drop AssessmentReviewPrefills lazy import + route

**Files:**
- Modify: `src/App.tsx`
- Delete: `src/pages/AssessmentReviewPrefills.tsx`

- [ ] **Step 1: Remove the lazy import**

In `src/App.tsx`, remove:
```ts
const AssessmentReviewPrefills = lazy(() => import("./pages/AssessmentReviewPrefills"));
```

And the route:
```tsx
<Route path="/assessment/review-prefills/:sessionId" element={...} />
```

- [ ] **Step 2: Delete the file**

```bash
git rm src/pages/AssessmentReviewPrefills.tsx
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(prefill): drop unused AssessmentReviewPrefills route + page"
```

---

## Task 15: End-to-end manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Full happy path**

1. Hard-refresh browser, log in, click Start new assessment.
2. Fill taxpayer + tax year, click Start. (Pass through Before-You-Start modal as before.)
3. Choose "Yes, share background info" on the second modal.
4. Upload one PDF (or DOCX). Pick category. Type ≥30 chars relevance note in one continuous burst — input must remain responsive throughout.
5. Click **Continue to questions** — you should arrive on `/assessment` immediately, no wait screen.
6. Sidebar shows pill: *"Analyzing documents · 0 / N questions ready"* (where N is the dynamic question count).
7. Within ~25 seconds, count climbs to N and pill flips to *"Analysis complete · N suggestions ready"*.
8. Navigate to Q1: see SuggestedAnswerChip if confidence ≥40, plus the toelichting SuggestionCard. Click **Use** on the chip → radio-fills with the suggested answer.
9. Click Accept on the toelichting card → textarea fills.
10. Continue to Q2, Q3 — each lands quickly because their calls completed in parallel.

- [ ] **Step 3: Edge cases**

- Type past 30 chars in relevance note in one breath: input never freezes.
- Skip — no documents path: navigates straight to /assessment, no analyze fired, no sidebar pill.
- Confidence under 40%: no chip shown, only toelichting card (or empty state if no toelichting either).
- Report page → Edit a question with a prefill: SuggestedAnswerChip appears above the answer radio.

- [ ] **Step 4: Server-side verification**

In Studio (or via Run Command):
```sql
SELECT question_id, suggested_answer, confidence_pct, answer_rationale, length(suggested_toelichting) AS chars
FROM atad2_question_prefills
WHERE session_id = '<the test session>'
ORDER BY question_id LIMIT 10;
SELECT total_token_usage FROM atad2_prefill_jobs WHERE session_id = '<the test session>';
```

Pass: rows have non-null `suggested_answer` for unambiguous cases, `cache_read_input_tokens > 0` in token usage (proves caching is active).

- [ ] **Step 5: No commit needed (verification step only)**

---

## Self-review checklist (run after drafting)

1. **Spec coverage:** every spec section maps to at least one task:
   - §4 Pipeline architecture → Tasks 4, 5, 6, 7
   - §5 Output schema (3 new columns + Zod) → Tasks 1, 3, 4
   - §6.1 Upload screen + bug A → Tasks 8, 9
   - §6.2 Sidebar status pill → Task 12
   - §6.3 Suggested-answer chip → Tasks 10, 11
   - §6.4 SuggestionCard verbatim_quote drop → Task 13
   - §7 Migration & deploy → Tasks 1, 2, 7
   - Cleanup of AssessmentReviewPrefills → Task 14

2. **Placeholder scan:** no "TBD" / "TODO" / "similar to Task N" in the plan body. Every code step has actual code.

3. **Type consistency:**
   - `SwarmPrefill` (Zod) → matches the runAnalyze code → matches the column types in Task 1.
   - `useStartAnalyze` defined in Task 8 → consumed in Task 8 frontend (immediate caller).
   - `SuggestedAnswerChip` props (Task 10) → match how it's invoked in Task 11.

4. **Caveat in Task 11 Step 2:** the exact handler name to call (`handleAnswerSelection` placeholder) is confirmed by grepping the file before the edit; the implementer must look it up. This is acceptable because the file is large and the actual name may differ from the assumption.

---

## End of plan
