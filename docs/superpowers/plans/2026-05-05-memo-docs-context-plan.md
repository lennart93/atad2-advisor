# Memo docs-as-background-context implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass the session's uploaded documents to the memorandum-generation n8n flow as background context, deferring doc-cleanup until after the memo is saved.

**Architecture:** Client extracts a small shared helper that builds the `<document …>` XML block (already done inline by `useStartAnalyze`), `handleGenerateReport` reuses it, sends `documents_block` in the POST body to n8n, and only deletes session_documents on the success path. The n8n `Build prompt + metrics` Code node reads `documents_block` from the webhook body and injects a `<u>Background documents</u>` section between the vector-store research instructions and the Risk analysis basis. No DB migration. No edge-function change.

**Tech Stack:** React 18, TypeScript, Supabase JS, Supabase Storage, n8n Code node (JS).

**Branch:** `feat/document-prefill` (continuing prior iter work).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/prefill/buildDocumentsBlock.ts` (new) | Shared helper. Reads `atad2_session_documents` for a sessionId, downloads each from Storage, joins as `<document doc_label="..." category="..."[ relevance_note="..."]>…</document>` with `\n\n` between entries. Returns `""` when zero docs. |
| `src/hooks/usePrefill.ts` | `useStartAnalyze` switches its inline doc-block builder to the new helper (no behavior change; keep the "no docs" throw). |
| `src/pages/AssessmentReport.tsx` | Reorder `handleGenerateReport`: build docs → POST → cleanup-on-success. New `documents_block` POST field. |
| n8n flow `Build prompt + metrics` Code node | Read `documents_block` from `webhookBody`; append a `<u>Background documents</u>` section before the Risk analysis basis; add a top-level rule about treating background docs as supporting context only. **Manual edit in n8n UI**, not a code-repo change. |

---

## Task 1 — Extract `buildDocumentsBlock` helper

**Files:**
- Create: `src/lib/prefill/buildDocumentsBlock.ts`

- [ ] **Step 1: Create the helper file**

Write to `src/lib/prefill/buildDocumentsBlock.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all session documents and assemble them into the canonical
 * <document …> XML block used by both the swarm prefill and memo
 * generation prompts. Returns "" when no docs exist.
 *
 * Format mirrors what useStartAnalyze already produces in iter 3 so the
 * model sees the same shape across both prompts.
 */
export async function buildDocumentsBlock(sessionId: string): Promise<string> {
  const { data: docs } = await supabase
    .from("atad2_session_documents")
    .select("id, doc_label, category, storage_path, relevance_note")
    .eq("session_id", sessionId);

  if (!docs || docs.length === 0) return "";

  const docTexts = await Promise.all(
    docs.map(async (d) => {
      const { data: file } = await supabase.storage
        .from("session-documents")
        .download(d.storage_path);
      if (!file) return null;
      const text = await file.text();
      const noteAttr = d.relevance_note
        ? ` relevance_note="${String(d.relevance_note).replace(/"/g, "'")}"`
        : "";
      return `<document doc_label="${d.doc_label}" category="${d.category}"${noteAttr}>\n${text}\n</document>`;
    })
  );

  return docTexts.filter(Boolean).join("\n\n");
}
```

- [ ] **Step 2: Verify build**

Run:

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prefill/buildDocumentsBlock.ts
git commit -m "feat(prefill): extract buildDocumentsBlock helper

Single source of truth for the <document …> XML block format. Used
by the swarm prefill flow and (next commit) the memo-generation
flow so both prompts see the same shape."
```

---

## Task 2 — Switch `useStartAnalyze` to the helper

**Files:**
- Modify: `src/hooks/usePrefill.ts:275-295`

- [ ] **Step 1: Read the file**

The current inline block (around line 278-295) builds the same XML block we just extracted. After this task `useStartAnalyze` calls `buildDocumentsBlock` and keeps its existing "no docs" throw.

- [ ] **Step 2: Replace the inline block**

Find:

```ts
      // 1. Build the documents block from Storage on the client.
      const { data: docs } = await supabase
        .from("atad2_session_documents")
        .select("id, doc_label, category, storage_path, relevance_note")
        .eq("session_id", sessionId);
      if (!docs || docs.length === 0) throw new Error("No documents to analyze");

      const docTexts = await Promise.all(docs.map(async (d) => {
        const { data: file } = await supabase.storage.from("session-documents").download(d.storage_path);
        if (!file) return null;
        const text = await file.text();
        const noteAttr = d.relevance_note
          ? ` relevance_note="${String(d.relevance_note).replace(/"/g, "'")}"`
          : "";
        return `<document doc_label="${d.doc_label}" category="${d.category}"${noteAttr}>\n${text}\n</document>`;
      }));
      const documentsBlock = docTexts.filter(Boolean).join("\n\n");
      if (!documentsBlock) throw new Error("Could not assemble documents block");
```

Replace with:

```ts
      // 1. Build the documents block via the shared helper.
      const documentsBlock = await buildDocumentsBlock(sessionId);
      if (!documentsBlock) throw new Error("No documents to analyze");
```

And add the import at the top of `src/hooks/usePrefill.ts` (with the other imports):

```ts
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePrefill.ts
git commit -m "refactor(prefill): useStartAnalyze uses buildDocumentsBlock helper

No behavior change. Same XML format, same 'no docs' throw, same
caller. Centralises the doc-block builder for reuse by memo gen."
```

---

## Task 3 — Wire `documents_block` into memo generation

**Files:**
- Modify: `src/pages/AssessmentReport.tsx` `handleGenerateReport()` (around line 372-460)

- [ ] **Step 1: Add the import**

At the top of `src/pages/AssessmentReport.tsx`, add:

```ts
import { buildDocumentsBlock } from "@/lib/prefill/buildDocumentsBlock";
```

- [ ] **Step 2: Reorder the function**

Find the current cleanup-then-POST block (roughly lines 380-413):

```tsx
      console.log('Starting report generation for session:', sessionId);
      
      // Delete uploaded source documents now that the report is being generated.
      // The report uses answers + additional_context only — not the raw docs.
      // If the n8n call subsequently fails, the user can retry without the docs.
      const cleanupResult = await cleanupDocs.mutateAsync().catch(() => null);
      if (cleanupResult?.deleted_count && cleanupResult.deleted_count > 0) {
        toast.success("Source documents deleted", { description: "Generating your report…" });
      }

      // Call n8n webhook - n8n will process and the Edge Function will save the complete report
      // Using AbortController with 10 minute timeout to allow for long-running AI processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes

      const { data: { session: authSession } } = await supabase.auth.getSession();

      const n8nResponse = await fetch(`${import.meta.env.VITE_N8N_WEBHOOK_BASE}/atad2/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          auth_token: authSession?.access_token,
          additional_context: sessionData?.additional_context || null,
          outcome_overridden: sessionData?.outcome_overridden || false,
          override_reason: sessionData?.override_reason || null,
          override_outcome: sessionData?.override_outcome || null,
          preliminary_outcome: sessionData?.preliminary_outcome || null
        }),
        signal: controller.signal
      });
```

Replace with:

```tsx
      console.log('Starting report generation for session:', sessionId);

      // Build the background documents block BEFORE the n8n call so we can pass
      // it through. Cleanup is deferred to the success branch — if the n8n call
      // fails the user can retry without re-uploading.
      let documentsBlock = "";
      try {
        documentsBlock = await buildDocumentsBlock(sessionId);
      } catch (e) {
        console.warn('[generate-report] buildDocumentsBlock failed, continuing without docs', e);
      }
      console.log('[generate-report] documents_block bytes:', documentsBlock.length);

      // Call n8n webhook - n8n will process and the Edge Function will save the complete report
      // Using AbortController with 10 minute timeout to allow for long-running AI processing
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 minutes

      const { data: { session: authSession } } = await supabase.auth.getSession();

      const n8nResponse = await fetch(`${import.meta.env.VITE_N8N_WEBHOOK_BASE}/atad2/generate-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          auth_token: authSession?.access_token,
          additional_context: sessionData?.additional_context || null,
          outcome_overridden: sessionData?.outcome_overridden || false,
          override_reason: sessionData?.override_reason || null,
          override_outcome: sessionData?.override_outcome || null,
          preliminary_outcome: sessionData?.preliminary_outcome || null,
          documents_block: documentsBlock,
        }),
        signal: controller.signal
      });
```

- [ ] **Step 3: Move cleanup to the success branch**

Find the current success path (around lines 425-436 — the block where `n8nData` is parsed and the success toast fires):

```tsx
      const n8nData = await n8nResponse.json();
      console.log('n8n response data:', n8nData);

      // No need to save to Supabase here - the Edge Function handles the complete insert
      console.log('Report processing completed successfully');

      // Refresh reports query to show the newly created report
      queryClient.invalidateQueries({ queryKey: ["reports", sessionId] });

      {
        const subjectName =
          (sessionData as unknown as { entity_name?: string | null })?.entity_name ||
          sessionData?.taxpayer_name ||
          "this session";
        toast.success("Memorandum generated", {
          description: `Memo for ${subjectName} is ready to download.`,
        });
      }
```

Insert the cleanup just before the `queryClient.invalidateQueries` call:

```tsx
      const n8nData = await n8nResponse.json();
      console.log('n8n response data:', n8nData);

      // No need to save to Supabase here - the Edge Function handles the complete insert
      console.log('Report processing completed successfully');

      // Now that the memo has been saved, drop the source documents.
      const cleanupResult = await cleanupDocs.mutateAsync().catch(() => null);
      if (cleanupResult?.deleted_count && cleanupResult.deleted_count > 0) {
        toast.success("Source documents deleted", { description: "The memorandum is saved." });
      }

      // Refresh reports query to show the newly created report
      queryClient.invalidateQueries({ queryKey: ["reports", sessionId] });

      {
        const subjectName =
          (sessionData as unknown as { entity_name?: string | null })?.entity_name ||
          sessionData?.taxpayer_name ||
          "this session";
        toast.success("Memorandum generated", {
          description: `Memo for ${subjectName} is ready to download.`,
        });
      }
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: success. If TypeScript complains about `cleanupResult.deleted_count` typing, the existing useCleanupDocuments mutation result is already shaped that way (it was used the same way pre-change), so this is just a relocation — no type widening.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AssessmentReport.tsx
git commit -m "feat(memo): pass documents_block to n8n + defer cleanup to success

Reorders handleGenerateReport so the docs are bundled and sent
along to n8n as background context, and the cleanup of
session_documents only fires after a successful 200 from n8n.
Failed memo gen leaves the docs intact so the user can retry."
```

---

## Task 4 — Update n8n flow (manual UI edit)

**This is not a code-repo task. It edits the live n8n workflow at `https://n8n.atad2.tax`.**

The user must apply this change in the n8n UI; the agent cannot write to n8n directly. After the client side ships, the n8n flow must be updated in lockstep — otherwise n8n will silently ignore the new field and the memo prompt will not include the docs.

- [ ] **Step 1: Open the workflow**

Browse to `https://n8n.atad2.tax`, open the **ATAD2** workflow, click the **Build prompt + metrics** Code node.

- [ ] **Step 2: Add the `documentsBlock` extraction**

Near the top of the JS code, after the existing `webhookBody` extraction:

```js
const webhookItems = $items('Webhook (generate report)');
const webhookBody = webhookItems[0]?.json?.body || {};
const requestSessionId = webhookBody.session_id || webhookItems[0]?.json?.query?.session_id || '';
```

Add a new line:

```js
const documentsBlock = String(webhookBody.documents_block || "").trim();
```

- [ ] **Step 3: Append the rule**

In the long backtick-template that builds the `prompt` variable, immediately after the `Always use cautious phrasing such as: …` block (i.e. before the `${overrideBlock}` interpolation), add a new bullet:

```text
- BACKGROUND DOCUMENTS, IF PROVIDED: Treat them as supporting context only. The answers in the Risk analysis basis below are authoritative. Do not introduce new factual claims that are not also reflected in the answers. Do not cite the documents directly in the memo — the memo must read as the advisor's analysis.
```

- [ ] **Step 4: Inject the section**

In the same template, immediately BEFORE the `<u>Risk analysis basis</u>` line, insert:

```js
${documentsBlock ? `---
<u>Background documents</u>

The taxpayer provided the following documents as background reference. Use them only to verify or refine the framing of the answers below; do NOT introduce new factual claims that are not also reflected in those answers.

${documentsBlock}

---
` : ''}
```

So the prompt structure becomes:

```
… vector-store research instructions …
{Background documents section, only if non-empty}
<u>Risk analysis basis</u>
{qaList}
{Additional context, only if non-empty}
```

- [ ] **Step 5: Save & activate**

Click **Save** in the n8n editor. The workflow stays active.

- [ ] **Step 6: Smoke-test from the n8n UI**

Click **Execute Workflow** (or trigger from the client) on a test session that has docs. Open the execution log, click the AI Agent node → **Input** → verify the prompt sent to Claude contains a `<u>Background documents</u>` section with `<document doc_label="...">…</document>` entries.

---

## Verification

End-to-end after Tasks 1-3 ship and Task 4 is applied:

1. **Happy path with docs.** New session → upload 2 PDFs → complete assessment → click Generate Memorandum. Network tab: POST to n8n includes `documents_block` of ≥ ~10 KB. Memo arrives within 10 min, narrative reads tighter on facts that came from the docs.
2. **Cleanup runs after success.** After the 200 OK and the success toast, `SELECT count(*) FROM atad2_session_documents WHERE session_id = '…';` returns 0.
3. **Cleanup is skipped on error.** Force a 500 from n8n (kill the Anthropic credential, or stop the n8n container mid-run). Docs row count stays > 0. User clicks Generate again with the same docs → still works.
4. **No docs uploaded.** Skip the upload step → finish → generate memo. Network: `documents_block: ""`. n8n flow renders prompt without the Background documents section. Memo still works on answers alone.
5. **Prompt sanity in n8n exec log.** Pull the execution log on a successful run with docs → verify the prompt contains the new `<u>Background documents</u>` section AND the new BACKGROUND DOCUMENTS rule near the top.

---

## Self-review

- ✅ Spec coverage: Q1 (client builds) ↔ Tasks 1+2+3; Q2 (cleanup after success) ↔ Task 3 step 3; Q3 (background framing) ↔ Task 4 steps 3+4.
- ✅ No placeholders. Every step has actual code or click-by-click n8n instructions.
- ✅ Type consistency: `buildDocumentsBlock` returns `Promise<string>`, both call-sites consume it as a string. `useStartAnalyze` keeps its empty-string-throws-no-docs semantics; `handleGenerateReport` accepts empty string and passes it through.
- ⚠️ Risk: n8n flow update (Task 4) is manual. Until applied, n8n will receive `documents_block` but ignore it (no harm, just no new behavior). After the client lands but before n8n is updated, memos still generate — they just won't reference the docs. Acceptable interim state.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-05-05-memo-docs-context-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks here with checkpoints.

**Which approach?**
