# Structure Chart Loading & Framing — Design Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorm → spec)
**Builds on:**
- `docs/superpowers/specs/2026-05-07-corporate-structure-chart-design.md` (MVP-1)
- `docs/superpowers/specs/2026-05-08-structure-chart-layout-upgrade-design.md` (MVP-2 ELK + clusters + floating panels)
- `docs/superpowers/specs/2026-05-08-structure-chart-big4-redesign-design.md` (parked Big4-rewrite — most still on the shelf; subset shipped via `tierLayout`)
**Owner:** Lennart Wilming

## 1. Goal

Polish the structure-chart's loading and framing UX:

- Eliminate the wait by starting extraction earlier (when the user finishes the Q&A, not when they arrive on Step 5).
- Replace the silent blank-canvas wait with an Atlas-branded timeline-loader showing real progress.
- Frame Step 5 as a clearly outlined page that fills the viewport, with an aggressive `fitView` so charts of any size land in view.
- Fix two outstanding bugs: 406 errors on chart-status polling, and the above-taxpayer pile-up users still hit on some charts.

## 2. Why this matters

Three real frustrations from user testing on the live deploy:

1. **30–60 s of blank wait** after clicking Next on the last Q&A. The Edge Function only starts when the structure-chart page loads. The user stares at a blank canvas with no feedback.
2. **`406 Not Acceptable`** errors flood the console. `refreshChartStatus` uses Supabase's `.single()`, which 406s when 0 rows match. Polling crashes → "Extraction polling timed out" → user sees a perpetually-loading state even when the chart is actually fine.
3. **Above-taxpayer entities pile up at one position** on some charts. Below the taxpayer renders cleanly; above is a stack. Likely cached stale positions from a previous broken layout (pre-`tierLayout` fix), or a defensive-invalidation gap.

These are all UX-killing for what's otherwise a working feature. Pre-fetching reduces wait, the timeline-loader makes the unavoidable wait feel intentional, the page frame and `fitView` make first-impression chart legibility automatic, and the bug fixes get rid of the noise.

## 3. Scope

### In MVP-3.5 (this spec)
- **Bug fix · 406 polling**: change `.single()` to `.maybeSingle()` in `refreshChartStatus`.
- **Bug fix · above-taxpayer pile-up**: defensive re-layout on chart-load. If two-or-more visible entities have identical positions OR all visible entities have `(0,0)`, force `handleAutoLayout()` immediately on next render. Persists nothing extra in the DB; just a runtime safety net.
- **Pre-fetch**: `Assessment.tsx`'s `finishAssessment` fires `startExtraction(sessionId)` as fire-and-forget before navigating. Errors are logged and ignored — Step 5's normal extraction-or-load path handles fallback if pre-fetch failed.
- **Atlas timeline-loader**: new `AtlasLoader.tsx` component shown while `chart.status` starts with `extracting:`. Uses existing `<AnimatedLogo state="working" size={36} className="opacity-35" />`. Vertical checklist of four stages: Reading documents → Extracting entities → Mapping ownership → Analyzing transactions for ATAD2 mismatches.
- **Step 5 framing**: `StructureChartStep` wraps everything in an outer `bg-neutral-50` div with a white outlined card containing header + canvas. `<main>` has explicit `h-[calc(100vh-8rem)]` so the canvas always takes the rest of the viewport.
- **Aggressive `fitView`**: `padding: 0.05`, `minZoom: 0.3`, `maxZoom: 1.0` (was 0.08, 0.4, 1.0). Charts of 50+ entities now zoom-out to fit; small charts zoom in only up to 1.0 (no absurd up-scaling).

### Explicitly out of scope (deferred)
- Big4-style strict tier headers (`UBO` / `UPE` / `Parents` / `Taxpayer` / `Tier +1`) — still on the parked plan
- Aggressive subtree clustering (cluster ENTIRE non-relevant subtrees) — still on the parked plan
- Step-edges, individuals as colored box, jurisdiction swimlanes — also parked
- Server-side pre-rendering (extraction at session-create time) — out of scope
- Persisting cluster expand/collapse across sessions — out of scope

## 4. Bug fixes

### 4.1 `406 Not Acceptable` from `refreshChartStatus`

**Root cause:** `client.ts:refreshChartStatus` does:

```ts
const { data } = await supabase
  .from('atad2_structure_charts')
  .select('status, warnings, draft_extracted_at')
  .eq('id', chartId)
  .single();
```

`.single()` returns 406 if 0 rows match (or >1, but that's prevented by `id` PK). The chart_id may be stale (e.g., user navigated away mid-create) or the row hasn't been inserted yet because of a race between the Edge Function's first response and the polling.

**Fix:** change `.single()` to `.maybeSingle()`. The function returns `null` instead of throwing 406. Callers already handle `null` (the `pollUntilTerminal` loop checks `if (data)`).

```ts
const { data } = await supabase
  .from('atad2_structure_charts')
  .select('status, warnings, draft_extracted_at')
  .eq('id', chartId)
  .maybeSingle();
```

### 4.2 Above-taxpayer pile-up

**Root cause (working hypothesis):** stored `position_x` / `position_y` values from a pre-`tierLayout` broken run survive in the DB. On chart-load, `tierLayout` runs and updates positions for connected entities, but a brief render-window shows the stale values before the new ones land. Or: a subset of entities don't get visited by the BFS for a chart-shape we haven't tested.

**Fix:** defensive invalidation in `StructureChartStep.tsx`. After `loadChart` returns and on every poll-driven `setEntities`, check:

```ts
function positionsLookBroken(entities: StructureEntity[]): boolean {
  if (entities.length < 2) return false;
  const first = entities[0];
  const allSame = entities.every(
    (e) => e.position_x === first.position_x && e.position_y === first.position_y,
  );
  if (allSame) return true;
  const allZero = entities.every((e) => e.position_x === 0 && e.position_y === 0);
  return allZero;
}
```

If `positionsLookBroken` is true and `chart` is not `extracting:*`, call `handleAutoLayout()` once. (We already always re-run layout on entity changes, but this ensures the synchronous update happens before the first render commits.)

If after this fix the user still sees pile-up, add a temporary console.debug log in `assignRanks` printing entity-id → rank mapping. We can investigate from there.

## 5. Pre-fetch on Q&A finish

`src/pages/Assessment.tsx` has a `finishAssessment` function that:
1. Saves the last answer
2. Marks the session completed
3. Navigates to `/assessment/structure/:sessionId`

Add step 2.5: fire-and-forget call to `startExtraction(sessionId)`. The function is already exported from `src/lib/structure/extraction.ts`.

```ts
// in Assessment.tsx finishAssessment:
import { startExtraction } from '@/lib/structure/extraction';
// ...
// After session-update succeeds, kick off extraction in the background.
startExtraction(sessionId).catch((err) => {
  // Pre-fetch is best-effort. Step 5 will retry if the chart isn't there.
  console.warn('Pre-fetch extraction failed; Step 5 will retry', err);
});
navigate(`/assessment/structure/${sessionId}`);
```

The Edge Function is idempotent — if Step 5 also calls `startExtraction` (because pre-fetch silently failed), the second call deletes `ai_extracted` rows from the first attempt and re-runs. No corruption.

**Race condition handling**: if the user arrives at Step 5 before the chart row exists in DB (extraction hasn't yet inserted the chart), `loadChart` returns `null`. Existing code path then calls `startExtraction` again. With `.maybeSingle()` (fix 4.1), polling on a not-yet-inserted chart_id returns `null` rather than 406, and the loop continues. Safe.

## 6. Atlas timeline-loader

### 6.1 Component shape

`src/components/structure/AtlasLoader.tsx`:

```tsx
import { AnimatedLogo } from '@/components/AnimatedLogo';
import type { ChartStatus } from '@/lib/structure/types';

interface Props {
  status: ChartStatus | 'loading';
  /** From atad2_structure_charts.warnings — used to mark a stage as failed */
  warnings?: Array<{ stage: number; message: string }>;
  /** Optional richer detail per stage; passed when the parent has counts */
  detail?: { entitiesFound?: number; etaSeconds?: number };
}

export function AtlasLoader({ status, warnings = [], detail }: Props) {
  const stage = stageOf(status); // 0|1|2|3|4   (0=initial, 4=done)
  const hasFailedStage = (n: number) => warnings.some((w) => w.stage === n);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <AnimatedLogo state="working" size={36} className="opacity-35" />
      <div className="text-sm font-bold tracking-tight text-neutral-900">
        Preparing your structure chart…
      </div>
      <ul className="space-y-1.5 text-sm text-neutral-600 min-w-80">
        <StageRow done={stage >= 1} active={stage === 0} label="Reading uploaded documents" />
        <StageRow
          done={stage >= 2}
          active={stage === 1}
          failed={hasFailedStage(1)}
          label="Extracting legal entities"
          detail={detail?.entitiesFound != null ? `${detail.entitiesFound} entities found` : undefined}
        />
        <StageRow
          done={stage >= 3}
          active={stage === 2}
          failed={hasFailedStage(2)}
          label="Mapping ownership relationships"
          detail={detail?.etaSeconds != null && stage === 2 ? `about ${detail.etaSeconds} seconds remaining` : undefined}
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

function stageOf(status: ChartStatus | 'loading'): 0 | 1 | 2 | 3 | 4 {
  if (status === 'loading' || status === 'extracting:stage1') return 1;
  if (status === 'extracting:stage2') return 2;
  if (status === 'extracting:stage3') return 3;
  if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') return 4;
  return 0; // unknown / extraction_failed
}

function StageRow({ done, active, failed, label, detail }: {
  done?: boolean;
  active?: boolean;
  failed?: boolean;
  label: string;
  detail?: string;
}) {
  const icon = failed ? '✗' : done ? '✓' : active ? '●' : '○';
  const iconColor = failed
    ? 'text-red-600'
    : done
    ? 'text-emerald-600'
    : active
    ? 'text-amber-600 animate-pulse'
    : 'text-neutral-300';
  return (
    <li className="flex items-start gap-2.5">
      <span className={`font-bold w-4 flex-shrink-0 ${iconColor}`}>{icon}</span>
      <div>
        <div className={active ? 'font-semibold text-neutral-900' : done ? '' : 'text-neutral-400'}>
          {label}
        </div>
        {detail && <div className="text-xs text-neutral-400 mt-0.5">{detail}</div>}
      </div>
    </li>
  );
}
```

### 6.2 Where it renders

In `StructureChartStep.tsx`, the canvas region:

```tsx
<main className="relative h-[calc(100vh-8rem)]">
  {showLoader ? (
    <div className="absolute inset-0 flex items-center justify-center bg-white">
      <AtlasLoader
        status={status}
        warnings={chart?.warnings as Array<{ stage: number; message: string }>}
        detail={{ entitiesFound: entities.length || undefined }}
      />
    </div>
  ) : (
    <>
      <StructureChart .../>
      <FloatingPalette .../>
      <FloatingInspector .../>
      <FloatingToolbar .../>
    </>
  )}
</main>
```

Where `showLoader = status === 'loading' || status?.startsWith('extracting:')`.

When `extraction_failed`, swap the loader for a centered error block:

```tsx
<div className="absolute inset-0 flex items-center justify-center bg-white">
  <div className="flex flex-col items-center gap-3 text-center max-w-md">
    <AnimatedLogo state="idle" size={36} className="opacity-35" />
    <div className="text-sm font-bold">Extraction failed</div>
    <p className="text-xs text-neutral-500">{chart?.warnings?.[0]?.message ?? 'Unknown error'}</p>
    <Button onClick={handleReExtract}>Try again</Button>
  </div>
</div>
```

## 7. Step 5 framing

`StructureChartStep.tsx`'s root markup changes from:

```tsx
<div className="flex flex-col h-screen bg-white">
  <header>...</header>
  <main className="relative flex-1 min-h-0">...</main>
</div>
```

to:

```tsx
<div className="min-h-screen bg-neutral-50 p-6">
  <div className="bg-white border border-neutral-300 rounded-xl shadow-sm overflow-hidden">
    <header className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between">
      ...
    </header>
    <main className="relative h-[calc(100vh-8rem)]">
      ...
    </main>
  </div>
</div>
```

- `bg-neutral-50` outer = light grey ambient
- `bg-white border rounded-xl shadow-sm` inner = the page card
- `p-6` outer = 24px margin all around
- `h-[calc(100vh-8rem)]` on `<main>` = viewport height minus the header (~80px) and outer padding — gives the chart maximum vertical room.

## 8. Aggressive `fitView`

In `src/components/structure/StructureChart.tsx`, the existing position-signature `useEffect` calls `reactFlow.fitView(...)`. Update opts:

```ts
reactFlow.fitView({ padding: 0.05, minZoom: 0.3, maxZoom: 1.0, duration: 250 });
```

(Was `padding: 0.08, minZoom: 0.4, maxZoom: 1.0`.) This:
- Lets 50+ entity charts zoom out enough to show everything
- Tightens the surrounding whitespace
- Caps zoom-in at 1.0 to prevent absurd upscale on small charts

## 9. Files

### New
```
src/components/structure/AtlasLoader.tsx                        // ~80 lines, dumb display component
```

### Modified
```
src/lib/structure/client.ts                                     // .single() → .maybeSingle() in refreshChartStatus
src/pages/Assessment.tsx                                        // finishAssessment fires startExtraction (fire-and-forget)
src/components/structure/StructureChartStep.tsx                 // page frame, AtlasLoader, defensive re-layout
src/components/structure/StructureChart.tsx                     // fitView opts: padding 0.05, minZoom 0.3
```

### Deleted
None.

## 10. Tests

`AtlasLoader` is a dumb display component (no logic worth unit-testing). The status→stage mapping (`stageOf`) is small enough to be inline-tested by the consumer; not test-worthy on its own.

`positionsLookBroken` helper added to `StructureChartStep` — small pure function, could be added to `tierLayout.ts` and unit-tested if desired. Spec leaves this optional; the manual smoke test in §11 covers it.

Existing 46 unit tests must remain green.

## 11. Manual smoke test

1. Fresh assessment, complete Q&A, click "Finish assessment".
2. **Pre-fetch verification**: in the network tab, observe a POST to `/functions/v1/extract-structure` fire **before** navigation. Step 5 page loads while extraction is mid-flight.
3. **Loader visible**: AtlasLoader appears centered in the canvas region. Atlas asterisk rotates at 36px / 35% opacity. Timeline shows correct stage progression as the polling updates `status`.
4. **No 406 errors** in the console during polling.
5. **Layout correct on first render**: when status reaches `draft_ready`, chart appears with NO entity pile-up (above OR below the taxpayer). Tiers are clearly separated.
6. **Page frame**: page is wrapped in a white card with subtle shadow on a light grey background. Header is clearly bounded above the canvas.
7. **Viewport fits**: even on a 50+ entity chart, the entire chart is visible without manual zoom-out.
8. **Re-extract retries cleanly**: clicking Re-extract → loader reappears → completes → chart re-renders.

## 12. Open follow-ups

- Big4 strict-tier visual upgrades (parked plan)
- Aggressive subtree clustering (parked plan)
- Per-stage retry on extraction failure (currently entire pipeline restarts)
- ETA estimation in `AtlasLoader.detail` (currently a placeholder; would need server-side timing tracking)

## 13. References

- Spec MVP-1: `docs/superpowers/specs/2026-05-07-corporate-structure-chart-design.md`
- Spec MVP-2: `docs/superpowers/specs/2026-05-08-structure-chart-layout-upgrade-design.md`
- Spec parked Big4 rewrite: `docs/superpowers/specs/2026-05-08-structure-chart-big4-redesign-design.md`
- Atlas brand asset: `public/lovable-uploads/new-logo.png` (do not change)
- Existing `AnimatedLogo` component: `src/components/AnimatedLogo.tsx`
