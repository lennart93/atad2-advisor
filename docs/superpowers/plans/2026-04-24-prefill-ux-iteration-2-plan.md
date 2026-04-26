# Pre-Fill UX Iteration 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four UX polish fixes on the working Document Pre-Fill feature: account-bound dismiss preference, visually-matched checkbox cards on session-info, category Select that stays editable post-upload, and per-step diagnostic logging on uploads.

**Architecture:** Frontend-only changes plus one small DB migration. Add `before_you_start_dismissed` column to existing `profiles` table, expose via a new `useUserPreference` hook. Extract a reusable `<OptionToggle>` component for the two session-info checkboxes. Loosen the Select disable rule on the upload row to only depend on the extraction-job lock. Add `[upload]` console logs at each async step in the upload mutations.

**Tech Stack:** React 18 + TypeScript + Supabase JS (existing). shadcn/ui components (Card, Checkbox, Tooltip, Select — all already in project).

**Reference spec:** [docs/superpowers/specs/2026-04-24-prefill-ux-iteration-2-design.md](../specs/2026-04-24-prefill-ux-iteration-2-design.md).

**Delivery constraints:**
- Branch: `feat/document-prefill` (already active). No push to `main`.
- Migration applies via Supabase Studio SQL editor (no SSH/Run Command access at the moment).

---

## Pre-flight

- [ ] **P1. Confirm branch**

```bash
git branch --show-current
```

Expected: `feat/document-prefill`. If different, switch with `git checkout feat/document-prefill`.

- [ ] **P2. Confirm clean working tree**

```bash
git status --short
```

Expected: empty (no uncommitted changes from this session). If dirty, decide whether to commit or stash before starting.

---

## Task 1: DB migration — add `before_you_start_dismissed` column

**Files:**
- Create: `supabase/migrations/20260424180000_add_before_you_start_dismissed.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260424180000_add_before_you_start_dismissed.sql` with:

```sql
-- Document Pre-Fill UX iteration 2: account-bound dismiss preference
-- for the "Before you start" modal on assessment creation.

ALTER TABLE public.profiles
  ADD COLUMN before_you_start_dismissed boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration via Supabase Studio**

Open Studio at `http://135.225.104.142:3000` → SQL Editor → New query → paste the SQL above → Run.

Expected: `ALTER TABLE` success, no errors. Verify with:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;
```

The list must include `before_you_start_dismissed | boolean | false`.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20260424180000_add_before_you_start_dismissed.sql
git commit -m "feat(prefill): add before_you_start_dismissed column to profiles"
```

---

## Task 2: Regenerate Supabase types for the new column

**Files:**
- Modify: `src/integrations/supabase/types.ts` (the `profiles` interface block)

- [ ] **Step 1: Find the profiles block in types.ts**

```bash
grep -n "profiles:" src/integrations/supabase/types.ts | head -3
```

Open the file and locate the `profiles: { Row: { ... }, Insert: { ... }, Update: { ... } }` block.

- [ ] **Step 2: Add the new column to all three (Row, Insert, Update)**

Add the line `before_you_start_dismissed: boolean` to `Row`, `before_you_start_dismissed?: boolean` to `Insert`, and `before_you_start_dismissed?: boolean` to `Update`. Insert it alphabetically or alongside the other simple columns like `created_at`.

Example (showing Row only — apply same pattern to Insert and Update):

```ts
profiles: {
  Row: {
    id: string
    user_id: string
    email: string | null
    full_name: string | null
    before_you_start_dismissed: boolean
    created_at: string
    updated_at: string
  }
  Insert: { /* same shape; all but user_id optional */ }
  Update: { /* all optional */ }
  Relationships: []
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(prefill): regenerate Supabase types for before_you_start_dismissed"
```

---

## Task 3: Create `useUserPreference` hook

**Files:**
- Create: `src/hooks/useUserPreference.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUserPreference() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    enabled: !!user?.id,
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("before_you_start_dismissed")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({ before_you_start_dismissed: true })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", user?.id] }),
  });

  return {
    dismissed: !!profile.data?.before_you_start_dismissed,
    isLoading: profile.isLoading,
    dismiss: dismiss.mutateAsync,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useUserPreference.ts
git commit -m "feat(prefill): add useUserPreference hook for profile-bound prefs"
```

---

## Task 4: Replace localStorage logic with `useUserPreference` in Assessment.tsx

**Files:**
- Modify: `src/pages/Assessment.tsx`

- [ ] **Step 1: Remove the localStorage constant**

Find this line (currently around the SessionInfo interface):
```ts
const BEFORE_YOU_START_DISMISSED_KEY = "atad2_before_you_start_dismissed";
```
**Delete the whole line.**

- [ ] **Step 2: Add the hook import + invocation**

At the top of the file, in the imports block:
```ts
import { useUserPreference } from "@/hooks/useUserPreference";
```

Inside the `Assessment` component, immediately after the existing `useNavigate()` call:
```ts
const userPref = useUserPreference();
```

- [ ] **Step 3: Replace the dismiss check in `validateAndShowWarning`**

Find the block:
```ts
if (localStorage.getItem(BEFORE_YOU_START_DISMISSED_KEY) === "true") {
  startSession();
  return;
}
setShowStartWarningDialog(true);
```

Replace with:
```ts
if (userPref.dismissed) {
  startSession();
  return;
}
setShowStartWarningDialog(true);
```

- [ ] **Step 4: Replace the dismiss-write in the modal confirm-handler**

Find the modal's "Start assessment" button onClick:
```ts
onClick={() => {
  if (dontShowBeforeYouStartAgain) {
    localStorage.setItem(BEFORE_YOU_START_DISMISSED_KEY, "true");
  }
  setShowStartWarningDialog(false);
  startSession();
}}
```

Replace with:
```ts
onClick={async () => {
  if (dontShowBeforeYouStartAgain) {
    await userPref.dismiss().catch((e) => console.error("dismiss failed", e));
  }
  setShowStartWarningDialog(false);
  startSession();
}}
```

- [ ] **Step 5: Update the modal checkbox label**

Find the existing label *"Don't show this again on this device"* and change to *"Don't show this again"* (since it's now account-bound, no longer device-specific).

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(prefill): bind 'don't show again' to user profile instead of localStorage"
```

---

## Task 5: Create `<OptionToggle>` component

**Files:**
- Create: `src/components/prefill/OptionToggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Optional content rendered inside the same card below the checkbox row
   * when `checked === true`. Lets a toggle expose dependent fields without
   * breaking the card boundary.
   */
  children?: ReactNode;
}

export function OptionToggle({ id, label, description, checked, onCheckedChange, disabled, children }: Props) {
  return (
    <div className="border border-border rounded-lg p-4 min-h-[72px] space-y-3">
      <TooltipProvider>
        <div className="flex items-center space-x-2">
          <Checkbox
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={(v) => onCheckedChange(v === true)}
          />
          <label htmlFor={id} className="text-sm font-medium cursor-pointer flex-1">
            {label}
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-default ml-1" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{description}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      {checked && children}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/prefill/OptionToggle.tsx
git commit -m "feat(prefill): add OptionToggle reusable card component"
```

---

## Task 6: Use `<OptionToggle>` for both session-info checkboxes

**Files:**
- Modify: `src/pages/Assessment.tsx`

- [ ] **Step 1: Add import**

Add to the imports block:
```ts
import { OptionToggle } from "@/components/prefill/OptionToggle";
```

- [ ] **Step 2: Replace the existing tax-year checkbox card**

Find the block starting with:
```tsx
<div className="border border-border rounded-lg p-4 space-y-4">
  <TooltipProvider>
    <div className="flex items-center space-x-2">
      <Checkbox 
        id="tax-year-different"
        ...
```

(it ends with `</TooltipProvider>` and contains the conditional `{sessionInfo.tax_year_not_equals_calendar && (...)}` block with the date pickers).

Wrap both the toggle AND the conditional date-picker grid into a single `<OptionToggle>`:

```tsx
<OptionToggle
  id="tax-year-different"
  label="The tax year does not equal the calendar year"
  description="Only fill in a start and end date if the tax year deviates from the calendar year."
  checked={sessionInfo.tax_year_not_equals_calendar}
  onCheckedChange={(checked) => setSessionInfo({
    ...sessionInfo,
    tax_year_not_equals_calendar: checked,
    period_start_date: checked ? sessionInfo.period_start_date : undefined,
    period_end_date: checked ? sessionInfo.period_end_date : undefined,
  })}
>
  <div className="grid grid-cols-2 gap-4">
    {/* paste the existing two-date-picker JSX here verbatim */}
  </div>
</OptionToggle>
```

The two-date-picker JSX (Start date + End date Popover/Calendar pair) is the existing content from the conditional `{sessionInfo.tax_year_not_equals_calendar && ...}` block — copy it as-is into the `<OptionToggle>`'s children. It already renders only when checked, but the wrapper component now owns that state via the `children` prop showing only when `checked === true`.

- [ ] **Step 3: Replace the wants_documents checkbox**

Find the block currently rendering the `wants_documents` checkbox (added in the previous iteration). It looks like:

```tsx
<div className="flex items-start space-x-3 pt-2 pb-1">
  <Checkbox id="wants_documents" ... />
  <label htmlFor="wants_documents" ...>
    <span className="font-medium">I want to upload supporting documents...</span>
    <br/>
    <span className="text-muted-foreground">Optional. The AI will extract...</span>
  </label>
</div>
```

Replace with:

```tsx
<OptionToggle
  id="wants_documents"
  label="I want to upload supporting documents"
  description="Optional. The AI will extract relevant facts and pre-fill context on matching questions. You can skip this and type your own toelichting per question."
  checked={sessionInfo.wants_documents ?? false}
  onCheckedChange={(checked) =>
    setSessionInfo({ ...sessionInfo, wants_documents: checked })
  }
/>
```

- [ ] **Step 4: Wrap the two toggles in a side-by-side grid**

Locate where the two `<OptionToggle>`s are now rendered in sequence. Wrap them in:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  <OptionToggle id="tax-year-different" ... >
    {/* date pickers as children */}
  </OptionToggle>
  <OptionToggle id="wants_documents" ... />
</div>
```

This puts them side-by-side on desktop (≥640px), stacked on mobile.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run dev server and visually confirm**

```bash
npm run dev
```

Open `http://localhost:8080`, login, click Start new assessment. Verify:
- Both checkboxes are in cards of identical width and minimum height
- Description text is no longer inline; hovering the `Info` icon shows tooltip
- Checking "tax year ≠ calendar" expands the date pickers inside its own card
- Layout works at narrow screen widths (date pickers stay inside their card)

- [ ] **Step 7: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(prefill): unified OptionToggle for both session-info checkboxes"
```

---

## Task 7: Add `useUpdateDocumentCategory` mutation

**Files:**
- Modify: `src/hooks/usePrefill.ts`

- [ ] **Step 1: Add the mutation**

Locate `useUpdatePrefillAction` (near the bottom of the file). Add the new mutation immediately above (or below) it:

```ts
export function useUpdateDocumentCategory(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, category }: { docId: string; category: string }) => {
      const { error } = await supabase
        .from("atad2_session_documents")
        .update({ category })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session-documents", sessionId] }),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePrefill.ts
git commit -m "feat(prefill): add useUpdateDocumentCategory mutation"
```

---

## Task 8: Loosen Select disable rule + apply category change to remote docs

**Files:**
- Modify: `src/components/prefill/DocumentUploader.tsx`

- [ ] **Step 1: Add the new mutation import**

Add to the imports at top of the file:
```ts
import { useUploadDocument, useSessionDocuments, useUpdateDocumentCategory } from "@/hooks/usePrefill";
```

Inside the component:
```ts
const updateCategory = useUpdateDocumentCategory(sessionId);
```

- [ ] **Step 2: Loosen the disable rule on the pending-files Select**

Find the `<Select>` block inside `store.pendingFiles.map((p) => ...)`. Change:

```tsx
disabled={locked || p.status === "uploading" || p.status === "uploaded"}
```

to:

```tsx
disabled={locked}
```

- [ ] **Step 3: Push category changes for already-uploaded pending files to DB**

In the same `<Select>`'s `onValueChange`, replace:

```tsx
onValueChange={(v) => {
  const cat = v as DocumentCategory;
  store.setCategory(p.localId, cat);
  if (p.status === "queued") kickUpload({ ...p, category: cat });
}}
```

with:

```tsx
onValueChange={(v) => {
  const cat = v as DocumentCategory;
  store.setCategory(p.localId, cat);
  if (p.status === "queued") {
    kickUpload({ ...p, category: cat });
  } else if (p.remoteDocumentId) {
    // File is already uploaded; sync the metadata change to the DB row.
    updateCategory.mutate({ docId: p.remoteDocumentId, category: cat });
  }
}}
```

- [ ] **Step 4: Add a category Select to the remote-doc rendering**

Locate the section that renders remote docs not represented by a PendingFile:

```tsx
{(uploadedDocs ?? [])
  .filter((d) => !store.pendingFiles.some((p) => p.remoteDocumentId === d.id))
  .map((d) => (
    <Card key={d.id} className="p-3 flex items-start gap-3">
      ...
      <div className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
        {DOCUMENT_CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category}
      </div>
    </Card>
  ))}
```

Replace the read-only category badge with an editable Select:

```tsx
<Select
  value={d.category}
  onValueChange={(v) =>
    updateCategory.mutate({ docId: d.id, category: v as DocumentCategory })
  }
  disabled={locked}
>
  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
  <SelectContent>
    {DOCUMENT_CATEGORIES.map((c) => (
      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev` (if not already running), log in, start a new assessment with the documents checkbox on, upload a file:
- Pick a category → upload starts
- During "Uploading...": Select must remain enabled (open dropdown, change to a different category) → no error, state updates
- After "Uploaded — ready for extraction": Select still enabled, change category → DB row category updates (verify in Studio: `SELECT category FROM atad2_session_documents WHERE id = '...'`)
- Click Start extraction → Select becomes disabled (job is now `locked`)

- [ ] **Step 7: Commit**

```bash
git add src/components/prefill/DocumentUploader.tsx
git commit -m "feat(prefill): keep category Select editable until extraction is locked"
```

---

## Task 9: Per-step diagnostic logging on uploads

**Files:**
- Modify: `src/hooks/usePrefill.ts`

- [ ] **Step 1: Add step logging in `useUploadDocument`**

Locate the `mutationFn` of `useUploadDocument`. Wrap each major await in a try/catch with step-tagged logging:

```ts
mutationFn: async ({ pending }: { pending: PendingFile }) => {
  if (!sessionId) throw new Error("No session id");
  if (!pending.category) throw new Error("Category required");
  console.log("[upload-document] start", { name: pending.file.name, mime: pending.file.type, size: pending.file.size });

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  let uploadBlob: Blob = pending.file;
  let uploadMime = pending.file.type;
  let uploadSize = pending.file.size;
  let uploadExt = pending.file.name.split(".").pop() ?? "bin";

  if (pending.file.type === "application/pdf") {
    try {
      console.log("[upload-document] step: extract PDF text in browser");
      const { getDocumentProxy, extractText } = await import("unpdf");
      const buffer = await pending.file.arrayBuffer();
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const combined = Array.isArray(text) ? text.join("\n\n") : text;
      if (!combined || combined.trim().length === 0) {
        throw new Error("Could not extract any text from this PDF. It may be scanned or image-only.");
      }
      uploadBlob = new Blob([combined], { type: "text/plain" });
      uploadMime = "text/plain";
      uploadSize = uploadBlob.size;
      uploadExt = "txt";
      console.log("[upload-document] step: extracted PDF text", { chars: combined.length });
    } catch (err) {
      console.error("[upload-document] step failed: pdf-extract", err);
      throw err;
    }
  }

  const docId = crypto.randomUUID();
  const storagePath = `${userId}/${sessionId}/${docId}.${uploadExt}`;

  try {
    console.log("[upload-document] step: storage upload", { docId, storagePath, mime: uploadMime, size: uploadSize });
    const { error: upErr } = await supabase.storage
      .from("session-documents")
      .upload(storagePath, uploadBlob, { contentType: uploadMime });
    if (upErr) throw upErr;
  } catch (err) {
    console.error("[upload-document] step failed: storage-upload", err);
    throw err;
  }

  let inserted;
  try {
    console.log("[upload-document] step: db insert");
    const { data, error: insErr } = await supabase
      .from("atad2_session_documents")
      .insert({
        id: docId,
        session_id: sessionId,
        filename: pending.file.name,
        doc_label: pending.docLabel,
        category: pending.category,
        storage_path: storagePath,
        mime_type: uploadMime,
        size_bytes: uploadSize,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    inserted = data;
  } catch (err) {
    console.error("[upload-document] step failed: db-insert", err);
    throw err;
  }

  console.log("[upload-document] step: invoke summarize (fire-and-forget)", { docId });
  invokePrefillFn({ action: "summarize", session_id: sessionId, document_id: docId })
    .catch((e) => console.error("[upload-document] summarize failed", e));

  console.log("[upload-document] done", { docId });
  return inserted;
},
```

- [ ] **Step 2: Add step logging in `useUploadText`**

Apply the same pattern to `useUploadText`'s `mutationFn`:

```ts
mutationFn: async ({ text, category, label }: { text: string; category: string; label: string }) => {
  if (!sessionId) throw new Error("No session id");
  if (!text.trim()) throw new Error("Empty text");
  console.log("[upload-text] start", { chars: text.length, category });

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const blob = new Blob([text], { type: "text/plain" });
  const docId = crypto.randomUUID();
  const storagePath = `${userId}/${sessionId}/${docId}.txt`;

  try {
    console.log("[upload-text] step: storage upload", { docId, size: blob.size });
    const { error: upErr } = await supabase.storage
      .from("session-documents")
      .upload(storagePath, blob, { contentType: "text/plain" });
    if (upErr) throw upErr;
  } catch (err) {
    console.error("[upload-text] step failed: storage-upload", err);
    throw err;
  }

  let inserted;
  try {
    console.log("[upload-text] step: db insert");
    const { data, error: insErr } = await supabase
      .from("atad2_session_documents")
      .insert({
        id: docId,
        session_id: sessionId,
        filename: `${label}.txt`,
        doc_label: label,
        category,
        storage_path: storagePath,
        mime_type: "text/plain",
        size_bytes: blob.size,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    inserted = data;
  } catch (err) {
    console.error("[upload-text] step failed: db-insert", err);
    throw err;
  }

  console.log("[upload-text] step: invoke summarize (fire-and-forget)", { docId });
  invokePrefillFn({ action: "summarize", session_id: sessionId, document_id: docId })
    .catch((e) => console.error("[upload-text] summarize failed", e));

  console.log("[upload-text] done", { docId });
  return inserted;
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePrefill.ts
git commit -m "feat(prefill): per-step diagnostic logging on upload flows"
```

---

## Task 10: End-to-end manual verification

- [ ] **Step 1: Restart dev server**

Stop the running dev server (`Ctrl+C` in its terminal), then:
```bash
npm run dev
```

Open `http://localhost:8080`.

- [ ] **Step 2: Verify account-bound dismiss**

1. Login.
2. Start a new assessment, fill name + tax year, click Start. Modal appears.
3. Check three confirmations + "Don't show this again" + click Start assessment.
4. In Studio: `SELECT before_you_start_dismissed FROM profiles WHERE user_id = (SELECT id FROM auth.users WHERE email = '<your email>');` → must be `true`.
5. Skip back, start a second assessment. The modal should NOT appear (auto-skipped).
6. Optional cross-device check: open the app in incognito, login same account → starting an assessment also skips the modal.

Pass: dismiss is account-scoped.

- [ ] **Step 3: Verify visual match of the toggles**

On session-info screen:
- Both checkbox cards have identical card styling (border, padding) and minimum height
- Each card has an info-icon to the right; hover shows the description tooltip
- Description text no longer inline (no wall of text under labels)
- Checking "tax year ≠ calendar" expands date pickers inside the same card
- On narrow viewport (resize to ~480px) the two cards stack vertically

Pass: layout is uniform.

- [ ] **Step 4: Verify category Select stays editable**

Tick "I want to upload supporting documents", proceed to upload screen:
1. Upload a file, pick category "Local File" → upload starts.
2. Mid-upload: open the Select dropdown again, pick "Master File". Should work without error; UI does not lock up.
3. Once status reads "Uploaded — ready for extraction": still openable.
4. Pick yet another category. Verify in Studio: the row's `category` column reflects the new value.
5. Click Start extraction → Select disables.

Pass: edit-after-upload works, no race-flicker.

- [ ] **Step 5: Verify diagnostic logging**

Open DevTools → Console. Upload a file. You should see a sequence like:
```
[upload-document] start { name: "x.pdf", mime: "application/pdf", size: 487123 }
[upload-document] step: extract PDF text in browser
[upload-document] step: extracted PDF text { chars: 25431 }
[upload-document] step: storage upload { docId: "...", storagePath: "...", mime: "text/plain", size: 25431 }
[upload-document] step: db insert
[upload-document] step: invoke summarize (fire-and-forget) { docId: "..." }
[upload-document] done { docId: "..." }
```

Pass: every step is named in the log. If summarize 500s, the previous failed-step line will identify the cause precisely.

- [ ] **Step 6: No commit needed (verification step only).**

---

## Self-review checklist

1. **Spec coverage** — every section of the spec has at least one task:
   - §1 Profile-bound preference → Tasks 1, 2, 3, 4
   - §2 Visual match (OptionToggle + grid) → Tasks 5, 6
   - §3 Category Select editable → Tasks 7, 8
   - §4 500 diagnostics (client-side logging) → Task 9

2. **Placeholder scan** — no "TBD" / "TODO" / "similar to Task N". Every code step contains actual code.

3. **Type consistency** — `before_you_start_dismissed` (snake_case) used identically in SQL, generated TS types, hook, and React component. `useUpdateDocumentCategory` referenced same way in import + invocation. `OptionToggle` props interface stable across producer (Task 5) and consumer (Task 6).

4. **Known limit** — Task 1 step 2 requires Studio access which the user has (port 3000 from their IP). Studio path is correct because Run Command access is currently denied.

---

## End of plan
