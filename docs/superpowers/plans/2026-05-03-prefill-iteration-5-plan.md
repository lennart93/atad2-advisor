# Prefill iteration 5 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-surface per-question presentation in `/assessment` that consolidates the suggestion, the answer-row badge, and the empty-state line; remove the legacy `summarize` 400 noise.

**Architecture:** All work is on the React side except a two-block delete in `usePrefill.ts`. The `SuggestionCard` component is rewritten into a single surface that doubles as the toelichting input (read → edit-in-place → committed). The above-radios likelihood caption is removed; likelihood moves into the in-button badge as `Suggested (NN%)`. The empty-state line ("No relevant context found…") is gated on `prefillJob.status === 'completed'` AND ≥1 uploaded document AND no prefill for the question.

**Tech Stack:** React 18, TypeScript, Tailwind, shadcn/ui, Zustand, React Query, Supabase Realtime.

**Branch:** `feat/document-prefill` (no new branch).

---

## File structure

| File | Responsibility |
|---|---|
| `src/components/prefill/SuggestionCard.tsx` | Single-surface zone-3 component. Read view + in-place Edit textarea + Accept/Edit/Dismiss/Save/Cancel actions. Renders `AI suggestion · {labels}` header, body, optional rationale line. Same filename, full rewrite. |
| `src/pages/Assessment.tsx` | Drop the above-radios likelihood caption. Update in-button badge to `Suggested ({pct}%)`. Update empty-state copy + render condition (`docsCount > 0` AND `job.status === 'completed'` AND no prefill). |
| `src/components/EditableAnswer.tsx` | Same in-button badge update on report-edit path. Drop the above-radios `Likelihood …` line for symmetry. |
| `src/hooks/usePrefill.ts` | Remove the `invokePrefillFn({ action: "summarize", ... })` calls in `useUploadDocument` and `useUploadText`. |

No DB migration. No edge-function change. No prompt change.

---

## Task 1 — Remove legacy `summarize` calls

**Files:**
- Modify: `src/hooks/usePrefill.ts:201-204` (in `useUploadDocument`)
- Modify: `src/hooks/usePrefill.ts:263-266` (in `useUploadText`)

- [ ] **Step 1: Read the file once before editing**

```bash
# Already read in this session — no action needed; the Edit tool will accept edits.
```

- [ ] **Step 2: Remove the summarize call from `useUploadDocument`**

In `src/hooks/usePrefill.ts`, find this block:

```ts
      console.log("[upload-document] step: invoke summarize (fire-and-forget)", { docId });
      invokePrefillFn({ action: "summarize", session_id: sessionId, document_id: docId })
        .catch((e) => console.error("[upload-document] summarize failed", e));

      console.log("[upload-document] done", { docId });
```

Replace with:

```ts
      console.log("[upload-document] done", { docId });
```

- [ ] **Step 3: Remove the summarize call from `useUploadText`**

In `src/hooks/usePrefill.ts`, find this block:

```ts
      console.log("[upload-text] step: invoke summarize (fire-and-forget)", { docId });
      invokePrefillFn({ action: "summarize", session_id: sessionId, document_id: docId })
        .catch((e) => console.error("[upload-text] summarize failed", e));

      console.log("[upload-text] done", { docId });
```

Replace with:

```ts
      console.log("[upload-text] done", { docId });
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
npm run build
```
Expected: build succeeds with no new TS errors. (Pre-existing warnings are fine.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePrefill.ts
git commit -m "fix(prefill): remove legacy summarize action calls

The summarize action was removed from prefill-documents in iter 3 but
useUploadDocument/useUploadText still fired fire-and-forget calls to it,
producing 400 noise in the network log on every upload."
```

---

## Task 2 — Rewrite `SuggestionCard` as a single-surface zone-3 component

**Files:**
- Modify (full rewrite): `src/components/prefill/SuggestionCard.tsx`

- [ ] **Step 1: Read the file**

The current file is 93 lines (already read this session). It exports `SuggestionCard({ prefill, currentToelichting, onCommit, onDismissToAdditionalContext })` and renders a left-bordered inline panel with read/edit modes. Keep the component name and props, expand the surface.

- [ ] **Step 2: Replace the file contents in full**

Write to `src/components/prefill/SuggestionCard.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionPrefill } from "@/lib/prefill/types";
import { useUpdatePrefillAction } from "@/hooks/usePrefill";

interface Props {
  prefill: QuestionPrefill;
  currentToelichting: string;
  onCommit: (newValue: string) => void;
  onDismissToAdditionalContext?: (text: string) => void;
}

const MAX_RATIONALE_INLINE = 140;

export function SuggestionCard({
  prefill,
  currentToelichting,
  onCommit,
  onDismissToAdditionalContext,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(prefill.suggested_toelichting);
  const [showFullRationale, setShowFullRationale] = useState(false);
  const [dismissedLocally, setDismissedLocally] = useState(false);
  const updateAction = useUpdatePrefillAction();

  if (
    dismissedLocally ||
    prefill.user_action === "accepted" ||
    prefill.user_action === "edited" ||
    prefill.user_action === "dismissed" ||
    prefill.user_action === "moved_to_additional_context"
  ) {
    return null;
  }

  const appendToCurrent = (text: string) =>
    currentToelichting.trim().length === 0 ? text : `${currentToelichting}\n\n${text}`;

  const accept = () => {
    onCommit(appendToCurrent(prefill.suggested_toelichting));
    updateAction.mutate({ prefillId: prefill.id, action: "accepted" });
    setDismissedLocally(true);
  };

  const commitEdit = () => {
    onCommit(appendToCurrent(draft));
    updateAction.mutate({ prefillId: prefill.id, action: "edited" });
    setEditMode(false);
    setDismissedLocally(true);
  };

  const dismiss = (moveToAdditional: boolean) => {
    if (moveToAdditional && onDismissToAdditionalContext) {
      onDismissToAdditionalContext(prefill.suggested_toelichting);
      updateAction.mutate({ prefillId: prefill.id, action: "moved_to_additional_context" });
    } else {
      updateAction.mutate({ prefillId: prefill.id, action: "dismissed" });
    }
    setDismissedLocally(true);
  };

  const labels = (prefill.source_refs ?? []).map((r) => r.doc_label).filter(Boolean);
  const headerLabels =
    labels.length === 0
      ? ""
      : labels.length <= 2
        ? labels.join(", ")
        : `${labels.slice(0, 2).join(", ")} +${labels.length - 2} more`;

  const rationale = prefill.answer_rationale ?? "";
  const rationaleNeedsToggle = rationale.length > MAX_RATIONALE_INLINE;
  const rationaleVisible = rationaleNeedsToggle && !showFullRationale
    ? `${rationale.slice(0, MAX_RATIONALE_INLINE).trimEnd()}…`
    : rationale;

  return (
    <div className="border-l-2 border-primary/40 bg-primary/5 pl-3 py-2 my-2 text-sm space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        AI suggestion{headerLabels ? ` · ${headerLabels}` : ""}
      </div>

      {rationale && (
        <div className="text-xs text-muted-foreground italic">
          {rationaleVisible}
          {rationaleNeedsToggle && (
            <button
              type="button"
              className="ml-1 underline underline-offset-2 hover:text-foreground"
              onClick={() => setShowFullRationale((v) => !v)}
            >
              {showFullRationale ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {!editMode ? (
        <p className="whitespace-pre-wrap">{prefill.suggested_toelichting}</p>
      ) : (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          className="bg-background"
        />
      )}

      <div className="flex gap-2 pt-1">
        {!editMode ? (
          <>
            <Button size="sm" onClick={accept}>Accept</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(prefill.suggested_toelichting);
                setEditMode(true);
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss(false)}>Dismiss</Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={commitEdit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/prefill/SuggestionCard.tsx
git commit -m "feat(prefill): single-surface SuggestionCard with rationale + show more

The suggestion now carries the rationale inline (with a Show more
toggle for long ones), so the assessment page can drop the duplicate
caption above the answer row."
```

---

## Task 3 — Drop above-radios caption + update in-button badge to `Suggested ({pct}%)`

**Files:**
- Modify: `src/pages/Assessment.tsx:1909-1914` (delete the caption block)
- Modify: `src/pages/Assessment.tsx:1981-1987` (update the badge text)

- [ ] **Step 1: Delete the above-radios caption**

In `src/pages/Assessment.tsx`, remove this block:

```tsx
                   {currentPrefill?.suggested_answer && (currentPrefill.confidence_pct ?? 0) >= 40 && (
                     <div className="text-xs text-muted-foreground mb-2">
                       Likelihood {currentPrefill.confidence_pct}%
                       {currentPrefill.answer_rationale ? ` · ${currentPrefill.answer_rationale}` : ""}
                     </div>
                   )}

```

(Delete the whole 6-line block including the trailing blank line.)

- [ ] **Step 2: Update the in-button badge**

In the answer-button render, change:

```tsx
                               {currentPrefill?.suggested_answer
                                 && option.answer_option.toLowerCase() === currentPrefill.suggested_answer
                                 && (currentPrefill.confidence_pct ?? 0) >= 40 && (
                                 <span className="ml-2 text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                   Suggested
                                 </span>
                               )}
```

To:

```tsx
                               {currentPrefill?.suggested_answer
                                 && option.answer_option.toLowerCase() === currentPrefill.suggested_answer
                                 && (currentPrefill.confidence_pct ?? 0) >= 40 && (
                                 <span className="ml-2 text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                   Suggested ({currentPrefill.confidence_pct}%)
                                 </span>
                               )}
```

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(prefill): inline 'Suggested (NN%)' badge, drop separate caption

Likelihood now lives inside the matching answer button. The full
rationale is shown inline by SuggestionCard (zone 3), so we no longer
need the duplicate caption above the radios."
```

---

## Task 4 — Tighten empty-state copy + render condition

**Files:**
- Modify: `src/pages/Assessment.tsx:2042-2046`

- [ ] **Step 1: Confirm `useSessionDocuments` is already imported**

Check the existing imports at the top of `Assessment.tsx`:

```bash
grep -n "useSessionDocuments\|useAllPrefills\|usePrefillJob" src/pages/Assessment.tsx
```

Expected: `usePrefillJob` is already imported at line ~33. If `useSessionDocuments` is NOT imported, add it to the existing `import { ... } from "@/hooks/usePrefill"` line.

- [ ] **Step 2: Add docs count near the existing prefill hooks**

In `src/pages/Assessment.tsx`, near the existing `usePrefillJob`/`useQuestionPrefill` calls (around line 250), add:

```tsx
  const { data: sessionDocuments } = useSessionDocuments(sessionId || null);
  const docsCount = sessionDocuments?.length ?? 0;
```

If a `sessionDocuments`/`docsCount` already exists for another reason, reuse it.

- [ ] **Step 3: Update the empty-state render block**

Find:

```tsx
                              {prefillJob?.status === "completed" && !currentPrefill && (
                                <div className="text-xs text-muted-foreground italic mb-3">
                                  No relevant context found in your uploaded documents for this question.
                                </div>
                              )}
```

Replace with:

```tsx
                              {prefillJob?.status === "completed" && !currentPrefill && docsCount > 0 && (
                                <div className="text-xs italic text-muted-foreground mt-3 ml-1">
                                  No relevant context found in the uploaded documents for this question.
                                </div>
                              )}
```

(Changes: gate on `docsCount > 0`, slightly tweaked copy to match spec, and tightened margins.)

- [ ] **Step 4: Verify build**

Run:
```bash
npm run build
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(prefill): empty-state line gated on docs uploaded

Only show 'No relevant context found' when the user actually uploaded
≥1 document and analysis completed. Avoids stating the obvious on the
no-docs path."
```

---

## Task 5 — Same in-button badge update on `EditableAnswer.tsx`

**Files:**
- Modify: `src/components/EditableAnswer.tsx:291-294` (drop above-radios caption)
- Modify: `src/components/EditableAnswer.tsx:317-320` (update badge text)

- [ ] **Step 1: Read the file**

Read `src/components/EditableAnswer.tsx` to see the exact current state of the caption + badge block.

- [ ] **Step 2: Drop the above-radios caption (lines ~291-295)**

Find:

```tsx
        {prefill && isEditing && prefill.suggested_answer && (prefill.confidence_pct ?? 0) >= 40 && (
          <div className="text-xs text-muted-foreground mb-2">
            Likelihood {prefill.confidence_pct}%
            {prefill.answer_rationale ? ` · ${prefill.answer_rationale}` : ""}
          </div>
        )}
```

Delete the entire block (the SuggestionCard rendered below already shows the rationale inline).

- [ ] **Step 3: Update the in-button badge text**

Find:

```tsx
                    {isSuggested && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        Suggested
                      </span>
                    )}
```

Change the inner text to:

```tsx
                    {isSuggested && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        Suggested ({prefill?.confidence_pct ?? 0}%)
                      </span>
                    )}
```

- [ ] **Step 4: Verify build**

Run:
```bash
npm run build
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/EditableAnswer.tsx
git commit -m "feat(prefill): same Suggested (NN%) badge on report-page edit

Mirrors the assessment-page change so re-edit on the report shows the
same single-surface presentation."
```

---

## Verification

After all tasks land, run the dev server (`npm run dev`) and walk through:

1. **No 400s on upload.** New session → upload one PDF. Network tab: zero requests with `action: "summarize"`. The swarm starts via `analyze_one`.
2. **Single-surface render.** Pick an answer on a question with a prefill. Under the radios you see ONE panel with header `AI suggestion · {labels}`, italic rationale below, body, three buttons (Accept/Edit/Dismiss). No separate caption above.
3. **In-button badge.** Matching answer button reads `Suggested (82%)` (or whatever the model returned).
4. **Accept flow.** Click Accept → text inserted into the answer's `explanation`, surface gone.
5. **Edit flow.** Click Edit → body becomes a textarea pre-filled with the suggestion. Modify, Save → text inserted, surface gone.
6. **Dismiss flow.** Click Dismiss → surface gone; if `requires_explanation = true`, the standard textarea takes the slot.
7. **Empty state.** On a question with no prefill, after analysis completed and ≥1 doc uploaded → italic muted line "No relevant context found in the uploaded documents for this question."
8. **No-docs path.** A session with zero docs → empty-state line never renders; legacy textarea path unchanged.
9. **`requires_explanation = false` + prefill.** Pick "No" on a question whose schema says no toelichting needed but a prefill exists → zone 3 surface still appears.
10. **DB sanity.** `SELECT user_action, count(*) FROM atad2_question_prefills GROUP BY user_action;` → `accepted` / `edited` / `dismissed` counts roll up as expected.

---

## Self-review

- ✅ Spec coverage: legacy summarize bug (Task 1) ↔ Section 3; single-surface (Task 2) ↔ Section 1; in-button badge + caption removal (Task 3, 5) ↔ Section 2; empty-state (Task 4) ↔ Section 4. `hasPrefill` flow per Section 4a is captured as an invariant — no implementation task because it's already correct.
- ✅ No placeholders: every step has the actual code or command.
- ✅ Type consistency: `SuggestionCard` keeps the same prop signature (`prefill`, `currentToelichting`, `onCommit`, `onDismissToAdditionalContext`); call sites in `Assessment.tsx` and `EditableAnswer.tsx` are unchanged.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-prefill-iteration-5-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
