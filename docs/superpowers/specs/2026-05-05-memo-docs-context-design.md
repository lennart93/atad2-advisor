# Pass uploaded docs as background context to memorandum generation

**Date:** 2026-05-05
**Branch:** `feat/document-prefill`

---

## Context

Today the memorandum generation flow (n8n webhook `https://n8n.atad2.tax/webhook/atad2/generate-report`) prompts Claude with **only** the user's answers + their explanations + an optional `additional_context` field. The uploaded documents — used during the swarm pipeline to pre-fill answers — are **deleted** right before the n8n call ([AssessmentReport.tsx:386](src/pages/AssessmentReport.tsx#L386)) and never reach the memo prompt.

The user wants the docs to come along to the memo call as **background reference**, so the model can:
- verify/refine the framing of the answers,
- detect cases where the answers are thin and the docs would help phrase the toelichting more precisely,
- avoid hallucinating facts that the docs would have grounded.

The user has decided to **keep n8n** for memo generation rather than migrate to a new Edge Function. The change is therefore an extension of the current flow, not a rewrite.

Decisions taken in brainstorm (2026-05-05):
- **Q1: Client builds the `documents_block`** — mirrors `useStartAnalyze` for the swarm.
- **Q2: Docs are deleted only after a successful 200 from n8n**, not before.
- **Q3: Docs are framed as background**, not as primary source — answers remain authoritative.

---

## Approach

### Client side

**File:** [src/pages/AssessmentReport.tsx](src/pages/AssessmentReport.tsx) — `handleGenerateReport()`.

Refactor the order of operations:

1. **Stop deleting docs first.** Remove the `cleanupDocs.mutateAsync()` call currently at line 386. The "Source documents deleted" toast moves to step 5.
2. **Fetch session_documents** from `atad2_session_documents` for the current `session_id`.
3. **Build `documents_block`** identical to the swarm pattern in [usePrefill.ts:294-303](src/hooks/usePrefill.ts#L294-L303): for each row, download the storage object, read as text, wrap as `<document doc_label="..." category="...">…</document>`, join with `\n\n`. Skip rows whose download fails (best-effort). If zero docs end up in the block, send `documents_block: ""` (empty string, not undefined) so the n8n branch handles "no docs" cleanly.
4. **POST to n8n** with the existing fields plus `documents_block` (+ optionally `documents_count` for telemetry). Existing 10-min `AbortController` timeout preserved.
5. **On 200 OK:** call `cleanupDocs.mutateAsync()` and toast "Source documents deleted" if any were removed. Then refresh the reports query (existing logic).
6. **On error path:** docs are NOT deleted, so the user can retry without re-uploading.

Reuse the storage-fetch pattern from `useStartAnalyze` verbatim — extract a small helper `buildDocumentsBlock(sessionId)` in a new file `src/lib/prefill/buildDocumentsBlock.ts` so both call-sites (swarm + memo) use it. Tiny refactor, but it locks the format.

### n8n side

**File:** the n8n flow JSON (the user provided it inline; will need to be updated in the n8n UI by the user).

Three changes to the `Build prompt + metrics` node's JS code:

1. **Read `documents_block`** from the webhook body:
   ```js
   const documentsBlock = String(webhookBody.documents_block || "").trim();
   ```
2. **Append to the prompt** just before the "Risk analysis basis" section, gated on non-empty:
   ```js
   ${documentsBlock ? `---
   <u>Background documents</u>

   The following documents were provided by the taxpayer as background context. They are NOT authoritative — the answers in the Risk analysis basis remain the source of truth. Use these documents only to (a) verify or refine the framing of the answers, (b) provide more precise wording for the memorandum where the answers are thin. Do NOT introduce new factual claims that are not also reflected in the answers. Do NOT cite the documents directly in the memo (the memo must read as the advisor's analysis).

   ${documentsBlock}
   ` : ''}
   ```
   This block sits between the existing "Authoritative ATAD2 knowledge base" instructions and "Risk analysis basis", so the order is: research → background docs → answers → additional context.

3. **Add a top-level rule** to the existing rules list near the start of the prompt:
   > "BACKGROUND DOCUMENTS, IF PROVIDED: Treat them as supporting context only. The answers in the Risk analysis basis are authoritative. Do not introduce new factual claims from the documents that are not also reflected in the answers."

No other n8n node changes. The webhook accepts arbitrary body keys, so no validation node update needed. The existing `Validate input` IF node (`session_id` non-empty) still works.

---

## Files modified

| File | Change |
|---|---|
| [src/pages/AssessmentReport.tsx](src/pages/AssessmentReport.tsx) | Reorder: build docs → POST → cleanup. New `documents_block` POST field. |
| [src/lib/prefill/buildDocumentsBlock.ts](src/lib/prefill/buildDocumentsBlock.ts) (new) | Shared helper. Identical doc-block format used by swarm + memo. |
| [src/hooks/usePrefill.ts](src/hooks/usePrefill.ts) | `useStartAnalyze` switches to the new helper (no behavior change). |
| n8n flow `Build prompt + metrics` node | Read `documents_block` from body; append `<u>Background documents</u>` section + add the BACKGROUND DOCUMENTS rule. Manual update in n8n UI. |

No DB migration. No edge-function change. No prompt change to the swarm.

---

## Out of scope

- Vector-store lookup over the uploaded docs (would let the AI Agent pull only relevant passages instead of the whole text). Future iteration if memos get too long or tokens get expensive.
- Storing the docs forever as audit trail (Q2 chose A — wipe after success).
- Token-budget guard: if 49 answers + 200 KB of docs exceed 200k tokens we'd see Anthropic errors. Opus 4.7 has 200k context, so realistic.
- Compression / OCR for image-only PDFs (already a problem in upload path, not made worse here).

---

## Verification

After implementation, walk through:

1. **Happy path with docs.** Upload 2 PDFs → complete a full assessment → click Generate Memorandum. Network tab: POST to n8n includes `documents_block` ≥ ~10 KB. Memo arrives, narrative reads tighter on facts that were in the docs.
2. **Cleanup after success.** After the 200 OK, the docs are gone from `atad2_session_documents` and Storage. Toast "Source documents deleted" fires.
3. **Cleanup is skipped on error.** Force a 500 from n8n (or kill its container mid-run). Docs remain. User can click Generate again with the same docs.
4. **No docs uploaded.** Skip the upload step entirely → finish → generate memo. Network tab shows `documents_block: ""`. n8n flow renders the prompt without the Background documents section. Memo still works on answers alone (today's behavior preserved).
5. **DB sanity.** `SELECT count(*) FROM atad2_session_documents WHERE session_id = '…';` is 0 after a successful memo gen, > 0 after a failed one.
6. **Prompt sanity.** Pull the n8n execution log on a successful run and verify the prompt sent to Claude contains the `<u>Background documents</u>` section with `<document doc_label="...">…</document>` entries inside.
