# Document Pre-Fill iteration 6 — auto-upload, suggestion gates auto-advance, leaner sidebar

**Date:** 2026-05-03
**Branch:** `feat/document-prefill`
**Builds on:** iter 5 (single-surface card) — commits `aca4cea` … `6020977`

---

## Context

Three concrete pain-points after iter 5 testing:

1. **Auto-advance + AI suggestion = silent answer.** When the AI pre-selects an answer (`Suggested (82%)`) on a question whose option has `requires_explanation = false`, the page auto-advances and the user never sees the AI's rationale. The whole point of the pre-select was to flag that an AI made a call — the user has to be able to confirm it.
2. **Upload step blocks on metadata.** The current uploader requires the user to pick a category and type ≥30 chars of relevance note before the file uploads. The browser is sitting idle while the user types. We can upload + extract text in the background and let metadata catch up.
3. **Sidebar pill clutter.** The "ATAD2 progress" header shows up to four lines: "X questions answered" / "Analyzing documents · X / N questions ready" / "X pre-fill suggestions available" / "Uploaded documents (N)" button. The user wants only the first and third lines. Drop the analyzing pill and the documents button.

Iter 4's `hasPrefill` plumbing into `usePanelController` is **kept as-is** — it correctly opens the toelichting panel when a prefill exists, even on `requires_explanation = false`. Iter 6 only adds a separate, lighter rationale surface for the case where `requires_explanation = false` AND no prefill (zone 3 surface) is appropriate.

---

## Approach

### Section 1 — Rationale strip + auto-advance gate

**Two coupled changes in `Assessment.tsx`.**

**1a. Auto-advance gate.** The `canAutoAdvance(...)` helper currently looks at the answer-option's `auto_advance` field. Add a second condition: when `currentPrefill?.suggested_answer && (currentPrefill.confidence_pct ?? 0) >= 40`, return `false`. The user must always click Continue when the AI made a call — for every such question, regardless of `requires_explanation`.

This applies to both the regular flow (`navigationIndex === -1`) and the pre-select effect: if the auto-select effect (introduced iter 4) fires `handleAnswerSelect(option)` programmatically, the same `canAutoAdvance` check must gate the follow-up navigation.

**1b. Rationale strip.** When a question has a suggestion (`suggested_answer` + `confidence_pct >= 40`) **AND** `selectedQuestionOption?.requires_explanation === false` **AND** the answer matches the suggested answer, render a single-line strip directly under the answer-row:

```tsx
{currentPrefill?.suggested_answer
  && option.answer_option.toLowerCase() === currentPrefill.suggested_answer
  && (currentPrefill.confidence_pct ?? 0) >= 40
  && !selectedQuestionOption?.requires_explanation
  && selectedAnswer === option.answer_option && (
  <div className="text-xs italic text-muted-foreground mt-3 ml-1">
    AI rationale: {currentPrefill.answer_rationale ?? "no rationale provided"}
  </div>
)}
```

Where exactly: directly **below** the answer-row container, **above** the existing `QuestionExplanationInline` component. Single line, italic, no card chrome. If the rationale is long, no Show-more truncation — just word-wrap.

**Effect:**
- `requires_explanation = false` + suggestion exists → in-button badge `Suggested (82%)` AND inline rationale strip below buttons AND no auto-advance. User sees why, clicks Continue.
- `requires_explanation = true` + suggestion exists → existing zone-3 SuggestionCard (built iter 5) inside grey panel handles rationale + textarea. No duplicate strip.
- `requires_explanation = false` + no suggestion → unchanged. Auto-advance still works.
- `requires_explanation = true` + no suggestion → unchanged. Standard textarea.

**Continue-button visibility:** the existing `shouldShowContextPanel && selectedAnswer && !shouldShowFinishButton` condition (around line 2140 in Assessment.tsx) only renders Continue when the panel is visible. We need to also render Continue when `currentPrefill?.suggested_answer && confidence_pct >= 40 && !requires_explanation`. Extend the conditional.

### Section 2 — Auto-upload on drop, metadata catches up

**File:** `src/components/prefill/DocumentUploader.tsx` and `src/hooks/usePrefill.ts`.

**Current flow:** drop → status `idle` → user picks category → user types ≥30 chars relevance note → user clicks Upload → upload + extract + DB-row.

**New flow (option B from brainstorm):**

- **On drop:** immediately status `uploading`, kick the existing `useUploadDocument` mutation **with empty metadata** (`category = null`, `relevance_note = null`). The mutation does PDF/DOCX text extraction in the browser, uploads to Storage, and inserts the DB row.
- **DB nullable:** confirm `atad2_session_documents.category` and `relevance_note` are nullable today (they are — verified iter 3). Already-nullable, no migration.
- **Edit-after-upload:** once status flips to `uploaded`, the row keeps its category Select + relevance-note Input editable. New mutation `useUpdateDocumentMetadata` (replaces the existing `useUpdateDocumentCategory`) writes both fields with one debounced PATCH.
- **Continue-gate:** the AssessmentUpload page's Continue button kicks the swarm. The swarm orchestrator (`useStartAnalyze`) reads category + relevance_note as they are at swarm-start time. Empty values are fine — the prompt simply omits the attribute (existing logic already does `relevance_note ? ` relevance_note="${...}"` : ""`).
- **Optional safety nudge:** if the user clicks Continue while any document still has empty `category`, show a confirmation dialog: "X documents are missing a category. Continue anyway?" Yes/Cancel. Don't block — just nudge.

**Concrete UI changes in `DocumentUploader.tsx`:**
- Remove the per-row "Upload" button and the `kickUpload` explicit-trigger model (added in iter 4).
- Drop incomes pump straight into the upload mutation in the `onDrop` / file-add handler.
- Per-row UI sequence becomes: filename (read-only) → status indicator → category Select (pre-fill `null`) → relevance-note Input (pre-fill `""`).
- Disable category Select + relevance Input only when status === `uploading` to prevent collisions during the brief upload window. After `uploaded`, both become editable.
- Drop the `RELEVANCE_NOTE_MIN_LENGTH = 30` rule from the UI. The model handles empty notes gracefully.
- Keep the per-row delete button.

**Why metadata still matters:** the swarm-prompt uses `category` and `relevance_note` to focus the model. Empty is fine — but a tagged doc gets better suggestions. The UX just doesn't *force* tagging before upload starts.

### Section 3 — Sidebar header cleanup

**File:** `src/components/AssessmentSidebar.tsx`

Drop:
1. The `pillContent` block when `job.status === "stage2_running"` (the "Analyzing documents · X / N questions ready" line). Keep `failed` pill so users see analysis errors. **Drop completed pill too** — the existing "X pre-fill suggestions available" line already communicates the success state.
2. The "Uploaded documents (N)" button + its modal. Remove the import of `UploadedDocumentsModal`. The component file `src/components/prefill/UploadedDocumentsModal.tsx` becomes dead code — delete the file.

Keep:
- `{totalAnswered} questions answered` — unchanged.
- `{activeSuggestions} pre-fill suggestion{s} available` — unchanged. Already only renders when `prefills.length > 0`, so during analyze (zero prefills yet) the line is naturally hidden. Matches "option A" from brainstorm.

Failed-state retained (small amber pill) so the user knows analysis silently broke.

---

## Files to modify

| File | Change |
|---|---|
| [src/pages/Assessment.tsx](src/pages/Assessment.tsx) | Add rationale-strip render under answer-row when suggestion + `!requires_explanation`. Extend `canAutoAdvance(...)` to return false when a ≥40% suggestion exists. Extend Continue-button render condition for the same case. |
| [src/components/prefill/DocumentUploader.tsx](src/components/prefill/DocumentUploader.tsx) | Drop explicit Upload button. Drop `RELEVANCE_NOTE_MIN_LENGTH` gate. Auto-fire upload mutation on drop. Make category + note editable post-upload. |
| [src/hooks/usePrefill.ts](src/hooks/usePrefill.ts) | New `useUpdateDocumentMetadata({ docId, category, relevanceNote })` (or extend existing `useUpdateDocumentCategory` to accept `relevanceNote` as well — same migration of caller wiring). |
| [src/components/AssessmentSidebar.tsx](src/components/AssessmentSidebar.tsx) | Drop the `stage2_running` and `completed` pill cases. Drop the "Uploaded documents (N)" button + modal mount. Drop the `useSessionDocuments` import if no longer needed. Keep `failed` pill. |
| [src/components/prefill/UploadedDocumentsModal.tsx](src/components/prefill/UploadedDocumentsModal.tsx) | Delete file. |
| [src/pages/AssessmentUpload.tsx](src/pages/AssessmentUpload.tsx) | Optional: when Continue is clicked and ≥1 doc has `category === null`, show a confirm dialog "X documents missing a category — continue anyway?" before kicking the swarm. |

No DB migration. No edge-function change. No prompt change.

---

## Out of scope

- Re-running analysis after metadata edits (would 2× Anthropic costs — option A from brainstorm, explicitly rejected).
- Real-time tagging suggestions ("we think this PDF is a `memo`").
- Cross-document deduplication.
- Changing the 40% confidence threshold for pre-select.

---

## Verification

Hard-refresh and walk through:

1. **Auto-upload.** New session → drop a PDF. Within 1-2s the row shows "uploaded" status. Category Select is empty, relevance Input is empty, both editable. Type the metadata after the fact — saves on blur.
2. **Continue without metadata.** Drop a PDF, immediately click Continue (don't tag). Confirm dialog appears: "1 document is missing a category. Continue anyway?" Click Yes → wait page renders, swarm starts, suggestions arrive (slightly less targeted but valid).
3. **Auto-advance gated.** On a question whose `requires_explanation = false` for "No" answer AND the AI suggested "No" with ≥40% — page does NOT auto-advance. Inline italic line appears below the answer-row: "AI rationale: …". User clicks Continue → next question.
4. **Auto-advance unchanged.** On a question whose `requires_explanation = false` for the answer AND no AI suggestion — page auto-advances as before. No rationale strip.
5. **Sidebar.** During analysis the "Analyzing documents · X / N questions ready" pill is GONE. The "Uploaded documents (N)" button is GONE. Once the first prefill arrives, the existing line "1 pre-fill suggestion available" appears and ticks up. After all done: "44 pre-fill suggestions available" — no extra pill.
6. **Failed analysis still surfaces.** Force a swarm failure (e.g., kill the edge function during run) → sidebar shows the small amber "Analysis failed — continuing without suggestions" pill.
7. **No 400s.** Network tab during upload: zero requests with `action: "summarize"` (still gone from iter 5).
8. **`requires_explanation = true` path.** Pick "Yes" on a question that requires explanation + has a prefill → existing zone-3 SuggestionCard renders inside the grey panel, no duplicate rationale strip below the answer-row.
9. **DB sanity.** `SELECT category, relevance_note, created_at FROM atad2_session_documents WHERE session_id = '…' ORDER BY created_at;` — rows for files dropped first appear with `null` category, then update once user tags.
