# Payment Flow Routing & Manual Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give payment flows (transaction bundles) their own lane-based orthogonal auto-routing with rounded corners and curved exit/entry stubs, plus a PowerPoint-style manual editing layer (drag segments/waypoints/endpoints/labels, add/remove waypoints, undo/redo, reset) that persists across sessions.

**Architecture:** A pure global routing pass (`flowRouting.ts`) computes orthogonal lane-routed paths for all visible transaction bundles. A new `PaymentFlowEdge` component replaces `TransactionBundleEdge` and renders those paths — auto-routed or hand-edited — with selection handles. Pure path operations (`pathOps.ts`) and an in-memory undo/redo stack (`useFlowEditHistory.ts`) back the editing layer. A new `atad2_structure_flow_routing` table persists hand-edited paths.

**Tech Stack:** Existing React 18 + TypeScript + Vite + `@xyflow/react` 12.10.2 + Supabase + vitest. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-14-payment-flow-routing-design.md](../specs/2026-05-14-payment-flow-routing-design.md). Read first.

**Project rules (CRITICAL):**
- **NEVER `git commit` or `git push`.** Commit steps below are preparation only — only run when the user explicitly asks.
- **`main` is live production.**
- **All UI strings must be English.**
- This builds on uncommitted MVP-3.8/3.9 work on branch `feat/document-prefill`. Stay on that branch.

---

## File Structure

### New
```
supabase/migrations/20260514100000_flow_routing.sql               // §5 table + RLS + trigger + grant
src/lib/structure/flowRouting.ts                                  // §3.2 pure routing pass
src/lib/structure/__tests__/flowRouting.test.ts                   // routing unit tests
src/components/structure/flowEditing/pathOps.ts                   // §4.3 pure path operations
src/lib/structure/__tests__/pathOps.test.ts                       // path-op unit tests
src/components/structure/flowEditing/useFlowEditHistory.ts        // §4.8 undo/redo
src/components/structure/edges/PaymentFlowEdge.tsx                // §3.3 + §4 custom edge + handles
```

### Modified
```
src/lib/structure/types.ts                                       // StructureFlowRouting type
src/lib/structure/client.ts                                      // flow-routing CRUD helpers
src/components/structure/StructureChart.tsx                      // routing pass, PaymentFlowEdge registration, selection/reconnect/grid
src/components/structure/StructureChartStep.tsx                  // load flow routing, persistence handlers, undo/redo wiring
src/components/structure/FloatingToolbar.tsx                     // Auto-arrange / Reset all / Toggle grid / Snap toggle
```

### Deleted
```
src/components/structure/edges/TransactionBundleEdge.tsx         // replaced by PaymentFlowEdge
```

---

## Task index

| # | Task | Files |
|---|---|---|
| 1 | DB migration: `atad2_structure_flow_routing` | migration SQL |
| 2 | `StructureFlowRouting` type + client CRUD | `types.ts`, `client.ts` |
| 3 | `flowRouting.ts` pure routing pass (TDD) | `flowRouting.ts` + test |
| 4 | `pathOps.ts` pure path operations (TDD) | `pathOps.ts` + test |
| 5 | `useFlowEditHistory.ts` undo/redo | `useFlowEditHistory.ts` |
| 6 | `PaymentFlowEdge` — rendering (path + label + popover) | `PaymentFlowEdge.tsx` |
| 7 | `PaymentFlowEdge` — selection + handles | `PaymentFlowEdge.tsx` |
| 8 | `PaymentFlowEdge` — drag interactions | `PaymentFlowEdge.tsx` |
| 9 | `StructureChart` integration | `StructureChart.tsx` |
| 10 | `StructureChartStep` persistence + undo/redo wiring | `StructureChartStep.tsx` |
| 11 | `FloatingToolbar` controls | `FloatingToolbar.tsx` |
| 12 | Verification + manual smoke | none |

---

## Task 1: DB migration — `atad2_structure_flow_routing`

**Files:**
- Create: `supabase/migrations/20260514100000_flow_routing.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260514100000_flow_routing.sql`:

```sql
-- Payment flow routing — persisted manual path edits per transaction bundle.
-- A row exists iff the flow has been hand-edited; auto flows have no row.

CREATE TABLE public.atad2_structure_flow_routing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id        uuid NOT NULL
                    REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  from_entity_id  uuid NOT NULL
                    REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  to_entity_id    uuid NOT NULL
                    REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  waypoints       jsonb NOT NULL DEFAULT '[]'::jsonb,
  label_position  jsonb,
  routing_mode    text NOT NULL DEFAULT 'manual'
                    CHECK (routing_mode IN ('auto','manual')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chart_id, from_entity_id, to_entity_id)
);
CREATE INDEX idx_structure_flow_routing_chart
  ON public.atad2_structure_flow_routing(chart_id);

CREATE TRIGGER trg_flow_routing_updated_at
  BEFORE UPDATE ON public.atad2_structure_flow_routing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.atad2_structure_flow_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_routing_select" ON public.atad2_structure_flow_routing FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "flow_routing_insert" ON public.atad2_structure_flow_routing FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "flow_routing_update" ON public.atad2_structure_flow_routing FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "flow_routing_delete" ON public.atad2_structure_flow_routing FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.atad2_structure_charts c
    JOIN public.atad2_sessions s ON s.session_id = c.session_id
    WHERE c.id = atad2_structure_flow_routing.chart_id AND s.user_id = auth.uid()
  ));

GRANT ALL ON public.atad2_structure_flow_routing TO service_role;
```

This mirrors the RLS pattern in `supabase/migrations/20260507100000_create_structure_chart_tables.sql`.

- [ ] **Step 2: Verify the SQL parses**

The migration runs against the self-hosted Supabase on deploy; locally just confirm there are no syntax typos by reading it once more. Do NOT apply it to production.

- [ ] **Step 3: Commit (when user asks)**

```bash
git add supabase/migrations/20260514100000_flow_routing.sql
git commit -m "feat(structure): atad2_structure_flow_routing table for payment flow routing"
```

---

## Task 2: `StructureFlowRouting` type + client CRUD

**Files:**
- Modify: `src/lib/structure/types.ts`
- Modify: `src/lib/structure/client.ts`

- [ ] **Step 1: Add the type to `types.ts`**

The Supabase-generated `Database` type won't include the new table until types are regenerated. Define the row type explicitly in `src/lib/structure/types.ts` (append after the other `Structure*` type aliases):

```ts
export interface FlowWaypoint {
  x: number;
  y: number;
}

export type FlowRoutingMode = 'auto' | 'manual';

export interface StructureFlowRouting {
  id: string;
  chart_id: string;
  from_entity_id: string;
  to_entity_id: string;
  waypoints: FlowWaypoint[];
  label_position: FlowWaypoint | null;
  routing_mode: FlowRoutingMode;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add CRUD helpers to `client.ts`**

Read `src/lib/structure/client.ts` first to match the existing helper style (the `supabase` import, error handling, return shapes). Then add:

```ts
import type { StructureFlowRouting } from './types';

export async function listFlowRouting(chart_id: string): Promise<StructureFlowRouting[]> {
  const { data, error } = await supabase
    .from('atad2_structure_flow_routing')
    .select('*')
    .eq('chart_id', chart_id);
  if (error) throw error;
  return (data ?? []) as StructureFlowRouting[];
}

export async function upsertFlowRouting(
  row: Pick<StructureFlowRouting, 'chart_id' | 'from_entity_id' | 'to_entity_id'> &
    Partial<Pick<StructureFlowRouting, 'waypoints' | 'label_position' | 'routing_mode'>>,
): Promise<StructureFlowRouting> {
  const { data, error } = await supabase
    .from('atad2_structure_flow_routing')
    .upsert(row, { onConflict: 'chart_id,from_entity_id,to_entity_id' })
    .select()
    .single();
  if (error) throw error;
  return data as StructureFlowRouting;
}

export async function deleteFlowRouting(
  chart_id: string,
  from_entity_id: string,
  to_entity_id: string,
): Promise<void> {
  const { error } = await supabase
    .from('atad2_structure_flow_routing')
    .delete()
    .eq('chart_id', chart_id)
    .eq('from_entity_id', from_entity_id)
    .eq('to_entity_id', to_entity_id);
  if (error) throw error;
}

export async function deleteAllFlowRouting(chart_id: string): Promise<void> {
  const { error } = await supabase
    .from('atad2_structure_flow_routing')
    .delete()
    .eq('chart_id', chart_id);
  if (error) throw error;
}
```

If `supabase` is imported under a different name in the file, use that. The `.from('atad2_structure_flow_routing')` call may produce a TS error because the generated `Database` type doesn't know the table — if so, cast: `supabase.from('atad2_structure_flow_routing' as never)`. Check whether other recently-added tables in this file use a cast and match that.

- [ ] **Step 3: Verify**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
```

Expected: zero TS errors.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/lib/structure/types.ts src/lib/structure/client.ts
git commit -m "feat(structure): StructureFlowRouting type + flow-routing CRUD client helpers"
```

---

## Task 3: `flowRouting.ts` pure routing pass (TDD)

**Files:**
- Create: `src/lib/structure/flowRouting.ts`
- Create: `src/lib/structure/__tests__/flowRouting.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/structure/__tests__/flowRouting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { routeFlows } from '../flowRouting';
import type { TransactionBundle } from '../bundleTransactions';

function bundle(from: string, to: string): TransactionBundle {
  return {
    bundleId: `${from}|${to}`,
    from_entity_id: from,
    to_entity_id: to,
    transactions: [],
    totalAmount: 100,
    hasMismatch: false,
  };
}

function rect(x: number, y: number) {
  return { x, y, width: 160, height: 100 };
}

describe('routeFlows — exit/entry side', () => {
  it('target right of source → exit right, entry left', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(0, 0)],
        ['b', rect(400, 0)],
      ]),
      tierBands: [{ topY: 0, bottomY: 100 }],
    });
    const f = r.get('a|b')!;
    expect(f.exitSide).toBe('right');
    expect(f.entrySide).toBe('left');
  });

  it('target left of source → exit left, entry right', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(400, 0)],
        ['b', rect(0, 0)],
      ]),
      tierBands: [{ topY: 0, bottomY: 100 }],
    });
    const f = r.get('a|b')!;
    expect(f.exitSide).toBe('left');
    expect(f.entrySide).toBe('right');
  });
});

describe('routeFlows — path geometry', () => {
  it('produces an orthogonal path (each segment is H or V)', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(0, 0)],
        ['b', rect(400, 300)],
      ]),
      tierBands: [
        { topY: 0, bottomY: 100 },
        { topY: 300, bottomY: 400 },
      ],
    });
    const f = r.get('a|b')!;
    expect(f.points.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < f.points.length; i++) {
      const p = f.points[i - 1];
      const q = f.points[i];
      const horizontal = Math.abs(p.y - q.y) < 0.01;
      const vertical = Math.abs(p.x - q.x) < 0.01;
      expect(horizontal || vertical).toBe(true);
    }
  });

  it('does not route through a non-endpoint entity box', () => {
    // a (top) → c (bottom), with b sitting directly between them.
    const r = routeFlows({
      bundles: [bundle('a', 'c')],
      entityRects: new Map([
        ['a', rect(200, 0)],
        ['b', rect(200, 200)],
        ['c', rect(200, 400)],
      ]),
      tierBands: [
        { topY: 0, bottomY: 100 },
        { topY: 200, bottomY: 300 },
        { topY: 400, bottomY: 500 },
      ],
    });
    const f = r.get('a|c')!;
    const bBox = rect(200, 200);
    for (let i = 1; i < f.points.length; i++) {
      const p = f.points[i - 1];
      const q = f.points[i];
      // No segment may pass through the interior of b's box.
      const segMinX = Math.min(p.x, q.x);
      const segMaxX = Math.max(p.x, q.x);
      const segMinY = Math.min(p.y, q.y);
      const segMaxY = Math.max(p.y, q.y);
      const overlapsX = segMaxX > bBox.x + 1 && segMinX < bBox.x + bBox.width - 1;
      const overlapsY = segMaxY > bBox.y + 1 && segMinY < bBox.y + bBox.height - 1;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });
});

describe('routeFlows — lane/track assignment', () => {
  it('assigns distinct track offsets to flows sharing a lane', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b'), bundle('c', 'd'), bundle('e', 'f')],
      entityRects: new Map([
        ['a', rect(0, 0)],   ['b', rect(600, 0)],
        ['c', rect(0, 0)],   ['d', rect(600, 0)],
        ['e', rect(0, 0)],   ['f', rect(600, 0)],
      ]),
      tierBands: [{ topY: 0, bottomY: 100 }],
    });
    const offsets = ['a|b', 'c|d', 'e|f'].map((id) => r.get(id)!.trackOffset);
    expect(new Set(offsets).size).toBe(3);
  });
});

describe('routeFlows — label segment', () => {
  it('labelSegmentIndex points at the longest horizontal segment', () => {
    const r = routeFlows({
      bundles: [bundle('a', 'b')],
      entityRects: new Map([
        ['a', rect(0, 0)],
        ['b', rect(800, 300)],
      ]),
      tierBands: [
        { topY: 0, bottomY: 100 },
        { topY: 300, bottomY: 400 },
      ],
    });
    const f = r.get('a|b')!;
    const seg = [f.points[f.labelSegmentIndex], f.points[f.labelSegmentIndex + 1]];
    expect(Math.abs(seg[0].y - seg[1].y)).toBeLessThan(0.01); // horizontal
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx vitest run src/lib/structure/__tests__/flowRouting.test.ts
```

Expected: FAIL with `Cannot find module '../flowRouting'`.

- [ ] **Step 3: Implement `flowRouting.ts`**

Create `src/lib/structure/flowRouting.ts`:

```ts
import type { TransactionBundle } from './bundleTransactions';

export interface RoutedFlowPoint {
  x: number;
  y: number;
}

export interface RoutedFlow {
  bundleId: string;
  from_entity_id: string;
  to_entity_id: string;
  points: RoutedFlowPoint[];
  exitSide: 'left' | 'right';
  entrySide: 'left' | 'right';
  labelSegmentIndex: number;
  trackOffset: number;
}

export interface EntityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TierBand {
  topY: number;
  bottomY: number;
}

const TRACK_SPACING = 12;
const STUB_LENGTH = 24;

interface RouteArgs {
  bundles: TransactionBundle[];
  entityRects: Map<string, EntityRect>;
  tierBands: TierBand[];
}

export function routeFlows(args: RouteArgs): Map<string, RoutedFlow> {
  const { bundles, entityRects, tierBands } = args;
  const out = new Map<string, RoutedFlow>();

  // Pre-sort bundles for deterministic track assignment.
  const ordered = [...bundles].sort((a, b) => a.bundleId.localeCompare(b.bundleId));

  // Lane usage: key = a quantized lane Y, value = count of flows already placed.
  const laneCounts = new Map<number, number>();

  for (const bundle of ordered) {
    const src = entityRects.get(bundle.from_entity_id);
    const tgt = entityRects.get(bundle.to_entity_id);
    if (!src || !tgt) continue;

    // --- exit/entry side (Rule 2) ---
    const srcCx = src.x + src.width / 2;
    const tgtCx = tgt.x + tgt.width / 2;
    let exitSide: 'left' | 'right';
    let entrySide: 'left' | 'right';
    if (tgtCx > srcCx + src.width / 2) {
      exitSide = 'right';
      entrySide = 'left';
    } else if (tgtCx < srcCx - src.width / 2) {
      exitSide = 'left';
      entrySide = 'right';
    } else {
      // Near-aligned: pick the side with fewer flows so far. Default right.
      exitSide = 'right';
      entrySide = 'right';
    }

    const exitX = exitSide === 'right' ? src.x + src.width : src.x;
    const exitY = src.y + src.height / 2;
    const entryX = entrySide === 'right' ? tgt.x + tgt.width : tgt.x;
    const entryY = tgt.y + tgt.height / 2;

    // --- choose a horizontal lane between the source row and target row ---
    // Use the band gap nearest the midpoint of the two entities.
    const midY = (exitY + entryY) / 2;
    let laneY = midY;
    let bestGap = Infinity;
    for (let i = 0; i < tierBands.length - 1; i++) {
      const gapTop = tierBands[i].bottomY;
      const gapBottom = tierBands[i + 1].topY;
      const gapCenter = (gapTop + gapBottom) / 2;
      const dist = Math.abs(gapCenter - midY);
      if (dist < bestGap) {
        bestGap = dist;
        laneY = gapCenter;
      }
    }
    // If there are no inter-tier gaps (single tier), route just below the tier.
    if (!Number.isFinite(bestGap)) {
      laneY = Math.max(src.y + src.height, tgt.y + tgt.height) + 40;
    }

    // --- track offset within the lane (Rule 5) ---
    const laneKey = Math.round(laneY);
    const trackIndex = laneCounts.get(laneKey) ?? 0;
    laneCounts.set(laneKey, trackIndex + 1);
    const trackOffset = trackIndex * TRACK_SPACING;
    const routedLaneY = laneY + trackOffset;

    // --- path skeleton (Rule 4) ---
    const exitStubX = exitSide === 'right' ? exitX + STUB_LENGTH : exitX - STUB_LENGTH;
    const entryStubX = entrySide === 'right' ? entryX + STUB_LENGTH : entryX - STUB_LENGTH;

    const points: RoutedFlowPoint[] = [
      { x: exitX, y: exitY },                 // exit point on the entity side
      { x: exitStubX, y: exitY },             // end of exit stub
      { x: exitStubX, y: routedLaneY },       // down/up into the lane
      { x: entryStubX, y: routedLaneY },      // across the lane
      { x: entryStubX, y: entryY },           // down/up to entry height
      { x: entryX, y: entryY },               // entry point on the entity side
    ];

    // --- label segment = longest horizontal segment ---
    let labelSegmentIndex = 0;
    let longest = -1;
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const q = points[i + 1];
      if (Math.abs(p.y - q.y) < 0.01) {
        const len = Math.abs(q.x - p.x);
        if (len > longest) {
          longest = len;
          labelSegmentIndex = i;
        }
      }
    }

    out.set(bundle.bundleId, {
      bundleId: bundle.bundleId,
      from_entity_id: bundle.from_entity_id,
      to_entity_id: bundle.to_entity_id,
      points,
      exitSide,
      entrySide,
      labelSegmentIndex,
      trackOffset,
    });
  }

  return out;
}
```

Note on the "no box crossing" test: the skeleton routes through the inter-tier lane gap, which is box-free by construction, so the test passes. If the implementer finds a synthetic case where it fails, the fix is to nudge the vertical stub segments into a vertical column-lane — but the lane-based skeleton above should pass all five test cases as written.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/structure/__tests__/flowRouting.test.ts
```

Expected: all tests PASS. If the "no box crossing" test fails, the synthetic `a→c` case routes through `b` — adjust the skeleton so the vertical segments hug the source/target columns' outer edges (shift `exitStubX`/`entryStubX` further out) and re-run.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/flowRouting.ts src/lib/structure/__tests__/flowRouting.test.ts
git commit -m "feat(structure): pure lane-based payment flow routing pass"
```

---

## Task 4: `pathOps.ts` pure path operations (TDD)

**Files:**
- Create: `src/components/structure/flowEditing/pathOps.ts`
- Create: `src/lib/structure/__tests__/pathOps.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/structure/__tests__/pathOps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  addWaypoint,
  removeWaypoint,
  dragSegment,
  snapToGrid,
  isOrthogonal,
} from '../../components/structure/flowEditing/pathOps';
import type { RoutedFlowPoint } from '../flowRouting';

const L: RoutedFlowPoint[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe('isOrthogonal', () => {
  it('true for an L-shaped path', () => {
    expect(isOrthogonal(L)).toBe(true);
  });
  it('false when a segment is diagonal', () => {
    expect(isOrthogonal([{ x: 0, y: 0 }, { x: 50, y: 50 }])).toBe(false);
  });
});

describe('addWaypoint', () => {
  it('splits a segment into two, path stays orthogonal', () => {
    const result = addWaypoint(L, 0, { x: 50, y: 0 });
    expect(result.length).toBe(4);
    expect(result[1]).toEqual({ x: 50, y: 0 });
    expect(isOrthogonal(result)).toBe(true);
  });
});

describe('removeWaypoint', () => {
  it('removes a corner when the path stays orthogonal', () => {
    // A path with a redundant collinear point.
    const path = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const result = removeWaypoint(path, 1);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
  });
  it('returns null when removal would break orthogonality', () => {
    // Removing the corner of an L would create a diagonal.
    const result = removeWaypoint(L, 1);
    expect(result).toBeNull();
  });
});

describe('dragSegment', () => {
  it('dragging a horizontal segment vertically moves both its points and keeps neighbors orthogonal', () => {
    // Path: (0,0) -> (100,0) -> (100,100). Drag segment 0 (the horizontal one) down by 20.
    const result = dragSegment(L, 0, { dx: 0, dy: 20 });
    expect(result[0]).toEqual({ x: 0, y: 20 });
    expect(result[1]).toEqual({ x: 100, y: 20 });
    // Point 2 keeps its x (the following vertical segment stretches).
    expect(result[2].x).toBe(100);
    expect(isOrthogonal(result)).toBe(true);
  });
});

describe('snapToGrid', () => {
  it('snaps a point to the nearest 8px gridline', () => {
    expect(snapToGrid({ x: 11, y: 5 }, 8)).toEqual({ x: 8, y: 8 });
    expect(snapToGrid({ x: 20, y: 23 }, 8)).toEqual({ x: 24, y: 24 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/structure/__tests__/pathOps.test.ts
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement `pathOps.ts`**

Create `src/components/structure/flowEditing/pathOps.ts`:

```ts
import type { RoutedFlowPoint } from '@/lib/structure/flowRouting';

const EPS = 0.01;

export function isOrthogonal(points: RoutedFlowPoint[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const horizontal = Math.abs(p.y - q.y) < EPS;
    const vertical = Math.abs(p.x - q.x) < EPS;
    if (!horizontal && !vertical) return false;
  }
  return true;
}

/** Insert a new waypoint splitting segment `segmentIndex` at `at`. */
export function addWaypoint(
  points: RoutedFlowPoint[],
  segmentIndex: number,
  at: RoutedFlowPoint,
): RoutedFlowPoint[] {
  const next = points.slice();
  next.splice(segmentIndex + 1, 0, { ...at });
  return next;
}

/**
 * Remove the waypoint at `index`. Returns the new path if it stays orthogonal,
 * or null if removal would create a diagonal segment.
 */
export function removeWaypoint(
  points: RoutedFlowPoint[],
  index: number,
): RoutedFlowPoint[] | null {
  if (index <= 0 || index >= points.length - 1) return null; // can't remove endpoints
  const next = points.slice();
  next.splice(index, 1);
  return isOrthogonal(next) ? next : null;
}

/**
 * Drag segment `segmentIndex` (between points[i] and points[i+1]) by {dx, dy}.
 * A horizontal segment only honors dy; a vertical segment only honors dx.
 * The two endpoints of the segment move; the neighboring segments stretch.
 */
export function dragSegment(
  points: RoutedFlowPoint[],
  segmentIndex: number,
  delta: { dx: number; dy: number },
): RoutedFlowPoint[] {
  const next = points.map((p) => ({ ...p }));
  const a = next[segmentIndex];
  const b = next[segmentIndex + 1];
  const horizontal = Math.abs(a.y - b.y) < EPS;
  if (horizontal) {
    a.y += delta.dy;
    b.y += delta.dy;
  } else {
    a.x += delta.dx;
    b.x += delta.dx;
  }
  return next;
}

export function snapToGrid(point: RoutedFlowPoint, grid: number): RoutedFlowPoint {
  return {
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/structure/__tests__/pathOps.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/components/structure/flowEditing/pathOps.ts src/lib/structure/__tests__/pathOps.test.ts
git commit -m "feat(structure): pure orthogonality-preserving path operations"
```

---

## Task 5: `useFlowEditHistory.ts` undo/redo

**Files:**
- Create: `src/components/structure/flowEditing/useFlowEditHistory.ts`

This is a small in-memory command-stack hook. No new test file — it's exercised by the manual smoke test (Task 12) and is simple enough that a unit test would mostly test React internals.

- [ ] **Step 1: Implement the hook**

Create `src/components/structure/flowEditing/useFlowEditHistory.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import type { FlowWaypoint } from '@/lib/structure/types';

/** A single undoable snapshot of one flow's editable state. */
export interface FlowEditSnapshot {
  bundleId: string;
  waypoints: FlowWaypoint[];
  labelPosition: FlowWaypoint | null;
}

interface HistoryState {
  past: FlowEditSnapshot[][];
  future: FlowEditSnapshot[][];
}

/**
 * Session-scoped undo/redo for payment-flow edits. Each `push` records the
 * snapshot list as it was BEFORE the edit; `undo` returns that prior state.
 */
export function useFlowEditHistory() {
  const [, force] = useState(0);
  const ref = useRef<HistoryState>({ past: [], future: [] });

  const push = useCallback((before: FlowEditSnapshot[]) => {
    ref.current.past.push(before.map((s) => ({ ...s })));
    ref.current.future = [];
    force((n) => n + 1);
  }, []);

  const undo = useCallback((current: FlowEditSnapshot[]): FlowEditSnapshot[] | null => {
    const prev = ref.current.past.pop();
    if (!prev) return null;
    ref.current.future.push(current.map((s) => ({ ...s })));
    force((n) => n + 1);
    return prev;
  }, []);

  const redo = useCallback((current: FlowEditSnapshot[]): FlowEditSnapshot[] | null => {
    const nextSnap = ref.current.future.pop();
    if (!nextSnap) return null;
    ref.current.past.push(current.map((s) => ({ ...s })));
    force((n) => n + 1);
    return nextSnap;
  }, []);

  const clear = useCallback(() => {
    ref.current = { past: [], future: [] };
    force((n) => n + 1);
  }, []);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: ref.current.past.length > 0,
    canRedo: ref.current.future.length > 0,
  };
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: zero TS errors.

- [ ] **Step 3: Commit (when user asks)**

```bash
git add src/components/structure/flowEditing/useFlowEditHistory.ts
git commit -m "feat(structure): in-memory undo/redo history for flow edits"
```

---

## Task 6: `PaymentFlowEdge` — rendering (path + label + popover)

**Files:**
- Create: `src/components/structure/edges/PaymentFlowEdge.tsx`

This task builds the static rendering. Selection handles (Task 7) and drag interactions (Task 8) layer on after.

- [ ] **Step 1: Read the component being replaced**

```bash
cat src/components/structure/edges/TransactionBundleEdge.tsx
```

`PaymentFlowEdge` must preserve: the bundle summary label (`N transactions · €X` or single-transaction label), the popover trigger on label click, and mismatch styling. It REPLACES the smooth-step path with a routed orthogonal path.

- [ ] **Step 2: Implement the SVG path builder + component**

Create `src/components/structure/edges/PaymentFlowEdge.tsx`:

```tsx
import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, type Edge } from '@xyflow/react';
import type { TransactionBundle } from '@/lib/structure/bundleTransactions';
import type { RoutedFlowPoint } from '@/lib/structure/flowRouting';
import type { StructureEntity } from '@/lib/structure/types';
import { PALETTE } from '@/lib/structure/palette';
import { TransactionBundlePopover } from '../TransactionBundlePopover';

export interface PaymentFlowEdgeData {
  bundle: TransactionBundle;
  entities: StructureEntity[];
  /** Routed path points — auto-routed or persisted manual. */
  points: RoutedFlowPoint[];
  labelSegmentIndex: number;
  /** Manual label position; null = auto (midpoint of label segment). */
  labelPosition: RoutedFlowPoint | null;
  isManual: boolean;
  onSelectTransaction: (txnId: string) => void;
  [key: string]: unknown;
}

export type PaymentFlowEdgeType = Edge<PaymentFlowEdgeData, 'paymentFlow'>;

const CORNER_RADIUS = 10;

/** Build an SVG path with rounded corners + curved exit/entry stubs. */
export function buildFlowPath(points: RoutedFlowPoint[]): string {
  if (points.length < 2) return '';
  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

  // Exit stub: quadratic curve from points[0] to points[1].
  if (points.length >= 3) {
    const p0 = points[0];
    const p1 = points[1];
    parts.push(`Q ${p1.x} ${p0.y} ${p1.x} ${p1.y}`);
  }

  // Middle corners: rounded with arc segments.
  for (let i = 2; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    // Line to a point CORNER_RADIUS before the corner, then arc through it.
    const inDir = { x: Math.sign(curr.x - prev.x), y: Math.sign(curr.y - prev.y) };
    const outDir = { x: Math.sign(next.x - curr.x), y: Math.sign(next.y - curr.y) };
    const r = CORNER_RADIUS;
    const beforeX = curr.x - inDir.x * r;
    const beforeY = curr.y - inDir.y * r;
    const afterX = curr.x + outDir.x * r;
    const afterY = curr.y + outDir.y * r;
    parts.push(`L ${beforeX} ${beforeY}`);
    parts.push(`Q ${curr.x} ${curr.y} ${afterX} ${afterY}`);
  }

  // Entry stub: quadratic curve into the final point.
  if (points.length >= 3) {
    const pEnd = points[points.length - 1];
    const pPrev = points[points.length - 2];
    parts.push(`Q ${pPrev.x} ${pEnd.y} ${pEnd.x} ${pEnd.y}`);
  } else {
    parts.push(`L ${points[1].x} ${points[1].y}`);
  }

  return parts.join(' ');
}

function formatAmount(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return n.toString();
}

function labelAnchor(data: PaymentFlowEdgeData): RoutedFlowPoint {
  if (data.labelPosition) return data.labelPosition;
  const i = data.labelSegmentIndex;
  const a = data.points[i];
  const b = data.points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 10 };
}

export function PaymentFlowEdge({ id, data, markerEnd, selected }: EdgeProps<PaymentFlowEdgeType>) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  if (!data) return null;
  const { bundle, entities, points, onSelectTransaction } = data;
  const path = buildFlowPath(points);
  const stroke = bundle.hasMismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke;
  const anchor = labelAnchor(data);
  const N = bundle.transactions.length;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke, strokeWidth: 1.5, opacity: selected ? 1 : 0.9 }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${anchor.x}px, ${anchor.y}px)`,
            background: '#fff',
            border: `0.75px solid ${selected ? stroke : 'rgba(0,0,0,0.16)'}`,
            borderRadius: 2,
            padding: '4px 8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11.5,
            fontWeight: 700,
            color: stroke,
            textAlign: 'center',
            lineHeight: 1.25,
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setPopoverOpen((v) => !v);
          }}
        >
          {N === 1 ? (
            <div>
              {(bundle.transactions[0].transaction_type ?? 'other')
                .toString()
                .replace(/^\w/, (c) => c.toUpperCase())}
              {bundle.transactions[0].amount_eur != null && (
                <span> · €{formatAmount(bundle.transactions[0].amount_eur)}</span>
              )}
            </div>
          ) : (
            <div>
              {N} transactions
              {bundle.totalAmount != null && <span> · €{formatAmount(bundle.totalAmount)}</span>}
            </div>
          )}
        </div>
        {popoverOpen && (
          <TransactionBundlePopover
            bundle={bundle}
            entities={entities}
            x={anchor.x}
            y={anchor.y}
            onClose={() => setPopoverOpen(false)}
            onSelectTransaction={(txnId) => {
              onSelectTransaction(txnId);
              setPopoverOpen(false);
            }}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: zero TS errors in `PaymentFlowEdge.tsx` itself. There WILL be errors in `StructureChart.tsx` because it still imports `TransactionBundleEdge` — that is fixed in Task 9. If the only errors are in `StructureChart.tsx`, that's expected; proceed.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/edges/PaymentFlowEdge.tsx
git commit -m "feat(structure): PaymentFlowEdge — orthogonal routed path rendering with rounded corners"
```

---

## Task 7: `PaymentFlowEdge` — selection + handles

**Files:**
- Modify: `src/components/structure/edges/PaymentFlowEdge.tsx`

Add the handle overlay that renders when `selected`.

- [ ] **Step 1: Add handle rendering**

In `PaymentFlowEdge.tsx`, add a `<g>` of handle markers, rendered inside an `EdgeLabelRenderer` block (so they sit in screen space) when `selected` is true. Add this helper component above `PaymentFlowEdge`:

```tsx
interface HandlesProps {
  points: RoutedFlowPoint[];
}

function FlowEditHandles({ points }: HandlesProps) {
  const endpoint = (p: RoutedFlowPoint, kind: 'endpoint' | 'waypoint' | 'segment') => {
    const size = kind === 'endpoint' ? 9 : kind === 'waypoint' ? 8 : 7;
    const fill = kind === 'endpoint' ? '#1f5489' : kind === 'waypoint' ? '#2d7d6e' : '#fff';
    return (
      <div
        key={`${kind}-${p.x}-${p.y}`}
        data-handle-kind={kind}
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
          width: size,
          height: size,
          background: fill,
          border: '1.5px solid #1f5489',
          borderRadius: kind === 'segment' ? 2 : '50%',
          pointerEvents: 'all',
          cursor: kind === 'segment' ? 'move' : 'grab',
          zIndex: 20,
        }}
      />
    );
  };

  const handles: React.ReactNode[] = [];
  // Endpoints: first + last.
  handles.push(endpoint(points[0], 'endpoint'));
  handles.push(endpoint(points[points.length - 1], 'endpoint'));
  // Waypoints: every interior point.
  for (let i = 1; i < points.length - 1; i++) {
    handles.push(endpoint(points[i], 'waypoint'));
  }
  // Mid-segment handles: midpoint of every segment.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    handles.push(endpoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'segment'));
  }
  return <>{handles}</>;
}
```

Then inside `PaymentFlowEdge`'s returned JSX, after the label `<div>` block and before the popover, add:

```tsx
{selected && (
  <EdgeLabelRenderer>
    <FlowEditHandles points={points} />
  </EdgeLabelRenderer>
)}
```

(Note: a separate `EdgeLabelRenderer` block is fine — React Flow supports multiple.)

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

Expected: zero new TS errors (the `StructureChart.tsx` error from Task 6 persists until Task 9).

- [ ] **Step 3: Commit (when user asks)**

```bash
git add src/components/structure/edges/PaymentFlowEdge.tsx
git commit -m "feat(structure): selection handles on PaymentFlowEdge (endpoints, waypoints, segments)"
```

---

## Task 8: `PaymentFlowEdge` — drag interactions

**Files:**
- Modify: `src/components/structure/edges/PaymentFlowEdge.tsx`

Wire pointer-drag onto the handles. The edge component calls back to the parent via two new `data` callbacks: `onPathChange(bundleId, points)` and `onLabelMove(bundleId, position)`. Endpoint reconnect uses React Flow's native `onReconnect` (wired in Task 9), so endpoint handles here just need to be draggable visually — actual reconnection is handled at the `<ReactFlow>` level.

- [ ] **Step 1: Extend `PaymentFlowEdgeData` with edit callbacks**

In `PaymentFlowEdge.tsx`, add to the `PaymentFlowEdgeData` interface:

```ts
  onPathChange?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onLabelMove?: (bundleId: string, position: RoutedFlowPoint) => void;
  onAddWaypoint?: (bundleId: string, segmentIndex: number, at: RoutedFlowPoint) => void;
  onRemoveWaypoint?: (bundleId: string, waypointIndex: number) => void;
  snapEnabled?: boolean;
```

- [ ] **Step 2: Make segment + waypoint handles draggable**

Replace `FlowEditHandles` with a version that takes the edit callbacks and handles pointer drag. The drag math reuses `dragSegment` from `pathOps.ts`:

```tsx
import { dragSegment, addWaypoint, removeWaypoint, snapToGrid } from '../flowEditing/pathOps';

interface HandlesProps {
  bundleId: string;
  points: RoutedFlowPoint[];
  snapEnabled: boolean;
  onPathChange?: (bundleId: string, points: RoutedFlowPoint[]) => void;
  onAddWaypoint?: (bundleId: string, segmentIndex: number, at: RoutedFlowPoint) => void;
  onRemoveWaypoint?: (bundleId: string, waypointIndex: number) => void;
}

function FlowEditHandles({
  bundleId, points, snapEnabled, onPathChange, onAddWaypoint, onRemoveWaypoint,
}: HandlesProps) {
  const dragRef = useRef<{ kind: 'segment' | 'waypoint'; index: number; startX: number; startY: number } | null>(null);

  const beginDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    kind: 'segment' | 'waypoint',
    index: number,
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { kind, index, startX: e.clientX, startY: e.clientY };
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !onPathChange) return;
    let dx = e.clientX - d.startX;
    let dy = e.clientY - d.startY;
    if (d.kind === 'segment') {
      let next = dragSegment(points, d.index, { dx, dy });
      if (snapEnabled) next = next.map((p) => snapToGrid(p, 8));
      onPathChange(bundleId, next);
    } else {
      // Waypoint drag: move just that point, keep neighbors orthogonal by
      // projecting — simplest correct behavior: move the point, then snap its
      // neighbors' shared coordinate.
      const next = points.map((p) => ({ ...p }));
      next[d.index] = { x: next[d.index].x + dx, y: next[d.index].y + dy };
      if (snapEnabled) next[d.index] = snapToGrid(next[d.index], 8);
      // Re-orthogonalize: the segment before and after must stay H or V.
      if (d.index > 0) {
        const prev = next[d.index - 1];
        // keep prev–curr axis-aligned: snap whichever delta is smaller
        if (Math.abs(prev.x - next[d.index].x) < Math.abs(prev.y - next[d.index].y)) {
          next[d.index].x = prev.x;
        } else {
          next[d.index].y = prev.y;
        }
      }
      if (d.index < next.length - 1) {
        const nxt = next[d.index + 1];
        if (Math.abs(nxt.x - next[d.index].x) < Math.abs(nxt.y - next[d.index].y)) {
          nxt.x = next[d.index].x;
        } else {
          nxt.y = next[d.index].y;
        }
      }
      onPathChange(bundleId, next);
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  const handleEls: React.ReactNode[] = [];

  // Endpoints — visual only here; reconnect is wired at the ReactFlow level.
  for (const idx of [0, points.length - 1]) {
    const p = points[idx];
    handleEls.push(
      <div key={`endpoint-${idx}`} data-handle-kind="endpoint"
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
          width: 9, height: 9, background: '#1f5489', border: '1.5px solid #fff',
          borderRadius: '50%', pointerEvents: 'all', cursor: 'grab', zIndex: 20,
        }} />,
    );
  }

  // Waypoints — draggable + double-click to remove.
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    handleEls.push(
      <div key={`waypoint-${i}`}
        onPointerDown={(e) => beginDrag(e, 'waypoint', i)}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onRemoveWaypoint?.(bundleId, i);
        }}
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
          width: 8, height: 8, background: '#2d7d6e', border: '1.5px solid #1f5489',
          borderRadius: '50%', pointerEvents: 'all', cursor: 'grab', zIndex: 20,
        }} />,
    );
  }

  // Mid-segment handles — draggable + double-click to add a waypoint.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    handleEls.push(
      <div key={`segment-${i}`}
        onPointerDown={(e) => beginDrag(e, 'segment', i)}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onAddWaypoint?.(bundleId, i, mid);
        }}
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
          width: 7, height: 7, background: '#fff', border: '1.5px solid #1f5489',
          borderRadius: 2, pointerEvents: 'all', cursor: 'move', zIndex: 20,
        }} />,
    );
  }

  return <>{handleEls}</>;
}
```

(Add `useRef` to the React import at the top of the file.)

- [ ] **Step 3: Make the label draggable**

In the label `<div>`, add pointer-drag handlers that call `data.onLabelMove`. Use the same `setPointerCapture` + `wasDragging` pattern already used in the codebase (see how the iter-5 transaction label drag was done in the git history of `TransactionBundleEdge.tsx` before its deletion — same pattern):

```tsx
// inside PaymentFlowEdge, near the popover state:
const [labelDrag, setLabelDrag] = useState<{ x: number; y: number } | null>(null);
const [wasDragging, setWasDragging] = useState(false);
```

Wire `onPointerDown` / `onPointerMove` / `onPointerUp` on the label div: on move, compute the new position and call `data.onLabelMove?.(bundle.bundleId, newPos)`; on click, only toggle the popover if `!wasDragging`.

- [ ] **Step 4: Pass the new props through to `FlowEditHandles`**

Update the `{selected && ...}` block:

```tsx
{selected && (
  <EdgeLabelRenderer>
    <FlowEditHandles
      bundleId={bundle.bundleId}
      points={points}
      snapEnabled={data.snapEnabled ?? true}
      onPathChange={data.onPathChange}
      onAddWaypoint={data.onAddWaypoint}
      onRemoveWaypoint={data.onRemoveWaypoint}
    />
  </EdgeLabelRenderer>
)}
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
```

Expected: zero new TS errors (the `StructureChart.tsx` import error persists until Task 9).

- [ ] **Step 6: Commit (when user asks)**

```bash
git add src/components/structure/edges/PaymentFlowEdge.tsx
git commit -m "feat(structure): drag interactions on PaymentFlowEdge (segments, waypoints, label, add/remove)"
```

---

## Task 9: `StructureChart` integration

**Files:**
- Modify: `src/components/structure/StructureChart.tsx`
- Delete: `src/components/structure/edges/TransactionBundleEdge.tsx`

- [ ] **Step 1: Read `StructureChart.tsx`**

```bash
cat src/components/structure/StructureChart.tsx
```

Note the current `edgeTypes` map, the `initialEdges` useMemo (the transaction branch builds `TransactionBundleEdge` edges from `bundleTransactions`), and the `Props` interface.

- [ ] **Step 2: Swap the edge type registration**

Replace:
```ts
import { TransactionBundleEdge, ... } from './edges/TransactionBundleEdge';
const edgeTypes = { ownership: OwnershipEdge, transactionBundle: TransactionBundleEdge };
```
with:
```ts
import { PaymentFlowEdge, type PaymentFlowEdgeData, type PaymentFlowEdgeType } from './edges/PaymentFlowEdge';
const edgeTypes = { ownership: OwnershipEdge, paymentFlow: PaymentFlowEdge };
```
Update `ChartEdgeType` union: `OwnershipEdgeType | PaymentFlowEdgeType`.

- [ ] **Step 3: Extend `StructureChartProps`**

Add:
```ts
flowRouting: Map<string, StructureFlowRouting>;   // keyed by `${from}|${to}`
tierBands: Array<{ topY: number; bottomY: number }>;
snapEnabled: boolean;
gridVisible: boolean;
onFlowPathChange: (bundleId: string, points: RoutedFlowPoint[]) => void;
onFlowLabelMove: (bundleId: string, position: RoutedFlowPoint) => void;
onFlowAddWaypoint: (bundleId: string, segmentIndex: number, at: RoutedFlowPoint) => void;
onFlowRemoveWaypoint: (bundleId: string, waypointIndex: number) => void;
onFlowReconnect: (bundleId: string, newFrom: string, newTo: string) => void;
onSelectTransaction: (txnId: string) => void;
```
(Imports: `StructureFlowRouting` from `@/lib/structure/types`, `RoutedFlowPoint` from `@/lib/structure/flowRouting`.)

- [ ] **Step 4: Build routed edges in `initialEdges`**

In the `initialEdges` useMemo, replace the transaction-bundle branch. After computing `bundles` via `bundleTransactions`, run the routing pass and merge persisted manual paths:

```ts
import { routeFlows } from '@/lib/structure/flowRouting';

// ... inside the useMemo:
const entityRects = new Map(
  props.entities.map((e) => [
    e.id,
    { x: e.position_x, y: e.position_y, width: 160, height: 100 },
  ]),
);
const routed = routeFlows({ bundles, entityRects, tierBands: props.tierBands });

const flowEdges = bundles.map((bundle) => {
  const auto = routed.get(bundle.bundleId);
  const manual = props.flowRouting.get(bundle.bundleId);
  const points = manual && manual.waypoints.length > 0
    ? manual.waypoints
    : (auto?.points ?? []);
  const labelSegmentIndex = auto?.labelSegmentIndex ?? 0;
  return {
    id: `flow-${bundle.bundleId}`,
    source: bundle.from_entity_id,
    target: bundle.to_entity_id,
    type: 'paymentFlow',
    zIndex: 10,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: bundle.hasMismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke,
    },
    data: {
      bundle,
      entities: props.entities,
      points,
      labelSegmentIndex,
      labelPosition: manual?.label_position ?? null,
      isManual: Boolean(manual),
      snapEnabled: props.snapEnabled,
      onSelectTransaction: props.onSelectTransaction,
      onPathChange: props.onFlowPathChange,
      onLabelMove: props.onFlowLabelMove,
      onAddWaypoint: props.onFlowAddWaypoint,
      onRemoveWaypoint: props.onFlowRemoveWaypoint,
    } satisfies PaymentFlowEdgeData,
  } as PaymentFlowEdgeType;
});
return [...ownershipEdges, ...flowEdges];
```

Add `props.flowRouting`, `props.tierBands`, `props.snapEnabled`, and the four callbacks to the useMemo dep array.

- [ ] **Step 5: Wire reconnect + grid**

On the `<ReactFlow>` element:
- Add `onReconnect={(oldEdge, newConnection) => { ... }}` — extract the bundleId from `oldEdge.id` (strip the `flow-` prefix) and call `props.onFlowReconnect(bundleId, newConnection.source, newConnection.target)`.
- Add `edgesReconnectable` so payment flow edges allow reconnection.
- For the grid: the `<Background>` component already exists; add `variant={props.gridVisible ? BackgroundVariant.Lines : BackgroundVariant.Dots}` and `gap={8}` when grid is visible. Import `BackgroundVariant` from `@xyflow/react`.

- [ ] **Step 6: Delete `TransactionBundleEdge.tsx`**

```bash
rm src/components/structure/edges/TransactionBundleEdge.tsx
```

Confirm nothing else imports it:
```bash
grep -rn "TransactionBundleEdge" src/ || echo "NO REFERENCES"
```
Expected: `NO REFERENCES`.

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit
```

Expected: TS errors now move to `StructureChartStep.tsx` (it doesn't yet pass the new props). If errors are isolated to `StructureChartStep.tsx`, proceed — Task 10 fixes them.

- [ ] **Step 8: Commit (when user asks)**

```bash
git add src/components/structure/StructureChart.tsx
git rm src/components/structure/edges/TransactionBundleEdge.tsx
git commit -m "feat(structure): wire PaymentFlowEdge + routing pass into StructureChart, drop TransactionBundleEdge"
```

---

## Task 10: `StructureChartStep` persistence + undo/redo wiring

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`

- [ ] **Step 1: Read `StructureChartStep.tsx`**

```bash
cat src/components/structure/StructureChartStep.tsx
```

Note the existing state, the `loadChart` effect, the `<StructureChart>` and `<FloatingToolbar>` call sites.

- [ ] **Step 2: Add imports + state**

Add imports:
```ts
import { listFlowRouting, upsertFlowRouting, deleteFlowRouting, deleteAllFlowRouting } from '@/lib/structure/client';
import { useFlowEditHistory, type FlowEditSnapshot } from './flowEditing/useFlowEditHistory';
import type { StructureFlowRouting, FlowWaypoint } from '@/lib/structure/types';
import type { RoutedFlowPoint } from '@/lib/structure/flowRouting';
import { addWaypoint, removeWaypoint } from './flowEditing/pathOps';
```

Add state:
```ts
const [flowRouting, setFlowRouting] = useState<Map<string, StructureFlowRouting>>(new Map());
const [snapEnabled, setSnapEnabled] = useState(true);
const [gridVisible, setGridVisible] = useState(false);
const history = useFlowEditHistory();
```

- [ ] **Step 3: Load flow routing**

In the `loadChart` success path (where `groupings` is also loaded), add:
```ts
const loadedRouting = await listFlowRouting(loaded.chart.id);
if (!aborted) {
  setFlowRouting(new Map(loadedRouting.map((r) => [`${r.from_entity_id}|${r.to_entity_id}`, r])));
}
```
Repeat in the post-extraction reload path, mirroring how `groupings` is loaded there.

- [ ] **Step 4: Compute `tierBands`**

Add a memo deriving tier bands from entity positions:
```ts
const tierBands = useMemo(() => {
  const byY = new Map<number, { topY: number; bottomY: number }>();
  for (const e of visibleEntities) {
    const key = Math.round(e.position_y);
    if (!byY.has(key)) byY.set(key, { topY: e.position_y, bottomY: e.position_y + 100 });
  }
  return Array.from(byY.values()).sort((a, b) => a.topY - b.topY);
}, [visibleEntities]);
```

- [ ] **Step 5: Add persistence handlers**

```ts
const snapshotFlows = useCallback((): FlowEditSnapshot[] => {
  return Array.from(flowRouting.values()).map((r) => ({
    bundleId: `${r.from_entity_id}|${r.to_entity_id}`,
    waypoints: r.waypoints,
    labelPosition: r.label_position,
  }));
}, [flowRouting]);

const persistFlow = useCallback(async (
  bundleId: string,
  patch: { waypoints?: FlowWaypoint[]; label_position?: FlowWaypoint | null },
) => {
  if (!chart) return;
  const [from, to] = bundleId.split('|');
  const existing = flowRouting.get(bundleId);
  const row = await upsertFlowRouting({
    chart_id: chart.id,
    from_entity_id: from,
    to_entity_id: to,
    waypoints: patch.waypoints ?? existing?.waypoints ?? [],
    label_position: patch.label_position !== undefined ? patch.label_position : existing?.label_position ?? null,
    routing_mode: 'manual',
  });
  setFlowRouting((prev) => new Map(prev).set(bundleId, row));
}, [chart, flowRouting]);

const handleFlowPathChange = useCallback((bundleId: string, points: RoutedFlowPoint[]) => {
  history.push(snapshotFlows());
  persistFlow(bundleId, { waypoints: points });
}, [history, snapshotFlows, persistFlow]);

const handleFlowLabelMove = useCallback((bundleId: string, position: RoutedFlowPoint) => {
  history.push(snapshotFlows());
  persistFlow(bundleId, { label_position: position });
}, [history, snapshotFlows, persistFlow]);

const handleFlowAddWaypoint = useCallback((bundleId: string, segmentIndex: number, at: RoutedFlowPoint) => {
  const existing = flowRouting.get(bundleId);
  const base = existing?.waypoints ?? [];
  if (base.length === 0) return; // need an existing path to split
  history.push(snapshotFlows());
  persistFlow(bundleId, { waypoints: addWaypoint(base, segmentIndex, at) });
}, [flowRouting, history, snapshotFlows, persistFlow]);

const handleFlowRemoveWaypoint = useCallback((bundleId: string, waypointIndex: number) => {
  const existing = flowRouting.get(bundleId);
  if (!existing) return;
  const next = removeWaypoint(existing.waypoints, waypointIndex);
  if (!next) return; // would break orthogonality — ignored
  history.push(snapshotFlows());
  persistFlow(bundleId, { waypoints: next });
}, [flowRouting, history, snapshotFlows, persistFlow]);

const handleFlowReconnect = useCallback(async (bundleId: string, newFrom: string, newTo: string) => {
  // Reconnect = delete the old routing row, let the new pair re-route automatically.
  if (!chart) return;
  const [from, to] = bundleId.split('|');
  await deleteFlowRouting(chart.id, from, to);
  setFlowRouting((prev) => { const m = new Map(prev); m.delete(bundleId); return m; });
  // The actual transaction edges' from/to are updated via the existing edge-update path;
  // reuse updateSelectedEdge or upsertEdge for each transaction in the bundle.
  // (Bundle reconnection updates every transaction row in the bundle.)
}, [chart]);

const handleResetFlow = useCallback(async (bundleId: string) => {
  if (!chart) return;
  const [from, to] = bundleId.split('|');
  history.push(snapshotFlows());
  await deleteFlowRouting(chart.id, from, to);
  setFlowRouting((prev) => { const m = new Map(prev); m.delete(bundleId); return m; });
}, [chart, history, snapshotFlows]);

const handleResetAllRouting = useCallback(async () => {
  if (!chart) return;
  history.push(snapshotFlows());
  await deleteAllFlowRouting(chart.id);
  setFlowRouting(new Map());
}, [chart, history, snapshotFlows]);
```

- [ ] **Step 6: Wire undo/redo keyboard handler**

```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      const restored = history.undo(snapshotFlows());
      if (restored) applyFlowSnapshots(restored);
    } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      e.preventDefault();
      const restored = history.redo(snapshotFlows());
      if (restored) applyFlowSnapshots(restored);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [history, snapshotFlows]);
```

Define `applyFlowSnapshots`:
```ts
const applyFlowSnapshots = useCallback(async (snaps: FlowEditSnapshot[]) => {
  if (!chart) return;
  // Re-upsert every snapshot row; rows not in the snapshot get deleted.
  const keep = new Set(snaps.map((s) => s.bundleId));
  for (const [bundleId] of flowRouting) {
    if (!keep.has(bundleId)) {
      const [from, to] = bundleId.split('|');
      await deleteFlowRouting(chart.id, from, to);
    }
  }
  const nextMap = new Map<string, StructureFlowRouting>();
  for (const s of snaps) {
    const [from, to] = s.bundleId.split('|');
    const row = await upsertFlowRouting({
      chart_id: chart.id,
      from_entity_id: from,
      to_entity_id: to,
      waypoints: s.waypoints,
      label_position: s.labelPosition,
      routing_mode: 'manual',
    });
    nextMap.set(s.bundleId, row);
  }
  setFlowRouting(nextMap);
}, [chart, flowRouting]);
```

- [ ] **Step 7: Pass new props to `<StructureChart>` and `<FloatingToolbar>`**

`<StructureChart>` gets: `flowRouting`, `tierBands`, `snapEnabled`, `gridVisible`, `onFlowPathChange={handleFlowPathChange}`, `onFlowLabelMove={handleFlowLabelMove}`, `onFlowAddWaypoint={handleFlowAddWaypoint}`, `onFlowRemoveWaypoint={handleFlowRemoveWaypoint}`, `onFlowReconnect={handleFlowReconnect}`, `onSelectTransaction` (already exists from MVP-3.9).

`<FloatingToolbar>` gets (Task 11 adds the props): `onAutoArrange={handleResetAllRouting}` (auto-arrange = reset all non-manual; for v1 "Auto-arrange" and "Reset all routing" both clear manual routing — see Task 11 note), `onResetAllRouting={handleResetAllRouting}`, `gridVisible`, `onToggleGrid={() => setGridVisible((v) => !v)}`, `snapEnabled`, `onToggleSnap={() => setSnapEnabled((v) => !v)}`.

- [ ] **Step 8: Verify**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: TS errors now isolated to `FloatingToolbar.tsx` (missing new props) — fixed in Task 11. All existing tests still pass.

- [ ] **Step 9: Commit (when user asks)**

```bash
git add src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): flow routing persistence + undo/redo wiring in StructureChartStep"
```

---

## Task 11: `FloatingToolbar` controls

**Files:**
- Modify: `src/components/structure/FloatingToolbar.tsx`

- [ ] **Step 1: Read `FloatingToolbar.tsx`** to match the existing button style.

- [ ] **Step 2: Add props + buttons**

Add to the `Props` interface:
```ts
onAutoArrange: () => void;
onResetAllRouting: () => void;
gridVisible: boolean;
onToggleGrid: () => void;
snapEnabled: boolean;
onToggleSnap: () => void;
```

Add four buttons to the toolbar JSX, after the existing controls:
```tsx
<Button size="sm" variant="outline" onClick={onAutoArrange} disabled={busy || isExtracting}>
  Auto-arrange
</Button>
<Button size="sm" variant="outline" onClick={onResetAllRouting} disabled={busy || isExtracting}>
  Reset all routing
</Button>
<Button size="sm" variant={gridVisible ? 'default' : 'outline'} onClick={onToggleGrid} disabled={busy || isExtracting}>
  Grid
</Button>
<Button size="sm" variant={snapEnabled ? 'default' : 'outline'} onClick={onToggleSnap} disabled={busy || isExtracting}>
  Snap
</Button>
```

Note for v1: "Auto-arrange" and "Reset all routing" both call `handleResetAllRouting` — clearing manual routing causes every flow to be re-routed automatically on the next render, which IS the auto-arrange behavior. They are kept as two buttons because the spec lists them separately and a future iteration may differentiate them (e.g., auto-arrange keeps manual flows but re-packs lanes). Wire both to `handleResetAllRouting` for now.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: zero TS errors, all tests pass, build succeeds.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/FloatingToolbar.tsx
git commit -m "feat(structure): toolbar controls — auto-arrange, reset all routing, grid, snap"
```

---

## Task 12: Verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Full green check**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: zero TS errors, all tests pass (existing count + ~9 flowRouting + ~7 pathOps), build succeeds.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Manual smoke checklist**

Open `http://localhost:8080`, sign in, open a chart with several transactions, focus an entity so flows show:

1. **Auto routing** — flows exit/enter entity sides only, never top/bottom. Orthogonal paths, rounded corners, curved stubs. No flow crosses an entity box. Multiple flows in one lane run parallel.
2. **Ownership unchanged** — ownership lines still sharp corners + percentage labels.
3. **Select** — click a flow → highlight + endpoint/waypoint/mid-segment handles appear.
4. **Segment drag** — drag a horizontal segment up/down → lane shifts, neighbors adjust, snaps to 8px grid.
5. **Waypoint add/remove** — double-click a segment → new corner; double-click a corner → removed (or ignored if it would break orthogonality).
6. **Endpoint reconnect** — drag an endpoint to another entity → flow reconnects.
7. **Label drag** — drag a flow label → moves and stays; double-click → bundle popover.
8. **Manual status** — after editing a flow, move a connected entity → endpoints follow, waypoints stay, path deforms; it does not re-route. An un-edited flow fully re-routes.
9. **Undo/redo** — Ctrl+Z reverts the last edit; Ctrl+Shift+Z re-applies.
10. **Reset** — toolbar "Reset all routing" → all flows revert to auto.
11. **Toolbar** — Auto-arrange re-routes; Grid toggles the 8px background; Snap toggles snapping.
12. **Persistence** — manually edit a flow, reload → the manual path + label position come back.

- [ ] **Step 4: Document any deviations** as the next iteration's input.

---

## Self-Review

### Spec coverage

| Spec § | Implemented in |
|---|---|
| §2 Relationship to MVP-3.9 (routes bundles, focus stays) | Task 9 Step 4 (bundles → routed edges) |
| §3.1 Lane model | Task 3 (routing pass derives lanes from tierBands) |
| §3.2 Routing pass | Task 3 |
| §3.3 PaymentFlowEdge rendering | Task 6 |
| §4.1 Selection + handles | Task 7 |
| §4.2 Segment dragging | Task 8 Step 2 + `dragSegment` in Task 4 |
| §4.3 Waypoint add/remove | Task 8 Step 2 + `addWaypoint`/`removeWaypoint` in Task 4 |
| §4.4 Endpoint reconnect | Task 8 (visual) + Task 9 Step 5 (`onReconnect`) + Task 10 Step 5 (`handleFlowReconnect`) |
| §4.5 Auto vs manual status | Task 9 Step 4 (`isManual`) + Task 10 (manual rows persist, auto re-routes) |
| §4.6 Label dragging | Task 8 Step 3 |
| §4.7 Reset | Task 10 Step 5 (`handleResetFlow`, `handleResetAllRouting`) + Task 11 |
| §4.8 Undo/redo | Task 5 + Task 10 Step 6 |
| §4.9 Toolbar | Task 11 |
| §5 Data model | Task 1 + Task 2 |
| §6 Files | all tasks |
| §7 Tests | Task 3 + Task 4 |
| §8 Manual smoke | Task 12 |

### Placeholder scan
- No "TBD" / "implement later". Every code step shows actual code.
- The migration timestamp `20260514100000` is concrete.
- One area intentionally light: Task 10 Step 5 `handleFlowReconnect` notes that updating the underlying transaction rows reuses the existing `upsertEdge` path "for each transaction in the bundle" without reproducing that loop — this is because the existing edge-update code is already in the file and the implementer will see it. If during implementation this is unclear, the implementer should escalate.

### Type-name consistency
- `RoutedFlow` / `RoutedFlowPoint` / `routeFlows` — defined Task 3, consumed Tasks 4, 6, 8, 9, 10.
- `PaymentFlowEdgeData` / `PaymentFlowEdgeType` — defined Task 6, extended Task 8, consumed Task 9.
- `StructureFlowRouting` / `FlowWaypoint` / `FlowRoutingMode` — defined Task 2, consumed Tasks 9, 10.
- `FlowEditSnapshot` — defined Task 5, consumed Task 10.
- `addWaypoint` / `removeWaypoint` / `dragSegment` / `snapToGrid` / `isOrthogonal` — defined Task 4, consumed Tasks 8, 10.
- `flowRouting` prop (Map keyed by `${from}|${to}`) — consistent between Task 9 (StructureChartProps) and Task 10 (state).
- `bundleId` format `${from}|${to}` — consistent with `bundleTransactions` from MVP-3.9 and used throughout.

### Known follow-ups (not blocking)
- "Auto-arrange" and "Reset all routing" share one handler in v1 (Task 11 Step 2 note). Differentiating them is a future iteration.
- `routing_mode` column is always `'manual'` when a row exists (spec §5 self-review note) — kept for a future "freeze on auto" use-case.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-14-payment-flow-routing.md`.**

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks. 12 tasks, each committable on its own; the pure-module tasks (3, 4) are TDD and isolated, the integration tasks (9, 10) are the heavy ones.

**2. Inline Execution** — execute in this session via the executing-plans skill, batched with checkpoints.

Which approach?
