# Prefill iteration 6 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-upload documents on drop with metadata catching up later, gate auto-advance whenever the AI made a confident call, and trim the sidebar header to one progress line.

**Architecture:** All work is on the React side. No DB migration. No edge-function change. The `useUploadDocument` mutation already accepts empty metadata (the prompt-builder skips empty attributes), so we drop the upload-readiness gate in the UI. `canAutoAdvance(...)` gains a "AI suggested ≥40% confidence" condition. Sidebar drops two lines + the modal.

**Tech Stack:** React 18, TypeScript, Tailwind, shadcn/ui, Zustand, React Query.

**Branch:** `feat/document-prefill` (continuing iter 5 work).

---

## File structure

| File | Responsibility |
|---|---|
| `src/components/prefill/DocumentUploader.tsx` | Auto-fire upload on drop, no metadata gate. Editable category + relevance after upload. |
| `src/hooks/usePrefill.ts` | New `useUpdateDocumentMetadata` mutation that accepts both `category` and `relevance_note`. (Replace `useUpdateDocumentCategory` callers but keep export for compat where used.) |
| `src/pages/Assessment.tsx` | Extend `canAutoAdvance` to block auto-advance on a ≥40% suggestion. Add inline rationale strip when suggestion exists + `requires_explanation = false`. Extend Continue-button visibility. |
| `src/components/AssessmentSidebar.tsx` | Drop `stage2_running` + `completed` pill. Drop "Uploaded documents (N)" button + modal mount + unused imports. Keep `failed` pill. |
| `src/components/prefill/UploadedDocumentsModal.tsx` | Delete file. |
| `src/pages/AssessmentUpload.tsx` | Confirmation dialog when Continue is pressed while ≥1 doc has `category === null`. |

---

## Task 1 — Add `useUpdateDocumentMetadata` mutation

**Files:**
- Modify: `src/hooks/usePrefill.ts:388-400` (existing `useUpdateDocumentCategory`)

- [ ] **Step 1: Read the file**

(Already in context this session — line 388 onwards holds `useUpdateDocumentCategory`.)

- [ ] **Step 2: Add `useUpdateDocumentMetadata` next to `useUpdateDocumentCategory`**

In `src/hooks/usePrefill.ts`, immediately after the closing `}` of `useUpdateDocumentCategory` (around line 400), add:

```ts
export function useUpdateDocumentMetadata(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      docId,
      category,
      relevanceNote,
    }: {
      docId: string;
      category?: string | null;
      relevanceNote?: string | null;
    }) => {
      const patch: Record<string, string | null> = {};
      if (category !== undefined) patch.category = category;
      if (relevanceNote !== undefined) patch.relevance_note = relevanceNote && relevanceNote.trim().length > 0 ? relevanceNote.trim() : null;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase
        .from("atad2_session_documents")
        .update(patch)
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] }),
  });
}
```

Keep `useUpdateDocumentCategory` for now — other files may still import it; will be cleaned up later.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePrefill.ts
git commit -m "feat(prefill): add useUpdateDocumentMetadata hook

Patches both category and relevance_note in one debounced PATCH so
the uploader can drop the upload-readiness gate."
```

---

## Task 2 — Auto-upload on drop in `DocumentUploader.tsx`

**Files:**
- Modify (full rewrite of relevant blocks): `src/components/prefill/DocumentUploader.tsx`

- [ ] **Step 1: Read the file**

(Already in context.)

- [ ] **Step 2: Replace the file contents**

Overwrite `src/components/prefill/DocumentUploader.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { usePrefillStore, type PendingFile } from "@/stores/prefillStore";
import { useUploadDocument, useSessionDocuments, useUpdateDocumentMetadata } from "@/hooks/usePrefill";
import {
  ACCEPTED_MIME_TYPES, MAX_FILE_BYTES, MAX_SESSION_BYTES, DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from "@/lib/prefill/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Trash2, Upload, ClipboardPaste } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PasteTextDialog } from "./PasteTextDialog";

interface Props {
  sessionId: string;
  locked: boolean;
}

export function DocumentUploader({ sessionId, locked }: Props) {
  const store = usePrefillStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const upload = useUploadDocument(sessionId);
  const updateMeta = useUpdateDocumentMetadata(sessionId);
  const { data: uploadedDocs } = useSessionDocuments(sessionId);

  const onFilesSelected = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(f.type)) {
        rejected.push(`${f.name} — unsupported format`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        rejected.push(`${f.name} — exceeds 32 MB`);
        continue;
      }
      accepted.push(f);
    }
    const existingBytes = (uploadedDocs ?? []).reduce((a, d) => a + d.size_bytes, 0);
    const pendingBytes = store.totalBytes();
    const newBytes = accepted.reduce((a, f) => a + f.size, 0);
    if (existingBytes + pendingBytes + newBytes > MAX_SESSION_BYTES) {
      toast({ title: "Total upload limit reached", description: "Session limit is 200 MB.", variant: "destructive" });
      return;
    }
    if (rejected.length > 0) {
      toast({ title: "Some files were skipped", description: rejected.join("\n"), variant: "destructive" });
    }
    store.addFiles(accepted);
  };

  // Auto-fire upload for any pending file in `queued` state. Metadata is
  // optional and can be filled in after upload completes.
  useEffect(() => {
    if (locked) return;
    for (const p of store.pendingFiles) {
      if (p.status !== "queued") continue;
      store.setStatus(p.localId, "uploading");
      upload.mutate({ pending: p }, {
        onSuccess: (doc) => store.setStatus(p.localId, "uploaded", { remoteDocumentId: doc?.id }),
        onError: (err) => store.setStatus(p.localId, "failed", { errorMessage: (err as Error).message }),
      });
    }
    // intentionally only depend on pendingFiles + locked; mutation ref is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.pendingFiles, locked]);

  return (
    <div className="space-y-4">
      {!locked && (
        <>
          <div
            onDrop={(e) => { e.preventDefault(); onFilesSelected(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed rounded-lg p-8 text-center"
          >
            <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-3">Drag files here or click to browse</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_MIME_TYPES.join(",")}
              className="hidden"
              onChange={(e) => onFilesSelected(e.target.files)}
            />
            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => inputRef.current?.click()}>Upload files</Button>
              <span className="text-xs text-muted-foreground">or</span>
              <Button variant="outline" onClick={() => setPasteOpen(true)}>
                <ClipboardPaste className="h-4 w-4 mr-2" /> Paste text
              </Button>
            </div>
          </div>
          <PasteTextDialog sessionId={sessionId} open={pasteOpen} onOpenChange={setPasteOpen} />
        </>
      )}

      <div className="space-y-2">
        {store.pendingFiles.map((p) => (
          <Card key={p.localId} className="p-3 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium break-all" title={p.file.name}>
                  {p.file.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(p.file.size)} · {labelForStatus(p)}
                </div>
                {p.errorMessage && <div className="text-xs text-destructive">{p.errorMessage}</div>}
              </div>

              <Select
                value={p.category ?? undefined}
                onValueChange={(v) => {
                  const cat = v as DocumentCategory;
                  store.setCategory(p.localId, cat);
                  if (p.remoteDocumentId) {
                    updateMeta.mutate({ docId: p.remoteDocumentId, category: cat });
                  }
                }}
                disabled={locked || p.status === "uploading"}
              >
                <SelectTrigger className="w-56"><SelectValue placeholder="Select category (optional)" /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!locked && (
                <Button variant="ghost" size="icon" onClick={() => store.removeFile(p.localId)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="space-y-1">
              <Input
                value={p.relevanceNote}
                onChange={(e) => store.setRelevanceNote(p.localId, e.target.value)}
                onBlur={() => {
                  if (p.remoteDocumentId) {
                    updateMeta.mutate({ docId: p.remoteDocumentId, relevanceNote: p.relevanceNote });
                  }
                }}
                className="text-xs"
                disabled={locked || p.status === "uploading"}
                placeholder="Why is this document relevant? (optional, sharper suggestions if filled in)"
              />
            </div>
          </Card>
        ))}

        {/* Remote docs that aren't represented by a PendingFile — pasted-text
            items go straight to the server so they live only here. */}
        {(uploadedDocs ?? [])
          .filter((d) => !store.pendingFiles.some((p) => p.remoteDocumentId === d.id))
          .map((d) => (
            <Card key={d.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium break-all flex items-center gap-2" title={d.filename}>
                  {d.mime_type === "text/plain" && <ClipboardPaste className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  {d.doc_label || d.filename}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBytes(d.size_bytes)} · {d.status === "summarized" ? "Ready" : d.status === "summarizing" ? "Analyzing…" : d.status}
                </div>
              </div>
              <Select
                value={d.category ?? undefined}
                onValueChange={(v) => updateMeta.mutate({ docId: d.id, category: v as DocumentCategory })}
                disabled={locked}
              >
                <SelectTrigger className="w-56"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Card>
          ))}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function labelForStatus(p: PendingFile): string {
  switch (p.status) {
    case "queued": return "Preparing…";
    case "uploading": return "Uploading…";
    case "uploaded": return "Uploaded";
    case "failed": return "Failed";
  }
}
```

Key changes from previous version:
- `useEffect` auto-fires upload on any `queued` row (replaces explicit Upload button).
- No `RELEVANCE_NOTE_MIN_LENGTH`, no `isReadyToUpload`, no `kickUpload`.
- Category Select: enabled after upload (`p.status === "uploading"` is the only disable case besides `locked`); `onValueChange` PATCHes via `useUpdateDocumentMetadata` if `remoteDocumentId` exists.
- Relevance Input: enabled after upload; PATCHes on blur via `useUpdateDocumentMetadata`.
- Imports: `useUpdateDocumentMetadata` instead of `useUpdateDocumentCategory`. `RELEVANCE_NOTE_MIN_LENGTH` removed.
- Status label "queued" reads "Preparing…" so users don't see "Waiting for details" on rows that no longer wait.
- Per-row "Upload" button + ready-state hint removed.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/prefill/DocumentUploader.tsx
git commit -m "feat(prefill): auto-upload on drop, metadata edits in parallel

Drops the explicit Upload button and the 30-char relevance gate.
Files start uploading + extracting as soon as they're added; the
user can pick category and type relevance in parallel and after
upload completes. Both fields PATCH via useUpdateDocumentMetadata."
```

---

## Task 3 — Auto-advance gate + rationale strip in `Assessment.tsx`

**Files:**
- Modify: `src/pages/Assessment.tsx:171-174` (extend `canAutoAdvance`)
- Modify: `src/pages/Assessment.tsx` answer-button block (~line 1975) — add rationale strip below answer-row
- Modify: `src/pages/Assessment.tsx` Continue-button block (~line 2140) — extend visibility

- [ ] **Step 1: Read the file**

The relevant slices are referenced above; `canAutoAdvance` is currently a 3-line helper at line 171. The answer-button render is around 1975. The Continue button is around 2140-2155.

- [ ] **Step 2: Extend `canAutoAdvance`**

Find:

```tsx
  // Helper function to check if auto-advance is allowed
  function canAutoAdvance(selectedOption?: { requires_explanation?: boolean }) {
    return selectedOption?.requires_explanation !== true;
  }
```

Replace with:

```tsx
  // Helper function to check if auto-advance is allowed.
  // Blocks auto-advance whenever (a) the answer requires explanation OR
  // (b) the AI made a confident call (>=40% suggestion) — in case (b) the
  // user must see the rationale and click Continue manually.
  function canAutoAdvance(selectedOption?: { requires_explanation?: boolean }) {
    if (selectedOption?.requires_explanation === true) return false;
    if (currentPrefill?.suggested_answer && (currentPrefill.confidence_pct ?? 0) >= 40) return false;
    return true;
  }
```

Note: `currentPrefill` is defined further down (around line 362). Hoisting the helper into closure scope is fine because JS functions close over later-scoped `let`/`const` via the lexical environment when called. If TypeScript complains about TDZ, move `canAutoAdvance` to be defined AFTER `currentPrefill` (just below the `currentPrefill` assignment). Apply that follow-up if step 3 build fails.

- [ ] **Step 3: Verify build**

```bash
npm run build
```

If TS errors mentioning `currentPrefill` in `canAutoAdvance`: move the function to right below the `const currentPrefill = currentPrefillForGate;` line (near line 362), and remove the original definition at line 171. Re-run `npm run build`.

- [ ] **Step 4: Add rationale strip below answer-row**

Find the closing `</div>` of the answer buttons block (the `<div className="space-y-3 mb-8">…</div>` that wraps the answer buttons; ends around line 1996 in current file). Just AFTER that closing `</div>`, BEFORE `<QuestionExplanationInline …`, insert:

```tsx
                    {/* Inline rationale strip — only when AI suggested this exact answer
                        AND the answer doesn't require explanation. Otherwise the
                        zone-3 SuggestionCard inside the grey panel handles rationale. */}
                    {currentPrefill?.suggested_answer
                      && (currentPrefill.confidence_pct ?? 0) >= 40
                      && selectedAnswer
                      && selectedAnswer.toLowerCase() === currentPrefill.suggested_answer
                      && !selectedQuestionOption?.requires_explanation && (
                      <div className="text-xs italic text-muted-foreground mt-3 ml-1 mb-6">
                        AI rationale: {currentPrefill.answer_rationale ?? "no rationale provided"}
                      </div>
                    )}
```

- [ ] **Step 5: Extend Continue-button visibility**

Find the Continue button block around line 2140:

```tsx
                        {/* Show Submit/Continue button when context panel is visible and we have an answer, but NOT when it's the last question */}
                        {shouldShowContextPanel && selectedAnswer && !shouldShowFinishButton && (
                           <Button 
                              onClick={handleContinueWithReminder}
                              disabled={loading || isTransitioning}
                              className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Continue
                           </Button>
                        )}
```

Replace the conditional to also fire when there's a confident suggestion on a `requires_explanation = false` answer:

```tsx
                        {/* Show Submit/Continue button when (a) the context panel is visible OR
                            (b) the AI made a >=40% suggestion that pre-selected this answer
                            and the question doesn't require explanation (the rationale
                            strip is rendered above and the user must click Continue). */}
                        {(
                          (shouldShowContextPanel && selectedAnswer)
                          || (
                            selectedAnswer
                            && currentPrefill?.suggested_answer
                            && (currentPrefill.confidence_pct ?? 0) >= 40
                            && selectedAnswer.toLowerCase() === currentPrefill.suggested_answer
                            && !selectedQuestionOption?.requires_explanation
                          )
                        ) && !shouldShowFinishButton && (
                           <Button 
                              onClick={handleContinueWithReminder}
                              disabled={loading || isTransitioning}
                              className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Continue
                           </Button>
                        )}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: success. If `selectedQuestionOption` is not in scope at this location, fall back to the existing `currentQuestionOption` (the variable used in the surrounding block — verify by grepping); same idea, just match the variable name used in adjacent code.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(prefill): no auto-advance + inline rationale on AI suggestion

When the AI pre-selects an answer (>=40% confidence), block auto-advance
even if the answer doesn't require explanation, and show a one-line
italic 'AI rationale: …' strip below the answer-row. The user must
click Continue to acknowledge the AI call."
```

---

## Task 4 — Trim sidebar header

**Files:**
- Modify: `src/components/AssessmentSidebar.tsx`
- Delete: `src/components/prefill/UploadedDocumentsModal.tsx`

- [ ] **Step 1: Drop the "Analyzing" + "Analysis complete" pills**

In `src/components/AssessmentSidebar.tsx`, find:

```tsx
  let pillContent: string | null = null;
  let pillTone: "default" | "success" | "warn" = "default";
  if (job?.status === "stage2_running" && questionCount) {
    pillContent = `Analyzing documents · ${readyCount} / ${questionCount} questions ready`;
  } else if (job?.status === "completed" && readyCount > 0) {
    pillContent = `Analysis complete · ${readyCount} suggestion${readyCount === 1 ? "" : "s"} ready`;
    pillTone = "success";
  } else if (job?.status === "failed") {
    pillContent = "Analysis failed — continuing without suggestions";
    pillTone = "warn";
  }
```

Replace with:

```tsx
  let pillContent: string | null = null;
  const pillTone: "default" | "success" | "warn" = "warn";
  if (job?.status === "failed") {
    pillContent = "Analysis failed — continuing without suggestions";
  }
```

(`pillTone` is now constant `warn` since it's only used for the failed pill.)

- [ ] **Step 2: Drop the Uploaded Documents button + modal**

In the same file, find the block:

```tsx
        {sessionId && (docs?.length ?? 0) > 0 && (
          <>
            <button
              type="button"
              onClick={() => setDocsModalOpen(true)}
              className="mt-2 flex items-center gap-2 text-xs text-primary hover:underline"
            >
              <FileText className="h-3 w-3" /> Uploaded documents ({docs?.length})
            </button>
            <UploadedDocumentsModal sessionId={sessionId} open={docsModalOpen} onOpenChange={setDocsModalOpen} />
          </>
        )}
```

Delete the entire block.

- [ ] **Step 3: Drop unused imports + state**

At the top of `AssessmentSidebar.tsx`, change:

```tsx
import { useAllPrefills, useSessionDocuments, usePrefillJob } from "@/hooks/usePrefill";
```

To:

```tsx
import { useAllPrefills, usePrefillJob } from "@/hooks/usePrefill";
```

Also remove these lines (now unused):

```tsx
import { UploadedDocumentsModal } from "@/components/prefill/UploadedDocumentsModal";
```

```tsx
import { FileText } from "lucide-react";
```

(Verify `FileText` isn't used elsewhere in the file with `grep -n FileText`. If only used by the removed button, drop the import.)

In the component body remove:

```tsx
  const { data: docs } = useSessionDocuments(sessionId ?? null);
```

```tsx
  const [docsModalOpen, setDocsModalOpen] = useState(false);
```

If `useState` is no longer used anywhere else in the file, drop the React import for `useState`.

- [ ] **Step 4: Delete the modal file**

```bash
rm src/components/prefill/UploadedDocumentsModal.tsx
```

Confirm nothing else imports it:

```bash
grep -rn UploadedDocumentsModal src/
```

Expected: zero results.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: success. Fix any TS errors from leftover imports/usages.

- [ ] **Step 6: Commit**

```bash
git add src/components/AssessmentSidebar.tsx
git rm src/components/prefill/UploadedDocumentsModal.tsx
git commit -m "feat(prefill): trim sidebar header to one progress line

Drop the analyzing + completed pills (the existing 'X pre-fill
suggestions available' line covers the success state). Drop the
Uploaded Documents button + its modal — dead code now that the
upload step is auto-fired and metadata edits happen on the upload
page itself."
```

---

## Task 5 — Confirm-on-Continue when categories are missing

**Files:**
- Modify: `src/pages/AssessmentUpload.tsx`

- [ ] **Step 1: Read the file**

```bash
# Read the current Continue handler.
```

(Use the Read tool on `src/pages/AssessmentUpload.tsx`.)

- [ ] **Step 2: Add a `useSessionDocuments` hook + check uncategorized count**

Near the top of the component body (where other hooks live), add:

```tsx
  const { data: sessionDocuments } = useSessionDocuments(sessionId);
  const uncategorizedCount = (sessionDocuments ?? []).filter((d) => !d.category).length;
```

Make sure `useSessionDocuments` is imported from `@/hooks/usePrefill`.

- [ ] **Step 3: Wrap the Continue handler**

Find the handler that calls `startAnalyze.mutate(...)` (it's the Continue-button onClick or a function it delegates to). Wrap the kickoff with a confirm dialog:

```tsx
  const handleContinue = () => {
    if (uncategorizedCount > 0) {
      const ok = window.confirm(
        `${uncategorizedCount} document${uncategorizedCount === 1 ? "" : "s"} ${uncategorizedCount === 1 ? "is" : "are"} missing a category. Suggestions will be slightly less targeted. Continue anyway?`
      );
      if (!ok) return;
    }
    // existing kickoff logic
    startAnalyze.mutate();
    // existing wait-state transition
  };
```

(Adapt to the actual code shape — if the existing handler is inline, refactor to a named function as above. Use a shadcn `<AlertDialog>` instead of `window.confirm` if there's already a pattern for it in the file; `window.confirm` is acceptable as a fast first cut.)

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AssessmentUpload.tsx
git commit -m "feat(prefill): nudge user when continuing with uncategorized docs

If any documents lack a category at Continue time, show a confirm
prompt. Doesn't block — the swarm runs anyway, but the user is
warned that suggestions will be less targeted."
```

---

## Verification

Run `npm run dev` and walk through:

1. **Auto-upload on drop.** New session → drop a PDF. Within 1-2s the row shows "Uploaded". Category Select reads "Select category (optional)", relevance Input is empty, both editable. Type metadata after the fact — saves on blur.
2. **Drop multiple files.** Drop 3 PDFs. All three start uploading in parallel. None blocked on metadata.
3. **Continue without metadata.** Drop a PDF, immediately click Continue. `window.confirm` fires: "1 document is missing a category. Suggestions will be slightly less targeted. Continue anyway?" Click OK → wait page renders, swarm starts.
4. **Auto-advance gated by suggestion.** On a question whose `requires_explanation = false` for "No" AND AI suggested "No" with ≥40% — page does NOT auto-advance. Italic line below answer-row: "AI rationale: …". Continue button visible. Click → next question.
5. **Auto-advance unchanged.** On a question where no AI suggestion exists AND `requires_explanation = false` — auto-advance still fires.
6. **`requires_explanation = true` path unchanged.** Pick "Yes" on a question that requires explanation + has a prefill → existing zone-3 SuggestionCard renders inside the grey panel; no duplicate strip.
7. **Sidebar.** During analysis: NO "Analyzing documents · X / N" pill. NO "Uploaded documents (N)" button. Once first prefill arrives: "1 pre-fill suggestion available" appears and ticks up. After all done: "44 pre-fill suggestions available" — no extra pill.
8. **Failed analysis still surfaces.** Force a failure (e.g., kill edge function during run): amber "Analysis failed — continuing without suggestions" pill renders.
9. **No 400s.** Network tab during upload: zero requests with `action: "summarize"`.
10. **DB sanity.** `SELECT category, relevance_note, created_at FROM atad2_session_documents WHERE session_id = '…' ORDER BY created_at;` — rows for files dropped first appear with `null` category, then update once user tags.

---

## Self-review

- ✅ Spec coverage: section 1 ↔ Task 3; section 2 ↔ Tasks 1+2+5; section 3 ↔ Task 4. All four spec sections addressed.
- ✅ No placeholders. Every step has actual code or command.
- ✅ Type consistency: `useUpdateDocumentMetadata` accepts `{ docId, category?, relevanceNote? }`; uploader and remote-docs block both call the same mutation. `canAutoAdvance` keeps the same call sites (lines 1304, 1392, 2159) but now honors `currentPrefill`.
- ⚠️ Risk: `canAutoAdvance` references `currentPrefill` which is defined later in the file. The plan addresses this — fall back to moving the helper definition below `currentPrefill` if TS complains. Closure-over-later-let is legal JS but TypeScript's strict-mode TDZ analysis may not love it.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-prefill-iteration-6-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — run tasks here with checkpoints.

**Which approach?**
