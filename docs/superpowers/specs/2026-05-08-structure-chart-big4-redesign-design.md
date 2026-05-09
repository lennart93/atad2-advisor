# Structure Chart Big4 Redesign — Design Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorm → spec)
**Builds on:** `docs/superpowers/specs/2026-05-08-structure-chart-layout-upgrade-design.md` (the just-shipped MVP-2)
**Owner:** Lennart Wilming

## 1. Goal

Replace the current ELK-based structure-chart layout with a Big4-style strict-tier layout that produces clean, predictable, deliverable-quality charts. After this round, the chart should look like a real Big4 (Deloitte / EY / PwC / KPMG) tax-memo structure chart: strict horizontal tiers, generous whitespace, no crossing diagonals, aggressive clustering of non-ATAD2-relevant subtrees, hidden orphans, tier-headers, and individuals rendered with consistent visual weight.

## 2. Why this matters

The just-shipped MVP-2 (ELK + clusters + floating panels) renders 50+ entity charts as a wirwar (see screen4.jpg): empty top half, scattered entities without clean ranks, crossing edges, only 8 of 50+ entities clustered, floating stick figures with no visual weight. None of that resembles the strict tier-and-grid look that Big4 deliverables require, and the user explicitly rejected the result.

Root causes:

1. **ELK is too clever.** With multi-parent ownership (DAG) and 50+ nodes, ELK's `layered` algorithm produces logically-correct but visually noisy output. We don't actually need its sophistication — Big4 charts are structurally simple.
2. **Clustering is too conservative.** The current rule "non-relevant AND no relevant descendants" only catches leaf-level subsidiaries. Real concerns have whole subtrees of operational subsidiaries that should be one cluster card.
3. **Orphans clutter the canvas.** Entities with no path to the taxpayer (joint ventures, far-away groups extracted by mistake) still render in the main chart with no positional logic.
4. **Individuals lack visual weight.** UBOs render as bare stick figures with floating text, breaking the rectangular grid feel.
5. **Layout doesn't always run.** The `(0,0) detection` gate skips layout entirely for charts with stale stored positions, preserving past chaos.

A predictable, custom tier-layout — combined with stronger clustering, hidden orphans, and tier-header chrome — gives users the deliverable-quality chart they expect.

## 3. Scope

### In MVP-3 (this spec)
- Drop `elkjs` for the structure-chart canvas (admin chart still uses dagre).
- Custom `tierLayout.ts` that anchors on the taxpayer, BFS-assigns ranks, places nodes in strict horizontal tiers with even X-spread per tier.
- Layout runs on every data change (no `(0,0)` gate). User-drag positions are not persisted across data changes.
- Aggressive clustering: any non-relevant subtree (≥2 non-relevant siblings under one parent) is collapsed into a single stacked-card cluster node showing the **total subtree size**, with mixed-jurisdiction breakdown.
- Orphans (entities with no rank) are removed from the main chart and surfaced via a floating `+ N disconnected entities ▾` banner bottom-right.
- Tier headers (left margin) labelled `UBO`, `UPE`, `Parents`, `Taxpayer`, `Tier +1`, `Tier +2`, ... — auto-generated from the ranks present.
- Individuals: rendered as a consistent `100×60px` colored box with the stick-figure inside; name + jurisdiction below the box (same vertical placement as corp boxes for visual rhythm).
- Connectors: switch React Flow's default edge type to `'step'` for crisp 90° bends; bus-like effect arises naturally when children share Y.
- `fitView` after layout with `padding: 0.08`, `minZoom: 0.4`, `maxZoom: 1.0`.

### Explicitly out of scope (deferred)
- Custom shared "bus" SVG layer to make sibling connectors visually merge into one trunk
- "Lock layout" toggle that protects user-drag positions from re-layout
- Jurisdiction swimlanes (vertical lanes per country)
- Per-tier collapse (hide entire tier with one click)
- Position-persistence across sessions (always recompute from data)

## 4. Layout algorithm

### 4.1 Data flow

```
INPUT:
  entities[]           — all StructureEntity rows
  ownership_edges[]    — edges with kind='ownership'
  transaction_edges[]  — edges with kind='transaction'
  taxpayer_id          — entity with is_taxpayer=true (or fallback)
  expandedClusters     — Set<clusterId> the user has manually expanded

OUTPUT:
  positions             Map<entity_id, {x,y}>     // visible (non-clustered) entities
  clusterPositions      Map<cluster_id, {x,y}>    // cluster placeholders
  ranks                 Map<entity_id, number>    // signed rank (-N..0..+N)
  ranksRendered         number[]                  // sorted ascending; for tier-header rendering
  orphans               StructureEntity[]         // for the disconnected banner
```

### 4.2 Steps

1. **Anchor**: pick taxpayer (`is_taxpayer=true`) → fallback UPE (no incoming edges, most descendants) → fallback first entity. Reuses existing `selectAnchor()` from `elkLayout.ts` (will move to `tierLayout.ts`).
2. **Rank assignment**: BFS along ownership edges. Parents → negative ranks. Children → positive. Multi-parent (DAG): minimum-distance wins. Reuses existing `assignRanks()`.
3. **Orphan filter**: entities not in the rank map go straight into `orphans[]` and are not laid out.
4. **Aggressive clustering**: per parent, group all non-ATAD2-relevant direct children whose entire subtree is also non-relevant (no relevant descendants anywhere downstream). If ≥2 such children, collapse them and their full subtrees into one cluster.
   - The cluster's count = total entities in all collapsed subtrees (not just direct children).
   - Cluster placeholder gets the parent's rank + 1 (sits where the children would).
   - User-expanded clusters (in `expandedClusters`) are not collapsed; their members participate as individual nodes.
5. **Sibling sort within rank**: deterministic ordering for stable layout:
   - `is_taxpayer = true` first (so taxpayer is centered when it shares a rank — but in practice the taxpayer is alone in its rank)
   - Then non-cluster entities sorted by `(jurisdiction === 'NL' ? 0 : 1, name)`
   - Then clusters last (so they sit on the right edge of the row)
6. **Position assignment**:
   - `Y(rank) = (rank - minRank) * VERT_SEP` where `VERT_SEP = 160`
   - `X(i) = (i - (slots-1)/2) * HORIZ_SEP` where `HORIZ_SEP = 180`, `slots = entities + clusters in that rank`, and `i` is the 0-indexed position
   - Result: each rank is centered around X=0; taxpayer sits at (X=0, Y=0); other tiers spread above and below.
7. **Output**: assemble `positions`, `clusterPositions`, `ranksRendered`, `orphans`.

### 4.3 Always re-layout

The `StructureChartStep` no longer gates layout on `(0,0)` detection. It calls `tierLayout()` on:
- Initial mount once entities load
- Every change to `entities`, `edges`, or `expandedClusters`
- Re-extract trigger
- User clicks Auto-layout button

Because `tierLayout` is synchronous and fast (<5ms for 200 nodes), this is cheap. User-drag positions live in React state for the current session but are overwritten on next data change.

## 5. Aggressive clustering rules

A child entity `C` of parent `P` qualifies for clustering if:
- `C` is **not** ATAD2-relevant by the existing 5 criteria (`is_taxpayer`, ancestor-chain, has-transaction-edge, hybrid-type, fiscal-unity-with-taxpayer), AND
- `C`'s subtree contains **no** relevant descendant either (recursive check)

If `P` has ≥2 children matching the criteria, all of them and their subtrees collapse into one cluster.

Edge cases:
- 1 matching child of `P`: skip clustering (no visual gain).
- A child `C` that is non-relevant but has a relevant descendant `D` deep down: `C` is **promoted** (rendered as a normal node) so `D`'s ancestor-chain stays visible. `C`'s non-relevant siblings still cluster among themselves.
- Mixed jurisdiction cluster: split fill (left half teal, right half salmon). Country breakdown shown as `(NL · 6, US · 2)`.
- Cluster expansion: clicking the cluster card toggles `expandedClusters`, which removes that cluster's id from the cluster set and promotes all members. Layout re-runs.

## 6. Visual chrome

### 6.1 Tier headers (`TierHeaders.tsx`)

Static text labels at the left margin, one per rendered rank:

| Rank | Label |
|---|---|
| ≤ -3 (only when individuals exist) | `UBO` |
| -2 (or the most negative rank that's not UBO) | `UPE` |
| -1 | `Parents` |
| 0 | `Taxpayer` |
| +1 | `Direct subs` |
| +2, +3, ... | `Tier +2`, `Tier +3`, ... |

Style: `Inter`, 10px, uppercase, letter-spacing 0.06em, fill `#888`. Positioned absolutely at `(canvasLeft + 16, Y(rank) + 12)` so they vertically align with the row's top edge. Rendered as a plain `<div>` overlay over React Flow (not as a React Flow node).

### 6.2 Disconnected banner (`DisconnectedBanner.tsx`)

Floating card bottom-right of the canvas, 16px from edges. Default closed:

```
+ 5 disconnected entities ▾
```

Click → opens upward as a popover listing the orphan entities (name, jurisdiction, type). Each row has a "Link to..." button (out of scope for MVP-3, render as disabled stub) and an "Accept as irrelevant" button (also disabled stub). For MVP-3, the popover is read-only — users see the count, can review the names, and re-extract or manually edit the entity in the inspector to give it ownership.

If `orphans.length === 0`: banner not rendered.

### 6.3 Individual rendering

`EntityNode.tsx` is updated so individuals render with the same visual weight as corps:
- A `100×60px` colored box, fill `#595550` (dark grey from palette)
- Stick figure inside the box, drawn in white at scale that fits
- Name and `(ISO)` rendered **below** the box (same as the current corp / partnership / oval layout, but the box itself is dark grey instead of teal/salmon)

This keeps the grid feel — every node has a consistent rectangular footprint — without losing the symbolic distinction (figure inside).

### 6.4 Edges

`StructureChart.tsx`'s `defaultEdgeOptions` switches from `{ type: 'smoothstep' }` to `{ type: 'step' }`. Crisp 90° bends. Children sharing a Y produce visually-aligned bus-like trunks (the connectors overlap exactly in the middle, looking like a single shared bus, even though each is technically a separate edge).

### 6.5 Viewport fit

After every `setNodes` (which runs after every layout change), the existing `useReactFlow().fitView()` effect runs with new options:

```ts
reactFlow.fitView({
  padding: 0.08,
  minZoom: 0.4,
  maxZoom: 1.0,
  duration: 250,
});
```

`padding: 0.08` gives the generous Big4-deliverable whitespace. `minZoom`/`maxZoom` prevent absurd zooms on extreme chart sizes.

## 7. Files

### Created
- `src/lib/structure/tierLayout.ts`
- `src/lib/structure/__tests__/tierLayout.test.ts`
- `src/components/structure/TierHeaders.tsx`
- `src/components/structure/DisconnectedBanner.tsx`

### Modified
- `src/lib/structure/relevance.ts` — aggressive-clustering rule (see §5)
- `src/components/structure/StructureChartStep.tsx` — call `tierLayout`, render `TierHeaders` + `DisconnectedBanner`, drop `(0,0)` gate, drop async ELK plumbing
- `src/components/structure/StructureChart.tsx` — `defaultEdgeOptions={{ type: 'step' }}`, updated `fitView` opts
- `src/components/structure/nodes/EntityNode.tsx` — individuals render with consistent box-style
- `package.json` — remove `elkjs` dep

### Deleted
- `src/lib/structure/elkLayout.ts`
- `src/lib/structure/__tests__/elkLayout.test.ts`

`selectAnchor` and `assignRanks` are moved verbatim from `elkLayout.ts` into `tierLayout.ts` (no behaviour change). The `clusterId(c)` helper moves with them.

## 8. Tests

`tierLayout.test.ts` (~7 tests):
- Anchor at rank 0, parent at -1, child at +1 (basic)
- Y mapping is deterministic and rank-ordered (rank 0 → minY among rendered)
- X-spread within a rank is centered around 0
- Taxpayer with no rank-mates sits at X=0
- Cluster placeholders appear in their rank's slot count
- Multi-parent (DAG) entity gets the minimum-distance rank
- Orphans appear in `orphans[]`, not in `positions`

`relevance.test.ts` (update):
- Existing tests still pass
- New test: cluster's `member_ids` includes the **entire subtree** (children + grandchildren) when the whole subtree is non-relevant
- New test: a non-relevant parent of a relevant grandchild is **not** clustered; only its non-relevant sibling subtrees cluster

`elkLayout.test.ts` deleted along with its module.

## 9. Performance

- `tierLayout` is sync, O(N log N) per render (sort within ranks). Benchmarked target: <5 ms for 200 entities.
- React Flow re-renders unchanged.
- Bundle: `elkjs` removed = −370 kB minified (−117 kB gzip). The `AssessmentStructure` chunk drops from ~1.46 MB to ~1.1 MB.

## 10. Open follow-ups

- Custom shared "bus" SVG layer for connector aesthetics
- "Lock layout" toggle to persist user drags across data changes
- Jurisdiction swimlanes (vertical lanes per country)
- "Hide entire tier" affordance for very deep concerns
- DocxExport: render the chart-PNG with the same Big4 aesthetic (currently inherits whatever the canvas shows)

## 11. References

- MVP-2 spec: `docs/superpowers/specs/2026-05-08-structure-chart-layout-upgrade-design.md`
- Visual reference (approved): `.superpowers/brainstorm/4414-1778239443/content/big4-clean.html`
- User's broken state: `screen4.jpg`
