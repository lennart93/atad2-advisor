# ATAD2 appendix: two-page split + per-page skip

Date: 2026-06-09

## Goal

Split the single Appendix step into two pages that both live under one "Appendix"
step, and let the advisor skip either page so it is left out of the deliverable.

- **Page 1 — Facts**: Part A (entity register, relatedness, acting together,
  classification, transaction map).
- **Page 2 — Checklist**: Part B (the article-by-article ATAD2 checklist rows,
  art. 2 + 12aa..12ag).

The stepper keeps a single **Appendix** dot; the two pages are sequential
sub-pages navigated with the footer Back/Next.

## Decisions (from brainstorming)

1. Page 1 = Facts, Page 2 = Checklist (facts first; the checklist is grounded on them).
2. One "Appendix" step in the stepper, two sub-pages (not two stepper dots, not tabs).
3. Skip is **per page** (Facts and Checklist independently), not whole-appendix-only.
4. Skip means **omit from the deliverable, keep the content generated**: reversible,
   the page still prewarms/generates, it is just marked "Skipped" and dropped from
   the memo. Skip does not stop generation.

## Navigation & routing

- **Facts** stays on the existing route `/assessment-appendix/:sessionId`.
- **Checklist** moves to a sub-route `/assessment-appendix/:sessionId/checklist`.
- `stepIndexForPath` already returns step 4 for any `pathname.startsWith('/assessment-appendix/')`,
  so both sub-pages render under the single **Appendix** stepper dot with no change there.
- A thin shell page loads the appendix once (generation trigger, polling, `saveFacts`,
  row edits, skip state) and renders either the Facts sub-page or the Checklist
  sub-page based on the route. This avoids duplicating the load/generate/poll logic.
- Footer wiring:
  - Facts: **Back** → `/assessment-confirmation/:sessionId`, **Next** → `…/checklist`.
  - Checklist: **Back** → `/assessment-appendix/:sessionId` (Facts), **Confirm appendix**
    → `/assessment/structure/:sessionId` (unchanged `confirmAppendix` behaviour).
- A small sub-heading on each page ("Facts" / "Checklist", or "1 of 2") signals which
  page is active.
- `resumeUrl` continues to resume the Appendix step at the Facts page (default route);
  no per-sub-page resume is required.

## The two pages

- **Facts page**: the `FactsPanel` (with its per-section exclude toggles, unchanged)
  plus the single **Regenerate** button.
- **Checklist page**: the `AppendixTable` (article rows, with per-row exclude/confirm,
  unchanged) plus **Regenerate**.
- **Regenerate** stays one action that rebuilds the whole appendix (the edge function
  produces both facts and rows). It is available on both pages and unchanged otherwise.
- Sources stay visible in the checklist table (the Show-sources toggle was already
  removed); no toggle is reintroduced.

## Skip behaviour

- Each page header has a **Skip this page** control (an eye-style toggle, consistent
  with the per-section/per-row exclude controls).
- Toggling sets the corresponding flag (`facts_skipped` / `checklist_skipped`) on the
  appendix row, persisted immediately (optimistic UI).
- A skipped page:
  - shows a clear "Skipped, left out of the report" banner at the top, with the
    content still rendered (dimmed) underneath so it can be reviewed and un-skipped;
    nothing is deleted,
  - no longer counts toward "needs review",
  - is omitted from the memo (see Export).
- Skip is reversible at any time; un-skipping is instant because the content kept
  generating/prewarming regardless.
- Skip never blocks navigation: the advisor can still walk Facts → Checklist → Confirm
  whether or not a page is skipped.

## Data & persistence

- **Migration** (`atad2_appendix`): add
  - `facts_skipped boolean not null default false`
  - `checklist_skipped boolean not null default false`
  Idempotent (`add column if not exists`); applied on the VM as `supabase_admin`.
- **Types** (hand-maintained `src/integrations/supabase/types.ts`): add both columns to
  the `atad2_appendix` Row/Insert/Update interfaces, and add `facts_skipped` /
  `checklist_skipped` to `StoredAppendix` in `src/lib/appendix/types.ts` (+ `loadAppendix`
  mapping in `client.ts`).
- **Client**: a small `setAppendixSkip(appendixId, page: 'facts' | 'checklist', skipped)`
  in `src/lib/appendix/client.ts`, mirroring `saveFacts` (update the column + `updated_at`).
- The edge function (`generate-appendix`) does not read these flags; skip is purely an
  advisor/export concern, so no edge-function change is required.

## Export integration

- The live deliverable is the memo, built in `AssessmentReport.tsx` via
  `buildAppendixBlock(appendix.rows, skeleton, appendix.facts)` when
  `review_status === 'confirmed'`.
- Honour the flags at that call site (cleanest, no signature churn deep down):
  - `facts_skipped` → pass `facts = null` so no `<facts>` block is prepended.
  - `checklist_skipped` → pass `rows = []`; and when rows are empty,
    `buildAppendixBlock` returns an empty/omitted `<confirmed_appendix>` block (add a
    guard so an empty rows array yields no appendix block rather than empty tags).
  - both skipped → no appendix block is sent (`confirmed_appendix` empty).
- `printAppendix` (the standalone PDF) is currently orphaned (its buttons were removed).
  For consistency it should accept the same two skip flags and drop the corresponding
  Part A / Part B sections, but this is low priority since nothing triggers it today.

## Components / files affected

- `src/lib/assessment/steps.ts` — no change (one Appendix step; sub-route already maps to it).
- Routing (`src/App.tsx`) — add the `…/checklist` route pointing at the same appendix shell.
- `src/pages/AssessmentAppendix.tsx` — becomes the shell: load/generate/poll/save once,
  render Facts vs Checklist sub-page by route, own the skip state + footer wiring.
  (Optionally extract `AppendixFactsPage` / `AppendixChecklistPage` presentational pieces
  to keep the shell focused.)
- `src/lib/appendix/client.ts` — `loadAppendix` maps the new columns; add `setAppendixSkip`.
- `src/lib/appendix/types.ts` — `StoredAppendix` gains the two flags.
- `src/integrations/supabase/types.ts` — hand-add the two columns.
- `src/pages/AssessmentReport.tsx` — apply the flags when building the memo block.
- `src/lib/appendix/buildAppendixBlock.ts` — guard so empty rows produce no appendix block.
- `supabase/migrations/<ts>_appendix_page_skip.sql` — new columns.
- `src/lib/appendix/printAppendix.ts` — optional skip-flag handling (low priority).

## Testing

- Skip-flag round-trip through `loadAppendix` / `setAppendixSkip` (and survives a
  reload, like `excludedSections`).
- `buildAppendixBlock`: drops the `<facts>` block when facts is null; drops the
  `<confirmed_appendix>` block when rows is empty; both → empty output.
- Route → sub-page selection renders Facts vs Checklist.
- Footer navigation targets (Facts Next → checklist route; Checklist Back → facts route;
  Confirm → structure).

## Out of scope

- No whole-appendix single skip (per-page only, per the decision).
- No change to the generation/edge function or the prompts.
- No reinstating the removed export buttons or the Show-sources toggle.
- No per-sub-page resume URL (resume lands on Facts).
