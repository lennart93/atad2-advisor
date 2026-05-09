# Structure Chart Layout Upgrade — Design Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorm → spec)
**Builds on:** `docs/superpowers/specs/2026-05-07-corporate-structure-chart-design.md` (MVP)
**Owner:** Lennart Wilming

## 1. Goal

Upgrade the corporate-structure-chart MVP to be readable and visually credible on real concerns (50+ entities, multi-tier ownership). The MVP delivers correct shape conventions and an editable canvas, but its layout flattens deep hierarchies and crowds non-ATAD2-relevant entities. After this upgrade:

- The taxpayer is the visual focal point of every chart; ancestors render above, subsidiaries render below, in clear ranks.
- Non-ATAD2-relevant entities are collapsed into stacked-card "cluster" nodes the user can expand on demand.
- The canvas occupies the full viewport (palette, inspector and toolbar are floating overlays).
- Visual chrome is white-clean: white background, subtle grid, blue selection outline.

## 2. Why this matters

Internal QA on a real S4 Energy taxpayer (54 entities, 21 ownership edges, 31 transactions) revealed:

- Dagre with `rankdir: 'TB'` produced a horizontal chain when extraction returned ambiguous parent edges, hiding the actual hierarchy.
- Three-column layout left only ~310 px of canvas width on a typical viewport, forcing nodes to bunch.
- A warm-beige background fought the colored entity fills for visual attention.
- The canvas's parent `<div>` lacked an explicit width/height, causing a `[React Flow]: parent container needs a width and a height` console warning.

Together these made the deliverable feel amateurish on the very inputs it's meant to handle. This upgrade addresses each cause.

## 3. Scope

### In MVP-2 (this spec)
- Replace `dagre` with `elkjs` for structure-chart layout (taxpayer-centric, layered, partitioned).
- Detect taxpayer (`is_taxpayer = true`) and walk ownership edges to assign ranks (parents negative, taxpayer 0, children positive).
- Cluster non-ATAD2-relevant siblings under each parent into a stacked-card cluster node; click to expand/collapse.
- Replace the three-column page layout with a full-viewport canvas plus three floating overlays (palette top-left, inspector top-right, toolbar bottom-center).
- White canvas background; subtle grid; blue selection outline.
- Fix the React Flow width/height warning by sizing the parent `<div>` explicitly.

### Explicitly out of scope (deferred)
- Jurisdiction swimlanes
- Draggable/dockable floating panels
- ELK in a Web Worker (current main-thread perf is acceptable up to ~200 nodes)
- Custom orthogonal edge bend-points (smoothstep is sufficient)
- Persisted "user-marked relevant" override (relevance is recomputed each layout pass; user edit propagates via existing entity-update flow)

## 4. Layout algorithm

### 4.1 Anchor selection
1. Find the entity with `is_taxpayer = true`. Use it as anchor (rank 0).
2. If multiple match: pick the first one and log a warning.
3. If none match: fall back to UPE detection — pick the entity with no incoming ownership edges. If multiple UPEs exist (forest), pick the one with the most descendants.
4. If the chart is empty or has no ownership edges: skip layout (entities keep their stored positions or stay at the origin).

### 4.2 Rank assignment
- BFS along **incoming** ownership edges from anchor → parents at rank -1, grandparents at rank -2, ...
- BFS along **outgoing** ownership edges from anchor → children at rank +1, grandchildren at rank +2, ...
- Multi-parent entities (DAG): assign the rank corresponding to the **shortest** distance to the anchor along any ownership path.
- Orphans (no path to anchor in either direction): collected into a "side cluster" laid out as a small standalone graph rendered to the right of the main column.

### 4.3 Clustering of non-relevant entities
An entity is **ATAD2-relevant** if any of:
- `is_taxpayer = true`
- It lies on the ancestor-chain from taxpayer to UPE
- It has at least one transaction edge (kind = `transaction`) in or out
- Its `entity_type` is `dh_entity`, `hybrid_partnership`, or `reverse_hybrid`
- It is a member of a fiscal-unity grouping that includes the taxpayer

For each parent in the chart, group its **direct children that are non-relevant AND have no relevant descendants** into a cluster. The cluster is replaced by a single placeholder node before ELK runs. After ELK, the chart renders the cluster as a stacked-card node showing `<n> other subsidiaries · (jurisdictions)`.

Edge cases:
- Cluster of size 1: skip clustering (no visual gain).
- Cluster contains entities of mixed jurisdictions: render the card with split fill (left half teal, right half salmon) to signal the international mix.
- A non-relevant entity with relevant descendants: not clustered (the descendant chain forces the parent to be visible).

User can expand a cluster (click): the cluster placeholder is removed, its members are promoted to individual nodes, ELK re-runs with smooth (~250ms) position transitions, the chart re-fits the viewport. Each promoted member shows a small "Collapse" affordance to re-cluster.

### 4.4 ELK configuration
```ts
const elk = new ELK();
const graph = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': 'DOWN',
    'elk.layered.layering.strategy': 'INTERACTIVE',
    'elk.layered.spacing.nodeNodeBetweenLayers': '80',
    'elk.spacing.nodeNode': '60',
    'elk.partitioning.activate': 'true',
  },
  children: [...],  // each with layoutOptions: { 'elk.partitioning.partition': String(rank + 1000) }
  edges: [...],     // ownership edges only, transactions excluded from layout
};
const result = await elk.layout(graph);
```

Position output is written back to `atad2_structure_entities.position_x` / `.position_y` via `updateEntityPosition()` (existing helper).

## 5. Components

### 5.1 New
- `src/lib/structure/elkLayout.ts` — taxpayer-anchored ELK wrapper. Async (ELK is Promise-based).
- `src/lib/structure/relevance.ts` — `isAtad2Relevant()`, `groupNonRelevantSiblings()` pure helpers.
- `src/components/structure/FloatingPalette.tsx` — collapsed "+ Entity" button → expanded vertical list of 7 types.
- `src/components/structure/FloatingInspector.tsx` — auto-show on selection, auto-hide on deselect, manual close button. Wraps existing `EntityInspector` and `EdgeInspector` content.
- `src/components/structure/FloatingToolbar.tsx` — bottom-center card: status pill + counts + Auto-layout / Re-extract / Export PPTX buttons.
- `src/components/structure/nodes/ClusterNode.tsx` — stacked-rect custom xyflow node type with click-to-expand.

### 5.2 Modified
- `src/components/structure/StructureChart.tsx`:
  - Background `#ffffff`, grid `rgba(0,0,0,0.04)`.
  - Default edge type `'smoothstep'` (orthogonal-ish bends without manual bendpoints).
  - Selected outline color `#1f5489`.
  - Parent `<div>` gets explicit `width: '100%'; height: '100%'` (fixes React Flow warning).
  - Adds `cluster` to `nodeTypes` registration.
- `src/components/structure/StructureChartStep.tsx`:
  - Replace three-column flex layout with `<main className="relative flex-1">` containing canvas + floating overlays positioned absolutely.
  - Switch the layout-trigger useEffect to call `elkLayout()` (async) instead of `autoLayout()`.
  - Maintain a `clusterExpansion: Record<clusterId, boolean>` state to persist user expand/collapse choices in-session.
  - Pass cluster-aware node list to `<StructureChart>` (cluster placeholders OR expanded members, depending on state).
- `src/lib/structure/dagreLayout.ts` — left untouched (still used by `admin/QuestionFlowCanvas.tsx` which has its own concerns).

### 5.3 Files left in place but no longer rendered by structure-chart UI
- `src/components/structure/EntityPalette.tsx` — content lifted into `FloatingPalette`. The file can be deleted once no other consumer remains.
- `src/components/structure/StructureToolbar.tsx` — content lifted into `FloatingToolbar`. Same.

`EntityInspector.tsx` and `EdgeInspector.tsx` stay — they're embedded inside `FloatingInspector`.

## 6. UX details

### 6.1 Floating overlays
- Palette: 16 px from top-left. Default collapsed to a "+ Entity ▾" pill. Click toggles a vertical popover with 7 entity-type buttons.
- Inspector: 16 px from top-right. Hidden when no selection. On selection, slides in from right (~150 ms ease-out). Has a "✕" to close manually. Internal scroll if content exceeds viewport height minus 32 px.
- Toolbar: 24 px from bottom, horizontally centered. Status pill (`extracting:stage1`, `draft_ready`, `extraction_failed`) on the left, counts in the middle (`54 entities · 21 ownership · 31 transactions`), buttons (Auto-layout, Re-extract, Export PPTX) on the right. During extraction status the pill subtly pulses; action buttons disabled.

### 6.2 Canvas chrome
- Background: `#ffffff`.
- Grid: `<Background gap={40} color="rgba(0,0,0,0.04)" />` (was `rgba(90,85,80,0.15)` on `#ebe5dc`).
- Selected node/edge outline: 2 px solid `#1f5489` with 4 px offset.
- Edge type default: `'smoothstep'` (instead of `'default'`).
- React Flow viewport `fitView` is already wired (from MVP+1 work) and triggers when node positions change.

### 6.3 Cluster node visual
SVG with three stacked rounded rectangles, each offset 4 px down/right from the previous, all with a soft drop shadow. Top rect carries the label and count:

```
              ┌──────────────────┐
            ┌──────────────────┐│
          ┌──────────────────┐│ │
          │  12 other        ││ │
          │  subsidiaries    │└─┘
          │  (NL · 8)        │
          │  (DE · 4)        │
          └──────────────────┘
```

Color rule: all members in NL → teal `#5d8b87` fill. All foreign → salmon `#b56a5e`. Mixed → vertical split (left half teal, right half salmon). Country-code line(s) inside listing the jurisdictions and counts.

Click anywhere on the cluster → expand. Each promoted member gains a small "↩" badge in the top-right; clicking that re-collapses just that one back into the cluster.

## 7. Data model impact

None. The schema from MVP is sufficient. Cluster state is computed client-side from existing fields:
- Relevance is derived from `is_taxpayer`, ownership edges, transaction edges, `entity_type`, and the `atad2_structure_groupings` rows.
- Cluster expand/collapse is in-memory React state; not persisted. Refreshing the page resets all clusters to collapsed.

## 8. Performance

- ELK on the main thread, 50–100 entities: < 200 ms (verified informally; matches ELK's published numbers).
- 200+ entities: 1–2 s, acceptable because layout runs once per re-extract or on user click.
- Clustering reduces the effective node count visible at any time, which keeps frame rates fluid even at scale.

## 9. Testing

- `src/lib/structure/__tests__/elkLayout.test.ts` — pure tests for the rank-assignment logic (NOT ELK itself, which is mocked). Cases: taxpayer found, taxpayer fallback to UPE, parent BFS produces negative ranks, child BFS produces positive ranks, DAG entity gets minimum-distance rank, orphans bucketed separately.
- `src/lib/structure/__tests__/relevance.test.ts` — `isAtad2Relevant` returns true for each of the 5 criteria; `groupNonRelevantSiblings` clusters siblings only when ≥2 non-relevant siblings share a parent.
- Existing tests (palette, shapeGeometry, dagreLayout, extract-schemas) remain untouched.
- Manual smoke-test: golden-path walkthrough on the S4 Energy real session — confirm hierarchy renders correctly, clusters appear for known operating-subsidiary clouds, expand/collapse smooth.

## 10. Open follow-ups (post-MVP-2)

- Persist user "force visible" overrides on individual entities (currently in-session only).
- Jurisdiction swimlanes as an optional view toggle.
- Draggable/dockable floating panels.
- ELK Web Worker for very large concerns.
- Smooth auto-fit-on-cluster-toggle (current implementation re-fits via existing position-signature useEffect; may feel abrupt on rapid toggles).

## 11. References

- ELK layered algorithm: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
- ELK partitioning: https://eclipse.dev/elk/reference/options/org-eclipse-elk-partitioning-activate.html
- React Flow node-types: https://reactflow.dev/learn/customization/custom-nodes
- MVP spec this builds on: `docs/superpowers/specs/2026-05-07-corporate-structure-chart-design.md`
- Visual style memory: `~/.claude/projects/.../memory/feedback_tax_chart_conventions.md`
