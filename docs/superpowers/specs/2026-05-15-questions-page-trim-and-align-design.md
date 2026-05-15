# Questions page — trim chrome and align to header width

**Date:** 2026-05-15
**Branch:** `feat/document-prefill`
**Scope:** Assessment shell + Questions page only (changes propagate to other assessment steps because they share the shell — see "Non-goals" for what is intentionally affected).

## Problem

The Questions page on `feat/document-prefill` carries three pieces of chrome the user does not want:

1. **Sub-header metadata** (project title "Test BV", session-ID, status) — visual noise that competes with the question itself.
2. **"Add documents" button** in the sub-header — duplicates the Documents step.
3. **"49 pre-fill suggestions available"** counter in the sidebar header — adds a number that has no action attached and clutters the progress panel.
4. **"← Back to dashboard"** button above the question grid — redundant with the logo (which already navigates to dashboard) and the stepper.

Additionally, the stepper and content grid are constrained to `max-w-4xl` (896px) while the page header is `max-w-6xl` (1152px). Result: the stepper and content visibly indent under the header. The user wants the stepper and everything below it to align edge-to-edge with the outer header (logo on the left, "Sign out" on the right).

## Goals

- Sub-header reduced to **only** the steps bar (Intake → Documents → Questions → Structure → Report).
- AssessmentSidebar restored to its `main`-branch shape: title + "X questions answered" + the question list. No prefill UI.
- "Back to dashboard" button removed from the Questions page body.
- Stepper container and body grid both at `max-w-6xl` so they line up exactly with the outer header.

## Non-goals

- The width change applies to **all** assessment steps (Intake, Documents, Questions, Structure, Report) because they share `AssessmentShell`. This is intentional — the user wants header-width alignment globally below the stepper, not Questions-only.
- No change to `AssessmentStepper.tsx` itself (only the container around it widens).
- No change to footer portal, route fade animations, or `useAssessmentShellContext` consumers other than the dropped sub-header UI.
- Prefill suggestions inside the **question content** (the green "SUGGESTED (100%)" answer badge) are out of scope — they live in different components.
- The `openDocuments` callback in shell context is retained so other steps can still link to upload. Only the visible button is removed.

## Design

### File 1 — `src/components/assessment/AssessmentShell.tsx`

Two changes to the sub-header `<div>`:

**a) Strip metadata + button.** Remove the entire `<div className="flex items-start justify-between gap-4">` block (lines 74–107). Keep only `<AssessmentStepper current={currentStep} />` inside the sub-header container.

**b) Widen.** Two `max-w-4xl` strings change to `max-w-6xl`:
- Sub-header inner container (currently line 73): `mx-auto max-w-4xl px-4 py-3` → `mx-auto max-w-6xl px-4 py-3`.
- Body wrapper default (currently line 137): `cn('mx-auto px-4 py-6', stepDef?.wide ? 'max-w-7xl' : 'max-w-4xl')` → `cn('mx-auto px-4 py-6', stepDef?.wide ? 'max-w-7xl' : 'max-w-6xl')`.

The `mt-3` on the stepper wrapper (line 108) becomes redundant since it was spacing the stepper from the title row. Drop it so the stepper sits comfortably in its own ~52px-tall row instead of leaving a stale gap. Container `py-3` is sufficient vertical padding.

The unused `FileUp` import and the (now-orphaned) button JSX must be removed. The `openDocuments` callback **stays** in `ctxValue` — other steps may use it via `useAssessmentShellContext`.

Verify after edit: imports are tidy, no dead variables, TypeScript clean.

### File 2 — `src/components/AssessmentSidebar.tsx`

Replace the file with the `main`-branch version. Concretely:

- Remove imports: `useAllPrefills`, `usePrefillJob` from `@/hooks/usePrefill`.
- Remove `sessionId?: string | null` from `AssessmentSidebarProps`.
- Drop `sessionId` from the function signature.
- Remove `const { data: prefills } = useAllPrefills(...)`, `const { data: job } = usePrefillJob(...)`, `activeSuggestions`, `pillContent`, `pillTone` block.
- Remove the `{pillContent && ...}` JSX block.
- Remove the `{(prefills?.length ?? 0) > 0 && ...}` JSX block (the "pre-fill suggestions available" line).

The header reduces to:
```tsx
<h3>ATAD2 progress</h3>
<p>{totalAnswered} questions answered</p>
```

Everything below the header (the scrollable list) is untouched.

**Compatibility note:** the sidebar list-row markup on the current branch (border-l accent, animate-fade-in) is newer than `main`'s (full border, p-3). We keep the current row markup — it is a design improvement that has nothing to do with prefill. "Back to main" applies to the **header section only**, not the row aesthetics.

### File 3 — `src/pages/Assessment.tsx`

Two surgical edits, both in the final `return (...)` block starting at line 1885:

**a)** Delete the "Back to dashboard" wrapper (lines 1887–1891):
```tsx
<div className="mb-8">
  <Button variant="outline" onClick={() => navigate("/")} className="transition-all duration-fast">
    ← Back to dashboard
  </Button>
</div>
```

The second occurrence at line 1394 is inside a separate loading/empty-state branch and is **not** touched.

**b)** Drop the `sessionId={sessionId || null}` prop from the `<AssessmentSidebar>` call (line 1896). Property no longer exists on the component.

If the outer `<div>` wrapper (line 1886) now contains only the grid, it can remain — no need to collapse it. The `mb-8` it used to provide spacing for is gone; no replacement spacing is needed because the body wrapper already supplies `py-6`.

## Architecture / data flow

No new components, no new state, no new hooks. Pure subtraction:

```
Before:                              After:
AssessmentShell                      AssessmentShell
├─ sub-header                        ├─ sub-header
│  ├─ title block (Test BV/id)       │  └─ stepper            ← only this remains
│  ├─ Add documents button           │
│  └─ stepper                        │
├─ body (max-w-4xl)                  ├─ body (max-w-6xl)      ← wider
│  └─ Assessment.tsx                 │  └─ Assessment.tsx
│     ├─ Back to dashboard           │     └─ grid (sidebar + content)
│     └─ grid (sidebar + content)    │        └─ AssessmentSidebar
│        └─ AssessmentSidebar        │           ├─ "ATAD2 progress"
│           ├─ "ATAD2 progress"      │           ├─ "N questions answered"
│           ├─ "N questions answered"│           └─ question list
│           ├─ failure pill          │
│           ├─ "X suggestions avail" │
│           └─ question list         │
└─ footer portal                     └─ footer portal
```

## Testing / verification

This is a UI change. Verification is visual:

1. **Dev server** — run `npm run dev`, navigate to a Questions step.
2. **Visual checks** (Questions page):
   - Sub-header shows **only** the stepper. No title, no session ID, no "Add documents".
   - "Back to dashboard" button is gone from above the sidebar.
   - Sidebar shows "ATAD2 progress" + "N questions answered" only. No "X pre-fill suggestions available" line.
3. **Width alignment**: visually check that the left edge of the stepper, the sidebar card, and the question content all sit directly below the logo's left edge. Right edge of the question content aligns with "Sign out" on the right.
4. **Other steps** (Intake, Documents, Structure, Report) — open each one and confirm they still render correctly at the new wider container. No layout regressions inside those step components.
5. **TypeScript** — `npm run build` (or `tsc --noEmit`) passes. Confirms the `sessionId` prop removal is consistent across the AssessmentSidebar consumer.
6. **No console errors** — no warning about a missing `sessionId` prop or unused import.

No automated tests need to be added or modified. The codebase does not currently exercise these specific layout files with tests.

## Edge cases

- **Loading state in Assessment.tsx**: there is a second "Back to dashboard" at line 1394 inside an early-return loading branch. **Do not remove it** — it lives in a different render path (no shell, no stepper) and is the only nav out for that state.
- **Shell context consumer (`openDocuments`)**: if no step currently calls `useAssessmentShellContext().meta.openDocuments`, the prop is still harmless to keep. Removing it is out of scope.
- **Mobile / narrow viewports**: the shell already has `min-w-[1024px]` on its root container. The `max-w-6xl` change has no effect below 1152px since the content can't fill the new max width on smaller screens — it falls back to the available width minus `px-4`.

## Risks

- **Width bump affects all steps, not only Questions.** Mitigation: explicit in non-goals. If any step looks bad at the new width, it can be opted out per-step using the existing `stepDef.wide` mechanism in `assessment/steps.ts` (already supports `wide: true` → `max-w-7xl`; we'd add a `narrow: true` escape hatch only if needed).
- **AssessmentSidebar revert touches a file used by the live Questions flow.** Mitigation: the `main` shape was the production shape until recently; reverting it is low-risk. The only structural change is dropping one prop and two hooks.
- **Two "Back to dashboard" strings in Assessment.tsx.** Mitigation: edit by line range, not by `replace_all`. Verify by re-reading the file after the edit that line 1394's button is intact.
