# Appendix two-page split + per-page skip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the ATAD2 Appendix step into two sub-pages (Facts, then Checklist) under one stepper dot, and let the advisor skip either page so it is omitted from the memo while staying generated and reversible.

**Architecture:** One `AssessmentAppendix` component loads/generates/polls/saves once and renders the Facts or Checklist sub-page based on a `page` prop wired from two routes (`/assessment-appendix/:sessionId` and `/assessment-appendix/:sessionId/checklist`), both of which already map to stepper step 4. Skip is two boolean columns on `atad2_appendix`; the memo builder honours them via a pure `appendixMemoBlock` helper.

**Tech Stack:** React + Vite + TypeScript, React Router, self-hosted Supabase (Postgres), Vitest.

Spec: `docs/superpowers/specs/2026-06-09-appendix-two-page-split-and-skip-design.md`

---

## File structure

- `supabase/migrations/20260609230000_appendix_page_skip.sql` — **new**: two boolean columns.
- `src/integrations/supabase/types.ts` — **modify**: add columns to `atad2_appendix` Row/Insert/Update.
- `src/lib/appendix/types.ts` — **modify**: add `facts_skipped` / `checklist_skipped` to `StoredAppendix`.
- `src/lib/appendix/client.ts` — **modify**: map the columns in `loadAppendix`; add `setAppendixSkip`.
- `src/lib/appendix/buildAppendixBlock.ts` — **modify**: guard empty rows; add pure `appendixMemoBlock`.
- `src/lib/appendix/__tests__/buildAppendixBlock.test.ts` — **modify**: cover the guard + helper.
- `src/pages/AssessmentReport.tsx` — **modify**: build the memo block via `appendixMemoBlock`.
- `src/App.tsx` — **modify**: add the `/checklist` route; pass `page` prop.
- `src/pages/AssessmentAppendix.tsx` — **modify**: accept `page` prop, render the right sub-page, wire footer + skip.

---

## Task 1: DB columns + types for per-page skip

**Files:**
- Create: `supabase/migrations/20260609230000_appendix_page_skip.sql`
- Modify: `src/integrations/supabase/types.ts:75-125` (atad2_appendix Row/Insert/Update)
- Modify: `src/lib/appendix/types.ts` (StoredAppendix interface)
- Modify: `src/lib/appendix/client.ts:21-35` (loadAppendix mapping)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260609230000_appendix_page_skip.sql`:

```sql
-- Per-page skip flags for the two appendix sub-pages (Facts / Checklist).
-- A skipped page stays generated but is left out of the memo. Additive +
-- idempotent. Apply on the VM as supabase_admin.
ALTER TABLE public.atad2_appendix
  ADD COLUMN IF NOT EXISTS facts_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_skipped boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Add the columns to the generated Supabase types**

In `src/integrations/supabase/types.ts`, inside `atad2_appendix`, add `facts_skipped: boolean` and `checklist_skipped: boolean` to `Row`, and `facts_skipped?: boolean` / `checklist_skipped?: boolean` to `Insert` and `Update`. Place them right after the `facts_input_hash` line in each block. Row example:

```ts
          facts: Json | null
          facts_input_hash: string | null
          facts_skipped: boolean
          checklist_skipped: boolean
          model: string | null
```

Insert/Update example (the `?:` optional form):

```ts
          facts_input_hash?: string | null
          facts_skipped?: boolean
          checklist_skipped?: boolean
          model?: string | null
```

- [ ] **Step 3: Add the flags to `StoredAppendix`**

In `src/lib/appendix/types.ts`, in the `StoredAppendix` interface, add after `facts: AppendixFacts | null;`:

```ts
  facts_skipped: boolean;
  checklist_skipped: boolean;
```

- [ ] **Step 4: Map the flags in `loadAppendix`**

In `src/lib/appendix/client.ts`, in the object `loadAppendix` returns, add after the `facts:` line:

```ts
    facts: coerceFacts((data as { facts?: unknown }).facts),
    facts_skipped: (data as { facts_skipped?: boolean }).facts_skipped ?? false,
    checklist_skipped: (data as { checklist_skipped?: boolean }).checklist_skipped ?? false,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260609230000_appendix_page_skip.sql src/integrations/supabase/types.ts src/lib/appendix/types.ts src/lib/appendix/client.ts
git commit -m "feat(appendix): add per-page skip columns + types"
```

---

## Task 2: Memo builder honours skip (pure, TDD)

**Files:**
- Modify: `src/lib/appendix/buildAppendixBlock.ts:55-66`
- Test: `src/lib/appendix/__tests__/buildAppendixBlock.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/appendix/__tests__/buildAppendixBlock.test.ts` (import `appendixMemoBlock` alongside the existing `buildAppendixBlock` import):

```ts
import { appendixMemoBlock } from '@/lib/appendix/buildAppendixBlock';

const row = (rowId: string): AppendixRow => ({
  rowId, aiStatus: 'Triggered', aiReasoning: 'r', aiProvenance: '',
  status: 'Triggered', reasoning: 'r', provenance: '',
  excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
});

describe('appendixMemoBlock skip handling', () => {
  const base = {
    rows: [row('3.1')],
    facts: { entities: [{ id: 'E1', chartEntityId: 'c1', name: 'Acme BV', jurisdiction: 'NL', entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' }], actingTogether: [], classifications: [], transactions: [] },
    facts_skipped: false, checklist_skipped: false,
  } as never;

  it('includes both blocks when nothing is skipped', () => {
    const out = appendixMemoBlock(base, [])!;
    expect(out).toContain('<facts>');
    expect(out).toContain('<confirmed_appendix>');
  });
  it('drops the facts block when facts is skipped', () => {
    const out = appendixMemoBlock({ ...base, facts_skipped: true } as never, [])!;
    expect(out).not.toContain('<facts>');
    expect(out).toContain('<confirmed_appendix>');
  });
  it('drops the confirmed_appendix block when the checklist is skipped', () => {
    const out = appendixMemoBlock({ ...base, checklist_skipped: true } as never, [])!;
    expect(out).toContain('<facts>');
    expect(out).not.toContain('<confirmed_appendix>');
  });
  it('returns null when both are skipped', () => {
    expect(appendixMemoBlock({ ...base, facts_skipped: true, checklist_skipped: true } as never, [])).toBeNull();
  });
});

describe('buildAppendixBlock empty rows', () => {
  it('omits the confirmed_appendix block when there are no rows', () => {
    expect(buildAppendixBlock([], [])).not.toContain('<confirmed_appendix>');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/appendix/__tests__/buildAppendixBlock.test.ts`
Expected: FAIL (`appendixMemoBlock` is not exported; empty-rows still emits the block).

- [ ] **Step 3: Add the empty-rows guard + the helper**

In `src/lib/appendix/buildAppendixBlock.ts`, replace the final `return` of `buildAppendixBlock` so an empty `lines` array omits the block:

```ts
  const factsBlock = facts && facts.entities.length ? `${buildFactsSummary(facts)}\n` : '';
  const rowsBlock = lines.length ? `<confirmed_appendix>\n${lines.join('\n')}\n</confirmed_appendix>` : '';
  return `${factsBlock}${rowsBlock}`;
}
```

Then add the pure helper at the end of the file (import `StoredAppendix` from `./types`):

```ts
/**
 * The memo appendix block with the advisor's per-page skip applied: a skipped
 * Facts page drops the <facts> block, a skipped Checklist page drops the rows.
 * Returns null when both are skipped (no appendix block is sent).
 */
export function appendixMemoBlock(
  appendix: Pick<StoredAppendix, 'rows' | 'facts' | 'facts_skipped' | 'checklist_skipped'>,
  skeleton: SkeletonRow[] = APPENDIX_SKELETON,
): string | null {
  const facts = appendix.facts_skipped ? null : appendix.facts;
  const rows = appendix.checklist_skipped ? [] : appendix.rows;
  const hasFacts = !!facts && facts.entities.length > 0;
  if (!hasFacts && rows.length === 0) return null;
  return buildAppendixBlock(rows, skeleton, facts);
}
```

Update the top import to include `StoredAppendix`:

```ts
import type { AppendixFacts, AppendixRow, SkeletonRow, StoredAppendix } from './types';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/appendix/__tests__/buildAppendixBlock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/buildAppendixBlock.ts src/lib/appendix/__tests__/buildAppendixBlock.test.ts
git commit -m "feat(appendix): appendixMemoBlock honours per-page skip"
```

---

## Task 3: `setAppendixSkip` client call

**Files:**
- Modify: `src/lib/appendix/client.ts` (add after `saveFacts`)

- [ ] **Step 1: Add the function**

In `src/lib/appendix/client.ts`, after `saveFacts`, add:

```ts
/** Persist a per-page skip flag (Facts or Checklist) on the appendix row. */
export async function setAppendixSkip(
  appendixId: string,
  page: 'facts' | 'checklist',
  skipped: boolean,
): Promise<void> {
  const column = page === 'facts' ? 'facts_skipped' : 'checklist_skipped';
  const { error } = await supabase
    .from('atad2_appendix')
    .update({ [column]: skipped, updated_at: new Date().toISOString() })
    .eq('id', appendixId);
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/appendix/client.ts
git commit -m "feat(appendix): setAppendixSkip client call"
```

---

## Task 4: Memo build uses the skip-aware helper

**Files:**
- Modify: `src/pages/AssessmentReport.tsx:435-438` and its import line (28)

- [ ] **Step 1: Swap the import**

In `src/pages/AssessmentReport.tsx`, change line 28 from:

```ts
import { buildAppendixBlock } from "@/lib/appendix/buildAppendixBlock";
```

to:

```ts
import { appendixMemoBlock } from "@/lib/appendix/buildAppendixBlock";
```

- [ ] **Step 2: Apply the skip flags at the call site**

Replace the body of the `if` at lines 436-438 with:

```ts
        if (appendix && appendix.review_status === 'confirmed') {
          confirmedAppendix = appendixMemoBlock(appendix, appendixSkeleton);
        }
```

(`appendixMemoBlock` returns `null` when both pages are skipped, which the existing `confirmedAppendix: string | null` already handles.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AssessmentReport.tsx
git commit -m "feat(appendix): memo respects per-page skip"
```

---

## Task 5: Two routes + `page` prop on the appendix shell

**Files:**
- Modify: `src/App.tsx:85`
- Modify: `src/pages/AssessmentAppendix.tsx` (component signature + render switch + footer)

- [ ] **Step 1: Add the checklist route**

In `src/App.tsx`, replace line 85 with the two routes (Facts default + Checklist sub-route):

```tsx
                      <Route path="/assessment-appendix/:sessionId" element={<ProtectedRoute><AssessmentAppendix page="facts" /></ProtectedRoute>} />
                      <Route path="/assessment-appendix/:sessionId/checklist" element={<ProtectedRoute><AssessmentAppendix page="checklist" /></ProtectedRoute>} />
```

- [ ] **Step 2: Accept the `page` prop**

In `src/pages/AssessmentAppendix.tsx`, change the component declaration to accept the prop. Find the export (e.g. `export default function AssessmentAppendix() {`) and replace with:

```tsx
export default function AssessmentAppendix({ page = 'facts' }: { page?: 'facts' | 'checklist' }) {
```

- [ ] **Step 3: Render only the active sub-page**

In the JSX, replace the block that renders both `<FactsPanel .../>` and `<AppendixTable .../>` with a conditional so each route shows one page:

```tsx
      {page === 'facts' ? (
        <FactsPanel
          facts={factsToShow}
          onChange={appendix?.facts ? handleFactsChange : undefined}
          generated={!!appendix?.facts}
        />
      ) : (
        <AppendixTable rows={appendix.rows} skeleton={skeleton} showSources={showSources} relatedParties={relatedParties} onEdit={handleEdit} onToggleExclude={handleToggleExclude} />
      )}
```

- [ ] **Step 4: Wire the footer per page**

Replace the `<AssessmentFooterSlot ... />` block. On Facts, the right action is **Next** (to the checklist route); on Checklist, it stays **Confirm appendix**. Back goes to Confirmation (Facts) or Facts (Checklist):

```tsx
      <AssessmentFooterSlot
        left={
          <Button
            variant="outline"
            onClick={() =>
              navigate(
                page === 'facts'
                  ? `/assessment-confirmation/${sessionId}`
                  : `/assessment-appendix/${sessionId}`,
              )
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
        }
        right={
          page === 'facts' ? (
            <Button variant="outline" onClick={() => navigate(`/assessment-appendix/${sessionId}/checklist`)}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button variant="outline" onClick={handleConfirm} disabled={confirming || refining}>
              {confirming || refining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm appendix
            </Button>
          )
        }
      />
```

(`ArrowRight` is already imported in this file. Verify the existing Confirm button markup — keep its exact label/spinner — when copying into the Checklist branch.)

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/pages/AssessmentAppendix.tsx src/App.tsx`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open an assessment appendix. Confirm: Facts page shows the FactsPanel; footer **Next** goes to `…/checklist`; the checklist page shows the table; footer **Previous** returns to Facts; **Confirm appendix** still goes to Structure. The stepper shows a single **Appendix** dot on both.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): split into Facts + Checklist sub-pages"
```

---

## Task 6: Skip toggle on each page

**Files:**
- Modify: `src/pages/AssessmentAppendix.tsx` (header control + handler + skipped banner)

- [ ] **Step 1: Import the client call**

In `src/pages/AssessmentAppendix.tsx`, add `setAppendixSkip` to the existing import from `@/lib/appendix/client`:

```ts
import {
  loadAppendix, startAppendixGeneration, pollAppendixUntilReady, saveRowEdit, confirmAppendix, saveFacts, setAppendixSkip,
} from '@/lib/appendix/client';
```

Add `EyeOff` and `Eye` to the lucide import line:

```ts
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Eye, EyeOff } from 'lucide-react';
```

- [ ] **Step 2: Add the skip handler + derived flag**

Just before `return (` in the render body, add:

```tsx
  const skipped = page === 'facts' ? !!appendix.facts_skipped : !!appendix.checklist_skipped;
  const handleToggleSkip = async () => {
    if (!appendix) return;
    const next = !skipped;
    setAppendix({ ...appendix, ...(page === 'facts' ? { facts_skipped: next } : { checklist_skipped: next }) }); // optimistic
    try {
      await setAppendixSkip(appendix.id, page, next);
    } catch (e) {
      toast.error('Could not update skip', { description: String(e) });
    }
  };
```

- [ ] **Step 3: Add the toolbar skip control + skipped banner**

In the top toolbar `div` (the one that currently holds only the Regenerate button), add the skip toggle to the left of Regenerate, and a skipped banner above the panel. Replace the toolbar block with:

```tsx
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleToggleSkip}>
          {skipped ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {skipped ? 'Unskip page' : 'Skip page'}
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerate
        </Button>
      </div>

      {skipped && (
        <p className="rounded-md border border-[hsl(var(--border-subtle))] bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This page is skipped and will be left out of the report. The content is kept and can be restored with Unskip.
        </p>
      )}
```

- [ ] **Step 4: Dim the panel when skipped**

Wrap the conditional `page === 'facts' ? <FactsPanel/> : <AppendixTable/>` (from Task 5 Step 3) in a dimming wrapper:

```tsx
      <div className={skipped ? 'opacity-60' : undefined}>
        {page === 'facts' ? (
          <FactsPanel
            facts={factsToShow}
            onChange={appendix?.facts ? handleFactsChange : undefined}
            generated={!!appendix?.facts}
          />
        ) : (
          <AppendixTable rows={appendix.rows} skeleton={skeleton} showSources={showSources} relatedParties={relatedParties} onEdit={handleEdit} onToggleExclude={handleToggleExclude} />
        )}
      </div>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/pages/AssessmentAppendix.tsx`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`. On the Facts page, click **Skip page**: the banner appears, the panel dims, the label flips to **Unskip page**. Reload: the skip persists. Repeat on the Checklist page independently. Confirm the appendix, generate the report, and verify a skipped page is absent from the memo (Facts-skipped → no `<facts>`; Checklist-skipped → no `<confirmed_appendix>`).

- [ ] **Step 7: Commit**

```bash
git add src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): per-page Skip toggle"
```

---

## Task 7: Full test sweep + deploy note

**Files:** none (verification only)

- [ ] **Step 1: Run the appendix + structure suites**

Run: `npx vitest run src/lib/appendix src/lib/structure`
Expected: all pass (including the new `appendixMemoBlock` tests).

- [ ] **Step 2: Typecheck + lint the whole touched set**

Run: `npx tsc --noEmit && npx eslint src/pages/AssessmentAppendix.tsx src/pages/AssessmentReport.tsx src/App.tsx src/lib/appendix/buildAppendixBlock.ts src/lib/appendix/client.ts`
Expected: no errors.

- [ ] **Step 3: Apply the migration on the VM (deploy)**

The new columns must exist before the frontend that reads them goes live. Apply on the VM as `supabase_admin` (no edge-function change needed):

```bash
az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 \
  --command-id RunShellScript --scripts @<a one-off script that pipes
  supabase/migrations/20260609230000_appendix_page_skip.sql into psql -U supabase_admin>
```

Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='atad2_appendix' AND column_name IN ('facts_skipped','checklist_skipped');` returns both rows. (This is a deploy action — run only on explicit request, per project policy.)

---

## Out of scope (per spec)

- No whole-appendix single skip (per-page only).
- No edge-function / prompt changes.
- `printAppendix` skip-flag handling is deferred (no UI currently triggers it).
- No per-sub-page resume URL (resume lands on Facts, the default route).

---

## Self-review notes

- **Spec coverage:** split (Task 5), one stepper dot (no steps.ts change — sub-route maps to step 4), skip per page (Tasks 1/3/6), skip omits from memo (Tasks 2/4), reversible + kept generated (Task 6 optimistic + setAppendixSkip), migration + types (Task 1), tests (Task 2 + Task 7). All covered.
- **Type consistency:** `appendixMemoBlock(appendix, skeleton)`, `setAppendixSkip(appendixId, page, skipped)`, `StoredAppendix.facts_skipped/checklist_skipped`, and the `page: 'facts' | 'checklist'` prop are used identically across tasks.
- **Placeholders:** none — every code step shows the actual code.
