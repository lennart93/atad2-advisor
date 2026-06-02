# Payment Flow Routing & Manual Editing — Design Spec

**Date:** 2026-05-14
**Status:** Approved (brainstorm → spec)
**Builds on:**
- `docs/superpowers/specs/2026-05-12-tcm-structure-chart-refactor-design.md` (MVP-3.8, uncommitted)
- `docs/superpowers/specs/2026-05-13-transaction-focus-mode-design.md` (MVP-3.9, uncommitted)
**Owner:** Lennart Wilming
**MVP:** 3.10

## 1. Goal

Payment flows (transactions between entities) currently render like ownership lines: they exit entities at top/bottom, run vertically through the chart, cross ownership lines and each other, and sometimes pass straight through entity boxes. They cannot be manually adjusted when the automatic routing is poor.

After this spec ships:
- Payment flows have their own visual language (blue, thinner, rounded corners, curved exit/entry stubs, side-only exit/entry) and their own routing logic (lane-based, track-separated, obstacle-avoiding).
- The user can manually adjust any flow — drag segments, waypoints, endpoints, and labels — PowerPoint / draw.io style — and the adjustments persist across sessions.
- A flow that has been hand-adjusted becomes "manual" and is no longer auto-rerouted; its endpoints still follow their entities when those move.

This is one MVP (single spec, single plan, single PR) per user direction, though large — the implementation plan decomposes it into ~10-14 tasks.

## 2. Relationship to MVP-3.9

MVP-3.9 introduced **transaction bundles** (`bundleTransactions()` aggregates all transactions between an entity pair into one bundle) and **focus mode** (transactions hidden until the user clicks an entity to focus it). Both stay.

A "payment flow" in this spec **is** a transaction bundle. There is one routed flow per `(from_entity_id, to_entity_id)` pair. Routing data (waypoints, label position, routing mode) attaches to the pair, not to individual transaction rows. The bundle label ("3 transactions · €6.5M") and the bundle popover (lists the individual transactions) from MVP-3.9 are preserved.

The `TransactionBundleEdge` component from MVP-3.9 is **replaced** by `PaymentFlowEdge`, which absorbs its responsibilities (bundle label, popover, mismatch styling) and adds routed-path rendering plus manual-editing handles.

## 3. Part A — Automatic routing

### 3.1 Lane model

The chart is strictly tiered: `tierLayout` (MVP-3.8) places entities in tiers, with possibly multiple rows per tier. From that structure we derive routing lanes:

- **Horizontal lanes** — the vertical gaps *between* tiers (`TIER_GAP_BELOW`, 80px) and between rows within a tier (`ROW_GAP`, 60px). These are the wide "highways"; payment flows travel horizontally here.
- **Vertical lanes** — the horizontal gaps *between* entity columns (`MIN_GAP`, 32px). Narrow; used only for short vertical connectors.

Lanes are box-free by construction, so a flow that stays within lanes never crosses an entity box (Rule 6). The routing pass keeps each flow inside lanes; the only box-adjacent geometry is the exit/entry stubs.

**Narrow-lane constraint:** the vertical column-lanes are only `MIN_GAP` (32px) wide — at a 12px track spacing they hold ~2-3 parallel tracks. The routing pass therefore concentrates parallelism in the wide horizontal lanes (60-80px) and keeps vertical column-lane usage to short connectors. If a vertical lane would need more tracks than fit, the overflow tracks are placed at the lane edge (accepting that they sit close to an entity box but not crossing it) rather than failing — flagged in the routing-pass tests as an accepted degradation.

### 3.2 Routing pass (`src/lib/structure/flowRouting.ts`)

A pure function, independently testable:

```ts
export interface RoutedFlowPoint { x: number; y: number; }

export interface RoutedFlow {
  bundleId: string;             // `${from}|${to}` — matches bundleTransactions
  from_entity_id: string;
  to_entity_id: string;
  points: RoutedFlowPoint[];    // ordered: exit point … corners … entry point
  exitSide: 'left' | 'right';
  entrySide: 'left' | 'right';
  labelSegmentIndex: number;    // index of the longest horizontal segment, for label placement
  trackOffset: number;          // px offset applied within shared lanes (for parallel separation)
}

export function routeFlows(args: {
  bundles: TransactionBundle[];               // visible bundles (from focus mode)
  entityRects: Map<string, { x: number; y: number; width: number; height: number }>;
  tierBands: Array<{ topY: number; bottomY: number }>;   // see below
}): Map<string, RoutedFlow>;                  // keyed by bundleId
```

`tierBands` is derived from the rendered entity rectangles, not a new `tierLayout` output: group `entityRects` by their `y` value (each distinct row of entities is a band), and the gap between consecutive bands' `bottomY` and `topY` is a horizontal lane. `StructureChart` computes this from the node positions it already holds and passes it in — `tierLayout` itself is not modified.
```

Algorithm:

1. **Collect** visible bundles.
2. **Exit/entry side per flow** (Rule 2):
   - target right of source → exit `right`, entry `left`
   - target left of source → exit `left`, entry `right`
   - source and target at nearly the same x (|Δx| < entity width) → choose the side with the most free space / fewest flows already routed there.
3. **Path skeleton** (Rule 4):
   - exit point: the chosen side of the source entity, at vertical center
   - short horizontal exit stub
   - vertical segment to the target horizontal lane (the inter-tier/inter-row gap nearest the target's row)
   - horizontal segment through that lane to the target's column
   - vertical segment to entry height
   - entry stub into the chosen side of the target
4. **Lane/track assignment** (Rule 5): collect all flows sharing a lane segment, sort them (by source x, then target x), assign each a track index → `trackOffset` (12px spacing). Parallel, no crossings within a lane.
5. **Label segment** (Rule 7): `labelSegmentIndex` = the longest horizontal segment. The label renders mid-segment, above the line, offset per track to avoid label collisions.
6. **Output**: `Map<bundleId, RoutedFlow>`.

For flows between entities in the **same tier** (siblings transacting): route down into the lane below the tier (or up into the lane above — whichever is less congested), horizontally, then back up/down to the target side.

For **generation-skip** flows (source 2+ tiers from target): the vertical segments route through a vertical column-lane near the source/target columns, not straight down through intervening boxes.

### 3.3 `PaymentFlowEdge` rendering (`src/components/structure/edges/PaymentFlowEdge.tsx`)

Replaces `TransactionBundleEdge`. Receives the `RoutedFlow` (auto) **or** the persisted manual path via `data`. Builds an SVG path string:

- Straight segments between consecutive points.
- Corners rounded with arc segments, radius 8-12px (Rule 3b).
- Exit/entry stubs as short quadratic-bezier curves easing out of / into the entity side (Rule 3a).
- Stroke: `PALETTE.normalTransactionStroke` (blue) or `PALETTE.mismatchStroke` (red if `bundle.hasMismatch`), `strokeWidth: 1.5` (thinner than ownership's 2). Arrowhead at the target end.
- Label: bundle summary ("N transactions · €X" or single-transaction label), positioned on `labelSegmentIndex`'s midpoint (or the persisted `label_position`), draggable (§4.6).
- Click label → bundle popover (unchanged from MVP-3.9).
- When `selected`: render editing handles (§4).

Ownership edges (`OwnershipEdge`) are **unchanged** — sharp right-angle corners, percentage label. The corner-style difference (sharp vs rounded) is the primary visual signal distinguishing ownership from payment, alongside color.

No full bezier curves source→target — they make crossings and lane management unmanageable with multiple flows.

## 4. Part B — Manual editing

### 4.1 Selection

Click a flow → react-flow native `selected` state. `PaymentFlowEdge` then renders:
- A light highlight on the path.
- Endpoint handles at source and target.
- Waypoint handles at every corner.
- Mid-segment handles on every straight segment.

Click outside / on another flow → deselect. The `Delete` key removes the selected flow; if the bundle contains any non-null `amount_eur`, a confirmation dialog appears first.

### 4.2 Segment dragging

- Drag a **horizontal** segment vertically → shifts its lane. The vertical segments before and after auto-adjust length.
- Drag a **vertical** segment horizontally → shifts its column. The horizontal segments before and after auto-adjust length.
- While dragging: snap to an 8px grid, and snap to the position of other parallel segments so flows align.

### 4.3 Waypoint dragging, adding, removing

- Drag a corner → the path stays orthogonal: adjacent segments stay horizontal/vertical, only their lengths change.
- Double-click a segment → adds a new waypoint at that position, splitting the segment.
- Double-click a waypoint → removes it, *if* the path stays orthogonal afterward; otherwise the action is ignored and a tooltip explains why.

All path operations live in a pure module `src/components/structure/flowEditing/pathOps.ts` (orthogonality-preserving segment drag, waypoint add/remove, snap) — independently testable.

### 4.4 Endpoint dragging (reconnect)

Drag an endpoint from source or target onto another entity → reconnects the flow (react-flow `onReconnect`). While dragging: highlight the entity under the cursor — green border = valid drop target, red = invalid (e.g., same entity as the other end). The endpoint snaps to the **side** (left or right) of the target entity, never top/bottom.

### 4.5 Auto vs manual status

A flow starts as `auto` (no row in `atad2_structure_flow_routing`). The first manual edit creates a row with `routing_mode = 'manual'` and the current `waypoints`.

- Manual flows are **not** touched by the automatic re-routing pass (e.g., after Auto-arrange or after an entity moves).
- When a connected entity is moved: the manual flow's **endpoints follow the entity** (react-flow native — edges are bound to node IDs), the **waypoints keep their absolute positions**, and the exit/entry stub segments stretch to reconnect. The path deforms; it does not re-route. (No prompt.)
- Auto flows fully re-route whenever entity positions change.

### 4.6 Label dragging

The label is draggable along/around the path. Default position: midpoint of the longest horizontal segment, above the line. A dragged position persists as `label_position`. Double-click the label → edit the bundle (opens the bundle popover / inspector — editing individual transaction amounts/types stays in the inspector, consistent with MVP-3.8).

### 4.7 Reset

- Per flow: right-click the flow → context menu → "Reset routing" → deletes the `atad2_structure_flow_routing` row → the flow reverts to auto on the next routing pass.
- Toolbar: "Reset all routing" → deletes all routing rows for the chart → every flow reverts to auto.

### 4.8 Undo / redo

`Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`. In-memory, session-scoped, command-pattern history in `src/components/structure/flowEditing/useFlowEditHistory.ts`. Each editing action (segment drag, waypoint add/remove/move, endpoint reconnect, label move, reset) is one undoable command. History is **not** persisted — it lives only for the current session.

### 4.9 Toolbar

`FloatingToolbar` gains four controls:
- **Auto-arrange** — re-runs the routing pass for all non-manual flows.
- **Reset all routing** — §4.7.
- **Toggle grid** — shows/hides an 8px grid background while editing.
- **Snap to grid** — on/off toggle for the snap behavior in §4.2.

## 5. Data model

New table:

```sql
CREATE TABLE public.atad2_structure_flow_routing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id        uuid NOT NULL REFERENCES public.atad2_structure_charts(id) ON DELETE CASCADE,
  from_entity_id  uuid NOT NULL REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  to_entity_id    uuid NOT NULL REFERENCES public.atad2_structure_entities(id) ON DELETE CASCADE,
  waypoints       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array of { x, y }
  label_position  jsonb,                                -- { x, y } | null = auto
  routing_mode    text NOT NULL DEFAULT 'manual'
                    CHECK (routing_mode IN ('auto','manual')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chart_id, from_entity_id, to_entity_id)
);
CREATE INDEX idx_structure_flow_routing_chart ON public.atad2_structure_flow_routing(chart_id);
```

Plus:
- RLS policies identical to the other `atad2_structure_*` tables (row visible iff the chart's session belongs to `auth.uid()`), for SELECT / INSERT / UPDATE / DELETE.
- `updated_at` trigger via `public.update_updated_at_column()`.
- `GRANT ALL ... TO service_role`.

**Semantics:** a row exists ⟺ the flow has been manually edited. Auto flows have no row (their paths are computed by the routing pass). "Reset routing" deletes the row.

**`routing_mode` column:** currently always `'manual'` when a row exists, so it is technically redundant. It is kept so a future iteration can support "freeze a flow on auto-routing but keep a custom `label_position`" without a migration. Flagged in the self-review as a known minor redundancy.

`src/lib/structure/client.ts` gains:
- `listFlowRouting(chart_id: string): Promise<StructureFlowRouting[]>`
- `upsertFlowRouting(row: Partial<StructureFlowRouting> & { chart_id; from_entity_id; to_entity_id }): Promise<StructureFlowRouting>`
- `deleteFlowRouting(chart_id: string, from_entity_id: string, to_entity_id: string): Promise<void>`
- `deleteAllFlowRouting(chart_id: string): Promise<void>`

`src/lib/structure/types.ts` gains `StructureFlowRouting` (the row type).

## 6. Files

### New
```
supabase/migrations/<timestamp>_flow_routing.sql                   // §5 table + RLS + trigger + grant
src/lib/structure/flowRouting.ts                                   // §3.2 pure routing pass
src/lib/structure/__tests__/flowRouting.test.ts                    // routing unit tests
src/components/structure/edges/PaymentFlowEdge.tsx                 // §3.3 + §4 custom edge + handles
src/components/structure/flowEditing/pathOps.ts                    // §4.3 pure path operations
src/lib/structure/__tests__/pathOps.test.ts                        // path-op unit tests
src/components/structure/flowEditing/useFlowEditHistory.ts         // §4.8 undo/redo
```

### Modified
```
src/lib/structure/types.ts                                        // StructureFlowRouting type
src/lib/structure/client.ts                                       // §5 flow-routing CRUD helpers
src/components/structure/StructureChart.tsx                       // run routing pass, register PaymentFlowEdge, wire selection/reconnect/grid
src/components/structure/StructureChartStep.tsx                   // load flow routing, persistence handlers, undo/redo wiring
src/components/structure/FloatingToolbar.tsx                      // §4.9 Auto-arrange / Reset all / Toggle grid / Snap toggle
```

### Deleted
```
src/components/structure/edges/TransactionBundleEdge.tsx          // replaced by PaymentFlowEdge
```

## 7. Tests

### 7.1 `flowRouting.test.ts`
- **Exit/entry side**: target right of source → exit right / entry left; target left → exit left / entry right; same x → side-with-most-space chosen.
- **Path skeleton**: a same-tier flow routes down into the lane below, horizontal, back up. A generation-skip flow routes through a column-lane, not through boxes.
- **No box crossings**: for a synthetic chart, assert no routed segment intersects a non-endpoint entity rect.
- **Lane/track assignment**: 3 flows sharing one lane get 3 distinct track offsets; no two flows overlap within the lane.
- **Label segment**: `labelSegmentIndex` points at the longest horizontal segment.

### 7.2 `pathOps.test.ts`
- **Waypoint add**: double-click position splits a segment into two; path stays orthogonal.
- **Waypoint remove**: removing a corner that keeps the path orthogonal succeeds; one that would break orthogonality is rejected.
- **Segment drag**: dragging a horizontal segment changes its y; adjacent vertical segments' lengths update; x of other points unchanged.
- **Snap**: a drag near an 8px gridline snaps to it; a drag near a parallel segment snaps to align.

### 7.3 Not unit-tested
The drag-interaction UI layer (pointer handlers, react-flow selection/reconnect, toolbar) is verified via the manual smoke test — too DOM/event-heavy for meaningful unit coverage.

## 8. Manual smoke test

On the dev server, in a chart with several transactions, focus an entity so flows show:

1. **Auto routing** — flows exit/enter entity sides only, never top/bottom. Paths are orthogonal with rounded corners and curved stubs. No flow crosses an entity box. Multiple flows in one lane run parallel, not overlapping.
2. **Ownership unchanged** — ownership lines still have sharp corners and percentage labels.
3. **Select** — click a flow → highlight + endpoint/waypoint/mid-segment handles appear.
4. **Segment drag** — drag a horizontal segment up/down → lane shifts, neighbors adjust. Snaps to 8px grid.
5. **Waypoint add/remove** — double-click a segment → new corner. Double-click a corner → removed (or tooltip if it would break orthogonality).
6. **Endpoint reconnect** — drag an endpoint to another entity → green/red feedback, snaps to the entity side, flow reconnects.
7. **Label drag** — drag a flow label → it moves and stays; double-click → opens the bundle popover.
8. **Manual status** — after editing a flow, move a connected entity → the flow's endpoints follow, waypoints stay, path deforms; it does not re-route. An un-edited flow fully re-routes.
9. **Undo/redo** — Ctrl+Z reverts the last edit; Ctrl+Shift+Z re-applies.
10. **Reset** — right-click a manual flow → "Reset routing" → reverts to auto. Toolbar "Reset all routing" → all flows revert.
11. **Toolbar** — Auto-arrange re-routes non-manual flows; Toggle grid shows/hides the grid; Snap toggle enables/disables snapping.
12. **Persistence** — manually edit a flow, reload the page → the manual path and label position come back exactly.

## 9. Out of scope

- Ownership-line styling or routing — unchanged.
- The entity-layout algorithm (`tierLayout`) — unchanged, unless strictly necessary.
- Collaborative / multi-user editing.
- Flow templates, bulk-editing of flows.
- Persisting undo/redo history across sessions.

## 10. References

- MVP-3.8 spec: `docs/superpowers/specs/2026-05-12-tcm-structure-chart-refactor-design.md`
- MVP-3.9 spec: `docs/superpowers/specs/2026-05-13-transaction-focus-mode-design.md`
- React Flow custom edges: https://reactflow.dev/learn/customization/custom-edges
- React Flow reconnectable edges: https://reactflow.dev/examples/edges/reconnect-edge
- Memory: `feedback_tax_chart_conventions.md`
