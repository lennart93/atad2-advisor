# Structure Chart Loading & Framing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the structure-chart UX: pre-fetch on Q&A finish, Atlas-branded timeline-loader during extraction, outlined Step 5 page-frame with aggressive `fitView`, plus two bug fixes (406 polling, defensive re-layout).

**Architecture:** Six small changes to existing files, one new component (`AtlasLoader.tsx`). No new dependencies. No data-model changes. No new unit tests required (all changes are UI/integration; existing 46 tests stay green).

**Tech Stack:** Existing React + Vite + TS + Tailwind + `@xyflow/react` 12.10.2 + Supabase client. Reuses existing `<AnimatedLogo>` and `startExtraction()`.

**Spec:** [docs/superpowers/specs/2026-05-08-structure-chart-loading-and-framing-design.md](../specs/2026-05-08-structure-chart-loading-and-framing-design.md). Read first.

**Project rules (CRITICAL):**
- **NEVER `git commit` or `git push`.** Each task ends with a "Commit (when user asks)" step — only run when prompted.
- **`main` is live production.**
- **All UI strings must be English.**

---

## File Structure

### New
```
src/components/structure/AtlasLoader.tsx         // ~80 lines, dumb display component
```

### Modified
```
src/lib/structure/client.ts                      // .single() → .maybeSingle() in refreshChartStatus
src/pages/Assessment.tsx                         // finishAssessment fires startExtraction (fire-and-forget)
src/components/structure/StructureChartStep.tsx  // page frame + AtlasLoader + defensive re-layout
src/components/structure/StructureChart.tsx      // fitView opts: padding 0.05, minZoom 0.3
```

### Deleted
None.

---

## Task index

| # | Task | Files |
|---|---|---|
| 1 | Fix 406 polling — `.single()` → `.maybeSingle()` | `client.ts` |
| 2 | Pre-fetch — `finishAssessment` fires `startExtraction` | `Assessment.tsx` |
| 3 | New `AtlasLoader.tsx` component | `AtlasLoader.tsx` (new) |
| 4 | `StructureChart.tsx` — aggressive `fitView` opts | `StructureChart.tsx` |
| 5 | `StructureChartStep.tsx` — page-frame, render `AtlasLoader`, defensive re-layout | `StructureChartStep.tsx` |
| 6 | Local verification + manual smoke | none |

---

## Task 1: Fix 406 polling — `.single()` → `.maybeSingle()`

**Files:**
- Modify: `src/lib/structure/client.ts`

- [ ] **Step 1: Read the function** to confirm exact current state.

```bash
grep -n "refreshChartStatus" "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor/src/lib/structure/client.ts"
```

Expected to find a function shaped like:

```ts
export async function refreshChartStatus(chartId: string) {
  const { data } = await supabase
    .from('atad2_structure_charts')
    .select('status, warnings, draft_extracted_at')
    .eq('id', chartId)
    .single();
  return data;
}
```

- [ ] **Step 2: Change `.single()` to `.maybeSingle()`**

Use Edit tool to change exactly:

```ts
    .eq('id', chartId)
    .single();
```

to:

```ts
    .eq('id', chartId)
    .maybeSingle();
```

(Just the method name; no other changes.)

- [ ] **Step 3: Compile-check + tests**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
npm test
```

Expected: zero TS errors, 46 tests pass (no new tests, no broken tests).

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/lib/structure/client.ts
git commit -m "fix(structure): use maybeSingle for refreshChartStatus to avoid 406s"
```

---

## Task 2: Pre-fetch — `finishAssessment` fires `startExtraction`

**Files:**
- Modify: `src/pages/Assessment.tsx`

- [ ] **Step 1: Locate `finishAssessment`**

```bash
grep -n "finishAssessment" "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor/src/pages/Assessment.tsx"
```

The function should be findable around line ~564 (per recent debug logs the user shared). It calls `navigate(`/assessment/structure/${sessionId}`)` after persisting the final answer + marking the session completed.

- [ ] **Step 2: Add the import**

Open `Assessment.tsx`. Near the existing import block, add (only if not already imported):

```ts
import { startExtraction } from '@/lib/structure/extraction';
```

- [ ] **Step 3: Fire `startExtraction` before `navigate`**

Find the `navigate(\`/assessment/structure/${sessionId}\`)` line inside `finishAssessment`. Just before that line, add:

```ts
    // Pre-fetch the structure-chart extraction so the user doesn't wait on Step 5.
    // Fire-and-forget; if this fails, Step 5 will start its own extraction as fallback.
    startExtraction(sessionId).catch((err) => {
      console.warn('[Assessment] Pre-fetch extraction failed; Step 5 will retry', err);
    });
```

The result should look like:

```ts
    // ... existing finishAssessment logic ...
    startExtraction(sessionId).catch((err) => {
      console.warn('[Assessment] Pre-fetch extraction failed; Step 5 will retry', err);
    });
    navigate(`/assessment/structure/${sessionId}`);
```

- [ ] **Step 4: Compile-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: zero TS errors, build succeeds.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/pages/Assessment.tsx
git commit -m "feat(assess): pre-fetch structure-chart extraction on Q&A finish"
```

---

## Task 3: `AtlasLoader.tsx` — Atlas timeline-loader component

A dumb display component. Renders a rotating Atlas asterisk + a 4-step timeline checklist.

**Files:**
- Create: `src/components/structure/AtlasLoader.tsx`

- [ ] **Step 1: Create the file** with the exact content below:

```tsx
// src/components/structure/AtlasLoader.tsx
import { AnimatedLogo } from '@/components/AnimatedLogo';
import type { ChartStatus } from '@/lib/structure/types';

interface Props {
  status: ChartStatus | 'loading';
  /** From atad2_structure_charts.warnings — used to mark a stage as failed */
  warnings?: Array<{ stage: number; message: string }>;
  /** Optional richer detail; passed when the parent has counts */
  detail?: { entitiesFound?: number; etaSeconds?: number };
}

type Stage = 0 | 1 | 2 | 3 | 4;

function stageOf(status: ChartStatus | 'loading'): Stage {
  if (status === 'loading' || status === 'extracting:stage1') return 1;
  if (status === 'extracting:stage2') return 2;
  if (status === 'extracting:stage3') return 3;
  if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') return 4;
  return 0; // unknown / extraction_failed
}

interface RowProps {
  done?: boolean;
  active?: boolean;
  failed?: boolean;
  label: string;
  detail?: string;
}

function StageRow({ done, active, failed, label, detail }: RowProps) {
  const icon = failed ? '✗' : done ? '✓' : active ? '●' : '○';
  const iconColor = failed
    ? 'text-red-600'
    : done
    ? 'text-emerald-600'
    : active
    ? 'text-amber-600 animate-pulse'
    : 'text-neutral-300';
  const labelColor = active
    ? 'font-semibold text-neutral-900'
    : done
    ? ''
    : failed
    ? 'text-neutral-500'
    : 'text-neutral-400';
  return (
    <li className="flex items-start gap-2.5">
      <span className={`font-bold w-4 flex-shrink-0 ${iconColor}`}>{icon}</span>
      <div>
        <div className={labelColor}>{label}</div>
        {detail && <div className="text-xs text-neutral-400 mt-0.5">{detail}</div>}
      </div>
    </li>
  );
}

export function AtlasLoader({ status, warnings = [], detail }: Props) {
  const stage = stageOf(status);
  const hasFailedStage = (n: number) => warnings.some((w) => w.stage === n);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <AnimatedLogo state="working" size={36} className="opacity-35" />
      <div className="text-sm font-bold tracking-tight text-neutral-900">
        Preparing your structure chart…
      </div>
      <ul className="space-y-1.5 text-sm text-neutral-600 min-w-80">
        <StageRow
          done={stage >= 1}
          active={stage === 0}
          label="Reading uploaded documents"
        />
        <StageRow
          done={stage >= 2}
          active={stage === 1}
          failed={hasFailedStage(1)}
          label="Extracting legal entities"
          detail={
            detail?.entitiesFound != null
              ? `${detail.entitiesFound} entities found`
              : undefined
          }
        />
        <StageRow
          done={stage >= 3}
          active={stage === 2}
          failed={hasFailedStage(2)}
          label="Mapping ownership relationships"
          detail={
            detail?.etaSeconds != null && stage === 2
              ? `about ${detail.etaSeconds} seconds remaining`
              : undefined
          }
        />
        <StageRow
          done={stage === 4}
          active={stage === 3}
          failed={hasFailedStage(3)}
          label="Analyzing transactions for ATAD2 mismatches"
        />
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Compile-check**

```bash
npx tsc --noEmit
```

Expected: zero TS errors. If the import of `AnimatedLogo` fails, confirm the file exists at `src/components/AnimatedLogo.tsx` with a default-export-friendly named export.

- [ ] **Step 3: Commit (when user asks)**

```bash
git add src/components/structure/AtlasLoader.tsx
git commit -m "feat(structure): AtlasLoader — Atlas-branded timeline loader"
```

---

## Task 4: `StructureChart.tsx` — aggressive `fitView` opts

**Files:**
- Modify: `src/components/structure/StructureChart.tsx`

- [ ] **Step 1: Locate the `fitView` call**

```bash
grep -n "fitView" "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor/src/components/structure/StructureChart.tsx"
```

Should find a call like:

```tsx
reactFlow.fitView({ padding: 0.08, minZoom: 0.4, maxZoom: 1.0, duration: 250 }),
```

inside a `useEffect` that runs on position-signature changes.

- [ ] **Step 2: Update opts**

Change the call to:

```tsx
reactFlow.fitView({ padding: 0.05, minZoom: 0.3, maxZoom: 1.0, duration: 250 }),
```

(Only `padding` and `minZoom` change.)

- [ ] **Step 3: Compile-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: zero TS errors, build succeeds.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/StructureChart.tsx
git commit -m "feat(structure): tighter fitView (padding 0.05, minZoom 0.3)"
```

---

## Task 5: `StructureChartStep.tsx` — page-frame, render `AtlasLoader`, defensive re-layout

The biggest change: outer page-frame with white card + light grey background; conditionally render `<AtlasLoader>` while extracting; defensive re-layout if positions look broken on load.

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`

- [ ] **Step 1: Read the file** to refresh on its current shape.

```bash
sed -n '1,30p' "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor/src/components/structure/StructureChartStep.tsx"
```

It currently imports `useCallback, useEffect, useMemo, useState` from React, plus various structure helpers. The component returns:

```tsx
<div className="flex flex-col h-screen bg-white">
  <header>...</header>
  <main className="relative flex-1 min-h-0">
    <StructureChart .../>
    <FloatingPalette .../>
    <FloatingInspector .../>
    <FloatingToolbar .../>
  </main>
</div>
```

- [ ] **Step 2: Add `AtlasLoader` import**

At the top of `StructureChartStep.tsx`, add:

```tsx
import { AtlasLoader } from './AtlasLoader';
import { AnimatedLogo } from '@/components/AnimatedLogo';
```

(`AnimatedLogo` is for the failed-state error screen, see Step 6 below.)

- [ ] **Step 3: Add the defensive re-layout helper + invocation**

Just below the existing `visibleEdges` `useMemo` (the orphan filter that produces `visibleEntities` / `visibleEdges`), add a helper and a `useEffect`:

```tsx
  // Defensive: if visible entities all share the same position (e.g., stale
  // (0,0) values from a pre-tierLayout broken run), force a layout pass right
  // after load. The normal layout-on-data-change effect already runs, but this
  // guarantees the *first* render shows correct positions instead of a brief
  // pile-up.
  const positionsLookBroken = useMemo(() => {
    if (visibleEntities.length < 2) return false;
    const first = visibleEntities[0];
    const allSame = visibleEntities.every(
      (e) => e.position_x === first.position_x && e.position_y === first.position_y,
    );
    if (allSame) return true;
    return visibleEntities.every((e) => e.position_x === 0 && e.position_y === 0);
  }, [visibleEntities]);

  useEffect(() => {
    if (!chart) return;
    if (!positionsLookBroken) return;
    // Only re-layout when extraction is finished — during extraction the
    // entities-arrive-stacked is normal and the existing layout effect handles it.
    const isExtracting = typeof status === 'string' && status.startsWith('extracting:');
    if (isExtracting) return;
    handleAutoLayout();
  }, [chart, positionsLookBroken, status, handleAutoLayout]);
```

This sits next to the existing layout effect; `handleAutoLayout` is already a `useCallback` in scope.

- [ ] **Step 4: Compute `showLoader` near the existing handlers**

Inside the component, just before the `return (` block, add:

```tsx
  const isExtracting = typeof status === 'string' && status.startsWith('extracting:');
  const isFailed = status === 'extraction_failed';
  const showLoader = status === 'loading' || isExtracting;
```

- [ ] **Step 5: Replace the root JSX with the page-frame**

Replace the existing root markup (the outer `<div className="flex flex-col h-screen bg-white">` block) with the framed version. Note the `<main>` now conditionally renders the loader vs. the chart:

```tsx
  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="bg-white border border-neutral-300 rounded-xl shadow-sm overflow-hidden">
        <header className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Step 5 · Review structure chart</h1>
            <p className="text-xs text-neutral-500">
              Review the AI-generated draft, edit as needed, then continue to the report.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Back
            </Button>
            <Button onClick={goNext} disabled={status === 'loading' || isExtracting}>
              Next
            </Button>
          </div>
        </header>

        <main className="relative h-[calc(100vh-8rem)]">
          {showLoader ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <AtlasLoader
                status={status}
                warnings={
                  (chart?.warnings as Array<{ stage: number; message: string }>) ?? []
                }
                detail={{ entitiesFound: visibleEntities.length || undefined }}
              />
            </div>
          ) : isFailed ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
                <AnimatedLogo state="idle" size={36} className="opacity-35" />
                <div className="text-sm font-bold">Extraction failed</div>
                <p className="text-xs text-neutral-500">
                  {(chart?.warnings as Array<{ stage: number; message: string }> | undefined)?.[0]?.message ?? 'Unknown error.'}
                </p>
                <Button onClick={handleReExtract}>Try again</Button>
              </div>
            </div>
          ) : (
            <>
              <StructureChart
                entities={visibleEntities}
                edges={visibleEdges}
                clusterNodes={clusterNodes}
                onSelectionChange={setSelection}
                onNodePositionEnd={(id, x, y) => {
                  setEntities((prev) =>
                    prev.map((e) =>
                      e.id === id ? { ...e, position_x: x, position_y: y } : e,
                    ),
                  );
                  updateEntityPosition(id, x, y);
                }}
                onConnect={handleConnect}
              />

              <FloatingPalette onAdd={handleAddEntity} />

              <FloatingInspector
                selectedEntity={selectedEntity}
                selectedEdge={selectedEdge}
                onEntityChange={updateSelectedEntity}
                onEntityDelete={deleteSelectedEntity}
                onEdgeChange={updateSelectedEdge}
                onEdgeDelete={deleteSelectedEdge}
                onClose={() => setSelection(null)}
              />

              <FloatingToolbar
                status={typeof status === 'string' ? status : ''}
                entityCount={visibleEntities.length}
                ownershipCount={visibleEdges.filter((e) => e.kind === 'ownership').length}
                transactionCount={visibleEdges.filter((e) => e.kind === 'transaction').length}
                onAutoLayout={handleAutoLayout}
                onReExtract={handleReExtract}
                onExportPptx={() => {
                  const modulePath = /* @vite-ignore */ './exports/exportToPptx';
                  import(/* @vite-ignore */ modulePath)
                    .then(
                      (m: {
                        exportToPptx: (opts: {
                          entities: StructureEntity[];
                          edges: StructureEdge[];
                          taxpayerName: string;
                        }) => void;
                      }) =>
                        m.exportToPptx({
                          entities: visibleEntities,
                          edges: visibleEdges,
                          taxpayerName: '',
                        }),
                    )
                    .catch((err) => console.error(err));
                }}
                busy={busy}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
```

Note key changes vs current state:
- Outer `bg-neutral-50 p-6` ambient
- White card with `border border-neutral-300 rounded-xl shadow-sm`
- `<main>` height pinned: `h-[calc(100vh-8rem)]`
- Conditional render: `showLoader` → `<AtlasLoader>`, `isFailed` → error state, else → chart + floating overlays
- All four header strings remain English

- [ ] **Step 6: Compile-check + tests + build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 46 tests pass, build succeeds.

- [ ] **Step 7: Commit (when user asks)**

```bash
git add src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): outlined page-frame + AtlasLoader + defensive re-layout"
```

---

## Task 6: Local verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run all checks**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 46 tests pass, build succeeds.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Manual smoke checklist**

Open the running app in a browser, sign in, navigate to a session in progress.

1. **Pre-fetch fires on finish**: open DevTools → Network. Complete the Q&A. On clicking "Finish assessment", a `POST /functions/v1/extract-structure` should be visible BEFORE the URL changes to `/assessment/structure/...`.
2. **AtlasLoader renders**: Step 5 page loads. While `chart.status` is in `extracting:*`, the canvas region shows the centered AtlasLoader: rotating Atlas asterisk (36px, opacity 0.35), four-stage timeline. Stage transitions match polling status updates.
3. **No 406 in console**: while polling runs, the network tab shows 200s on `?id=eq...` queries; no 406 errors.
4. **Layout correct on first render**: when `status` reaches `draft_ready`, the chart renders with NO entity pile-up (above OR below taxpayer). All visible entities are spread out in horizontal tiers.
5. **Page-frame visible**: outer `bg-neutral-50` background visible at the page edges; white card with subtle border + shadow contains the header and the canvas. Header has clear separator line below it.
6. **fitView fits**: chart of 50+ entities is fully visible without manual zoom-out. Small charts don't get absurd up-scaling.
7. **Re-extract clean**: click Re-extract → AtlasLoader reappears → completes → chart re-renders.
8. **Failed state**: (force this by killing the Edge Function or sending a malformed prompt) → "Extraction failed" panel with "Try again" button visible.

- [ ] **Step 4: Document any deviations**

If any item above doesn't behave as expected, capture a screenshot + DevTools console + network details. That becomes the next iteration's input.

---

## Self-Review

### Spec coverage
| Spec section | Implemented in |
|---|---|
| §3 In MVP-3.5 — 406 fix | Task 1 |
| §3 In MVP-3.5 — defensive re-layout | Task 5 (Step 3) |
| §3 In MVP-3.5 — pre-fetch | Task 2 |
| §3 In MVP-3.5 — Atlas timeline-loader | Task 3 (component) + Task 5 (render) |
| §3 In MVP-3.5 — Step 5 framing | Task 5 (Step 5) |
| §3 In MVP-3.5 — aggressive `fitView` | Task 4 |
| §3 Out-of-scope items | Acknowledged, no tasks |
| §4 Bug fixes | Tasks 1, 5 |
| §5 Pre-fetch | Task 2 |
| §6 AtlasLoader component shape | Task 3 (full code listing) |
| §7 Page frame | Task 5 (Step 5) |
| §8 fitView opts | Task 4 |
| §11 Manual smoke test | Task 6 |

### Placeholder scan
- No "TBD" / "TODO" / "implement later" left.
- Every code step shows actual code.
- Every command step shows the actual command + expected output.

### Type-name consistency
- `AtlasLoader` import path `./AtlasLoader` consistent in Tasks 3 & 5.
- `AnimatedLogo` named import consistent in both Task 3 (within `AtlasLoader.tsx`) and Task 5 (failed-state JSX).
- `startExtraction` import path `@/lib/structure/extraction` consistent.
- `ChartStatus` type imported in Task 3 from `@/lib/structure/types` — already exported there.
- `chart.warnings` cast as `Array<{ stage: number; message: string }>` in both the loader-render and the failed-state JSX — consistent shape.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-structure-chart-loading-and-framing.md`.**

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. 6 tasks, each touching 1-2 files, fits subagent flow well.

**2. Inline Execution** — execute in this session via the executing-plans skill, batched with checkpoints.

Which approach?
