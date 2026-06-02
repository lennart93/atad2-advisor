# Questions page trim & header-width alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip three pieces of chrome from the Assessment shell + Questions page and widen the stepper/body container so the entire assessment frame aligns edge-to-edge with the outer header.

**Architecture:** Pure subtraction in three React/TSX files. No new components, hooks, or routes. Container width changes from `max-w-4xl` (896px) to `max-w-6xl` (1152px) on the shell so it matches `AppLayout`'s header width.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui. Build/typecheck via `npm run build`. No unit tests for these layout files; verification is visual via `npm run dev`.

**Source spec:** [`docs/superpowers/specs/2026-05-15-questions-page-trim-and-align-design.md`](../specs/2026-05-15-questions-page-trim-and-align-design.md)

---

## File Inventory

| File | Action | What changes |
|---|---|---|
| `src/components/assessment/AssessmentShell.tsx` | Modify | Strip metadata block (title, session-ID, "Add documents"); drop `FileUp` import; widen sub-header + body containers from `max-w-4xl` → `max-w-6xl`; drop redundant `mt-3` wrapper around stepper |
| `src/components/AssessmentSidebar.tsx` | Modify | Drop `sessionId` prop; drop `useAllPrefills`/`usePrefillJob` imports + their use; drop `activeSuggestions`/`pillContent`/`pillTone`; drop the two JSX blocks (failure pill + "X pre-fill suggestions available"). Keep current row markup (border-l accent, emerald palette, break-words). |
| `src/pages/Assessment.tsx` | Modify | Delete "Back to dashboard" wrapper at lines 1887–1891. Drop `sessionId={sessionId \|\| null}` prop from `<AssessmentSidebar>` call at line 1896. |

No file creations, no deletions.

---

## Task 1 — Strip AssessmentShell sub-header and widen containers

**Files:**
- Modify: `src/components/assessment/AssessmentShell.tsx`

Read the whole file first (153 lines) so you have full context.

- [ ] **Step 1: Remove the `FileUp` import**

Find this line near the top:

```tsx
import { FileUp } from 'lucide-react';
```

Delete the entire line. No other symbol from `lucide-react` is imported in this file, so the import statement goes away entirely.

- [ ] **Step 2: Remove the title + button block inside the sub-header**

Find the sub-header block (currently around lines 72–112):

```tsx
        <div className="shrink-0 border-b border-[hsl(var(--border-subtle))] bg-background">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  ATAD2 assessment
                </p>
                {/* DD1 — skeleton, not 'New assessment', while the session loads */}
                {sessionId && !session ? (
                  <Skeleton className="mt-0.5 h-6 w-48" />
                ) : (
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {session?.taxpayer_name ?? 'New assessment'}
                  </h2>
                )}
                {sessionId && (
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {sessionId}
                    {session?.status && (
                      <><span className="mx-1.5">·</span>{session.status}</>
                    )}
                  </p>
                )}
              </div>
              {sessionId && currentStep > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDocuments}
                  className="shrink-0 transition-all duration-fast"
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  Add documents
                </Button>
              )}
            </div>
            <div className="mt-3">
              <AssessmentStepper current={currentStep} />
            </div>
          </div>
        </div>
```

Replace with this exact block:

```tsx
        <div className="shrink-0 border-b border-[hsl(var(--border-subtle))] bg-background">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <AssessmentStepper current={currentStep} />
          </div>
        </div>
```

Three things happened at once:
1. The entire `<div className="flex items-start justify-between gap-4">…</div>` (title + Add documents button) is gone.
2. The wrapping `<div className="mt-3">` around `<AssessmentStepper>` is gone (no sibling above it anymore, so the margin is dead weight; the parent's `py-3` is the only vertical padding needed).
3. The container's `max-w-4xl` is now `max-w-6xl`.

- [ ] **Step 3: Widen the body wrapper**

Find the body wrapper (currently around lines 134–138):

```tsx
            className={cn(
              stepDef?.fullBleed
                ? 'flex-1'
                : cn('mx-auto px-4 py-6', stepDef?.wide ? 'max-w-7xl' : 'max-w-4xl'),
            )}
```

Change `'max-w-4xl'` → `'max-w-6xl'`:

```tsx
            className={cn(
              stepDef?.fullBleed
                ? 'flex-1'
                : cn('mx-auto px-4 py-6', stepDef?.wide ? 'max-w-7xl' : 'max-w-6xl'),
            )}
```

- [ ] **Step 4: Check for now-unused imports**

After steps 1–3, check whether `Skeleton` and `Button` are still used in `AssessmentShell.tsx`:

```bash
grep -n "Skeleton\|Button\b" src/components/assessment/AssessmentShell.tsx
```

Expected: no matches. If that's the case, remove these two import lines:

```tsx
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
```

The `useQuery` + `supabase` + `session` data fetching also becomes purely informational (it feeds `ctxValue.meta.taxpayerName` and `meta.status` which are consumed by `useAssessmentShellContext` — keep both). The `openDocuments` callback in `ctxValue` stays for the same reason (no current external consumer, but the spec keeps it as a stable shell-context API).

- [ ] **Step 5: Run the build to typecheck**

```bash
npm run build
```

Expected: Build completes with no TS errors. Specifically, no "X is declared but never read" errors for `FileUp`, `Button`, or `Skeleton` (if they were unused after step 4 and you correctly removed them).

If TS complains about an unused import, remove it. If TS complains that something is missing, re-read the file to confirm steps 1–3 were applied as written.

- [ ] **Step 6: Commit**

```bash
git add src/components/assessment/AssessmentShell.tsx
git commit -m "refactor(shell): strip sub-header metadata, widen to max-w-6xl"
```

---

## Task 2 — Drop prefill UI from AssessmentSidebar

**Files:**
- Modify: `src/components/AssessmentSidebar.tsx`

Read the whole file (199 lines) first.

- [ ] **Step 1: Remove the prefill import**

Find this line near the top:

```tsx
import { useAllPrefills, usePrefillJob } from "@/hooks/usePrefill";
```

Delete the entire line.

- [ ] **Step 2: Remove `sessionId` from the props interface**

Find the `AssessmentSidebarProps` interface:

```tsx
interface AssessmentSidebarProps {
  sessionId?: string | null;
  answers: Record<string, string>;
```

Remove the `sessionId?: string | null;` line. The interface should now start with `answers`.

- [ ] **Step 3: Remove `sessionId` from the component signature**

Find:

```tsx
export function AssessmentSidebar({ sessionId, answers, questionHistory, currentQuestion, pendingQuestion, onQuestionClick, onPendingQuestionClick }: AssessmentSidebarProps) {
```

Change to:

```tsx
export function AssessmentSidebar({ answers, questionHistory, currentQuestion, pendingQuestion, onQuestionClick, onPendingQuestionClick }: AssessmentSidebarProps) {
```

- [ ] **Step 4: Remove the prefill data hooks and derived state**

Find this block at the top of the component body (immediately after the function signature):

```tsx
  const { data: prefills } = useAllPrefills(sessionId ?? null);
  const { data: job } = usePrefillJob(sessionId ?? null);
  const activeSuggestions = (prefills ?? []).filter((p) => p.user_action !== "dismissed" && p.user_action !== "moved_to_additional_context").length;

  let pillContent: string | null = null;
  const pillTone: "default" | "success" | "warn" = "warn";
  if (job?.status === "failed") {
    pillContent = "Analysis failed. Continuing without suggestions.";
  }
  const totalAnswered = questionHistory.length;
```

Replace with:

```tsx
  const totalAnswered = questionHistory.length;
```

- [ ] **Step 5: Remove the failure pill JSX block**

Find the JSX block (currently around lines 59–70):

```tsx
        {pillContent && (
          <div
            className={cn(
              "text-xs px-3 py-2 rounded mb-3 mt-2",
              pillTone === "success" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              pillTone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              pillTone === "default" && "bg-muted text-muted-foreground",
            )}
          >
            {pillContent}
          </div>
        )}
```

Delete the entire block (12 lines).

- [ ] **Step 6: Remove the "pre-fill suggestions available" JSX block**

Find this block (immediately below the one removed in step 5):

```tsx
        {(prefills?.length ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-mono text-[11px]">{activeSuggestions}</span> pre-fill suggestion{activeSuggestions === 1 ? "" : "s"} available
          </p>
        )}
```

Delete the entire block (5 lines).

The sticky header section should now read exactly:

```tsx
      {/* Sticky header */}
      <div className="sticky top-0 bg-muted/30 z-10 p-6 pb-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">ATAD2 progress</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {totalAnswered} questions answered
        </p>
      </div>
```

Nothing else.

- [ ] **Step 7: Verify `cn` is still used**

```bash
grep -n "cn(" src/components/AssessmentSidebar.tsx
```

Expected: multiple matches inside the scrollable list (button className). The `import { cn } from "@/lib/utils";` line must stay.

If `cn` is *not* found anywhere, remove the import. (It will be found — the row markup uses it.)

- [ ] **Step 8: Run the build to typecheck**

```bash
npm run build
```

Expected: still builds, but it will now fail with one specific error in `src/pages/Assessment.tsx`:

```
Type '{ sessionId: ... }' is not assignable to type 'IntrinsicAttributes & AssessmentSidebarProps'.
  Property 'sessionId' does not exist on type 'AssessmentSidebarProps'.
```

This is expected — Task 3 fixes it. Do not commit yet if you want a clean build, but committing here is also fine because Task 3 lands immediately after. We commit each task atomically per the project convention.

- [ ] **Step 9: Commit**

```bash
git add src/components/AssessmentSidebar.tsx
git commit -m "refactor(sidebar): drop prefill UI, restore main-shape header"
```

---

## Task 3 — Remove "Back to dashboard" and the `sessionId` prop from Assessment.tsx

**Files:**
- Modify: `src/pages/Assessment.tsx`

This file is large (~1900 lines). Two surgical edits only.

- [ ] **Step 1: Read the target region**

Read lines 1880–1910 of `src/pages/Assessment.tsx` to confirm the current state matches what we expect:

```tsx
  return (
    <div>
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")} className="transition-all duration-fast">
            ← Back to dashboard
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <AssessmentSidebar
              sessionId={sessionId || null}
              answers={answers}
              questionHistory={questionFlow.map(entry => ({
```

If lines don't match this shape (e.g., file has shifted), grep first:

```bash
grep -n "← Back to dashboard" src/pages/Assessment.tsx
```

Expected: two matches, one around line 1394 (loading state — leave alone) and one around line 1889 (this is the one to remove).

- [ ] **Step 2: Delete the "Back to dashboard" wrapper**

Replace this exact block:

```tsx
    <div>
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")} className="transition-all duration-fast">
            ← Back to dashboard
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
```

With:

```tsx
    <div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
```

(The 5-line `<div className="mb-8">…</div>` block and the blank line below it are removed; the outer `<div>` and the grid `<div>` remain.)

- [ ] **Step 3: Drop the `sessionId` prop from the `<AssessmentSidebar>` call**

Find:

```tsx
            <AssessmentSidebar
              sessionId={sessionId || null}
              answers={answers}
```

Change to:

```tsx
            <AssessmentSidebar
              answers={answers}
```

(Only the `sessionId={sessionId || null}` line is removed.)

- [ ] **Step 4: Confirm the other "Back to dashboard" is untouched**

```bash
grep -n "← Back to dashboard" src/pages/Assessment.tsx
```

Expected: exactly **one** match remaining (around line 1389 — the loading-state branch). If you get zero matches, you removed the wrong one — revert and try again.

- [ ] **Step 5: Run the build to typecheck**

```bash
npm run build
```

Expected: clean build, no errors. The `sessionId` prop mismatch reported at the end of Task 2 is now resolved.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(assessment): remove Back to dashboard button and unused sidebar prop"
```

---

## Task 4 — Visual verification

No automated tests cover these layout files. Verify visually.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173` or `http://localhost:8080`).

- [ ] **Step 2: Sign in and open an in-progress assessment**

Navigate to an existing assessment (or create a new one and progress to the Questions step). Use the "Test BV" assessment from the screenshot if it exists.

- [ ] **Step 3: Verify sub-header is stepper-only**

Visual checks:
- The grey sub-header band shows **only** the steps bar (Intake → Documents → Questions → Structure → Report).
- No "ATAD2 ASSESSMENT" eyebrow text.
- No project title ("Test BV").
- No session-ID + status text.
- No "Add documents" button.

- [ ] **Step 4: Verify sidebar is clean**

On the Questions step, the left sidebar card ("ATAD2 progress") shows:
- "ATAD2 progress" heading.
- "N questions answered" subline.
- The question list below.
- **No** "X pre-fill suggestions available" line.
- **No** "Analysis failed. Continuing without suggestions." pill.

- [ ] **Step 5: Verify "Back to dashboard" is gone from the Questions page**

On the Questions step, above the sidebar + content grid, there is no "← Back to dashboard" button. The grid starts directly under the sub-header.

(The logo in the outer header still navigates back to dashboard — that's the intended escape hatch.)

- [ ] **Step 6: Verify width alignment**

Compare three left edges, top-to-bottom:
- Logo's left edge (outer header).
- Stepper's left edge (sub-header).
- Sidebar card's left edge (body).

All three should sit at the same horizontal pixel.

Compare three right edges:
- "Sign out" button's right edge (outer header).
- Stepper's right edge (the "5 Report" pill ends roughly here).
- Question content card's right edge.

All three should sit at the same horizontal pixel (modulo the `px-4` gutters, which are identical because both containers use `max-w-6xl px-4`).

- [ ] **Step 7: Spot-check other assessment steps**

Click through Intake, Documents, Structure, and Report (using either the stepper or by navigating manually). For each:
- Does the step's content render without layout glitches at the new `max-w-6xl` width?
- Is anything wildly off-center, overflowing, or visibly broken?

If any step looks bad, note it but do not fix it as part of this plan — file it as follow-up. The spec explicitly accepts the wider container globally.

- [ ] **Step 8: Console check**

Open the browser devtools console. Reload the Questions page. Expected: no new red errors and no React warnings about missing props or unused imports.

- [ ] **Step 9: Stop the dev server**

`Ctrl+C` in the terminal where `npm run dev` is running.

- [ ] **Step 10: Final tidy commit (if any leftovers)**

```bash
git status
```

If there are any leftover whitespace-only diffs or untracked artifacts, deal with them appropriately (e.g., `git restore` for stray edits, or add a tidy commit). If clean, you're done.

---

## Self-Review

**Spec coverage:**
- Spec "Goal 1" (sub-header reduced to stepper only) → Task 1, steps 2 & 5 (Verify Sub-header).
- Spec "Goal 2" (sidebar restored to main shape) → Task 2 in full.
- Spec "Goal 3" ("Back to dashboard" removed) → Task 3, step 2.
- Spec "Goal 4" (`max-w-6xl` alignment) → Task 1 steps 2 & 3, verified in Task 4 step 6.
- Spec non-goal "openDocuments callback retained" → Task 1 step 4 explicitly preserves it.
- Spec non-goal "row markup unchanged" → Task 2 only deletes header-region code; no row-markup edits.
- Spec edge case "second Back to dashboard at line 1394 must survive" → Task 3 step 4 explicitly verifies.

No spec requirement is unaccounted for.

**Placeholder scan:** No "TBD", "TODO", "handle edge cases", or vague directives. Every code change shows the literal before/after.

**Type consistency:**
- `AssessmentSidebarProps` shape after Task 2 step 2 matches the call-site shape after Task 3 step 3 (both no longer have `sessionId`).
- Container class strings (`max-w-6xl px-4`) are identical between the sub-header (Task 1 step 2) and the body (Task 1 step 3), so left/right edges line up.
- Build command (`npm run build`) is consistent across all three "typecheck" steps.

No inconsistencies to fix.
