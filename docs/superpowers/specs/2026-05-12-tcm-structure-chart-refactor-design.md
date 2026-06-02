# TCM Structure Chart Refactor — Design Spec

**Date:** 2026-05-12 (revised 2026-05-13)
**Status:** Approved (revised, see §0)
**Builds on:**
- `docs/superpowers/specs/2026-05-08-structure-chart-polish-design.md` (MVP-3.6, shipped)
- `docs/superpowers/specs/2026-05-08-structure-chart-hark-and-pptx-design.md` (MVP-3.7, shipped)
**Owner:** Lennart Wilming

## 0. Revision — 2026-05-13

After implementation (uncommitted on `feat/document-prefill`) the user reviewed the in-progress chart against the Duvel reference and requested a shift in the layout strategy. The original spec used *label-aware auto-sizing* — every node took the width its label needed. Visually this made the chart wider than it needed to be, with inconsistent node sizes that drew the eye to widths rather than to structure. The Duvel reference uses **uniform-width boxes with multi-line wrapped names**, packed in tight rows, and falls back to a **second row** when a parent has many children — keeping the whole chart roughly square.

The revision keeps everything from the original MVP-3.8 that does not depend on sizing: the validator (§5), the fiscal-unity overlay (§8), the blocking banner, the PPTX export overlays, and the dagre removal. The layout engine, the label measurement module, and `EntityNode` rendering are re-scoped:

- **`labelMeasure` becomes a line-break oracle**, not a width-meter. It computes how many lines a name wraps to at the fixed node width, and pre-computes the per-line tspan content so SVG rendering is deterministic.
- **`tierLayout` switches to uniform width/height and multi-row siblings.** All entities and clusters take `NODE_WIDTH = 160px`, `NODE_HEIGHT = 100px`. Per tier, if the single-row width would exceed `MAX_ROW_WIDTH = 1200px`, the siblings are split into rows of ≤ `MAX_PER_ROW` children, each row centered under the parent's barycenter, each row connected to the parent via its own hark (horizontal bus) with a shared trunk between rows.
- **`EntityNode` renders the name as multiple `<tspan>` lines** inside the fixed-width box. The 1.5px taxpayer outline, the warning-badge slot, and the four React Flow handles all stay.
- **Auto-sizing logic in `StructureChart`'s `initialNodes`** is replaced by uniform `width = 160`, `height = 100` passes; `labelMetrics` becomes `labelLineBreaks` (a `Map<id, string[]>` of pre-wrapped lines).

Tasks 1 (validator), 5 (banner + overlay), and 8 (PPTX overlay) of the original plan are preserved as-shipped. Tasks 2, 3, 4, 6, 7 are re-implemented per this revision.

The rest of the spec below has been edited inline to reflect the revision.

## 0.1 Revision — 2026-05-13 (iteration 2)

After implementing the §0 revision, the user reviewed the chart again and requested six additional polish items. These fold into MVP-3.8 (still uncommitted on `feat/document-prefill`):

1. **Percentage label position.** Ownership percentages move from the edge midpoint to ~80% along the edge (close to the child). Makes the association between percentage and child entity unambiguous.
2. **Dynamic vertical centering of entity name.** `nameBlockY = 16 + (3 − lines.length) * 7`. A 1-line name renders at y=30 (centered in the text area); a 2-line name at y=23; a 3-line name at y=16 (the existing position). Legal_form and jurisdiction lines stay at fixed positions near the bottom (y = H − 24, y = H − 10).
3. **Strict ownership-only filter.** `visibleEntities` becomes "entities reachable via BFS from the taxpayer over ownership edges". The previous `source === 'user_added' || 'user_edited'` bypass is removed. Consequence: a manually-added entity is hidden until it has an ownership edge.
4. **`+ Entity` becomes a dialog.** `FloatingPalette` opens a dialog with: entity_type, parent_entity (dropdown of existing entities, default = taxpayer), ownership_pct (default 100), name (default "New entity"). Submit creates the entity AND the ownership edge atomically, so the new entity is immediately visible.
5. **`formatLegalForm(s) = s.replace(/\./g, '')`.** Pure display function that strips dots from any legal form (B.V. → BV, S.A. → SA, S.à r.l. → Sàrl, Inc. → Inc). Database stores the original form unchanged; rendering uses the stripped version. Applied in `EntityNode`, `EntityInspector` display surfaces, and `exportToPptx` label construction.
6. **All entities 1.5px black outline.** The taxpayer-conditional in `EntityNode` is removed: every node gets `stroke="#1a1a1a"`, `strokeWidth={1.5}`. The `is_taxpayer` flag remains in data (drives anchor selection, validator, layout) but has no separate visual treatment — taxpayer position is communicated by chart hierarchy.

These items don't change the data model. The §0 architecture (uniform 160×100 nodes, multi-row siblings, line-break oracle, dagre removed) stays. The transaction-edge rendering stays as-is in MVP-3.8 — the MVP-3.9 transaction-focus-mode spec stays in the queue.

## 0.2 Revision — 2026-05-13 (iteration 3)

User feedback after iter 2:

1. **Drop legal_form line from EntityNode.** The entity name already contains the legal form (e.g., "S4 Energy B.V."), so a separate "BV" line below the name is redundant. Remove it. Jurisdiction `(NL)` line stays.
2. **Re-center entity name vertically.** With legal_form gone, the name has more room. Replace iter 2's `nameBlockY = 16 + (3 − lines.length) * 7` with: `nameBlockY = (NODE_HEIGHT − lines.length * 14 − 12) / 2 + 11` so 1-, 2-, and 3-line names all sit visually centered between the top of the box and the jurisdiction line (y = H − 10).
3. **Inline percentage editing on edge labels.** Clicking an ownership-edge's percentage label replaces it with a text input. Enter saves via `upsertEdge`; Escape cancels; blur saves. Implemented in `OwnershipEdge.tsx` with local component state; `StructureChart` passes an `onPctChange(edgeId, newPct)` callback through to the edge component.
4. **Edge routing: top/bottom always.** Remove the MVP-3.8 generation-skip side-handle logic in `StructureChart.tsx` `initialEdges` useMemo. Every ownership edge uses `sourceHandle: 'bottom'`, `targetHandle: 'top'`. Smooth-step path handles orthogonal routing. Visual line-crossings of grandparent edges through middle-tier nodes are accepted per user instruction.
5. **Red warning badge behavior unchanged.** The badge already has a `<title>` tooltip; no code change for this item — it was a clarification.
6. **Cluster size matches entity base.** `ClusterNode` base rect becomes `160 × 100` (was `150 × 80`). The 4px offset stays, so the total stack footprint becomes `168 × 108`. Internal text positions adjust accordingly.
7. **Grey semi-transparent text-backing for non-rect shapes.** Where an entity uses a triangle (partnership, hybrid_partnership inner, reverse_hybrid inner) or stick-figure (individual), render a `<rect>` with `fill="rgba(255,255,255,0.5)"` directly behind the text elements (name, jurisdiction). The backing is constrained to the text's bounding-box area (approximately the middle 60% horizontal × name-block + jurisdiction-line vertical). For rectangle shapes the text already sits inside the fill — no backing needed.

## 0.3 MVP-3.9 — Transaction Focus Mode (now in scope)

Per user direction, the spec at `docs/superpowers/specs/2026-05-13-transaction-focus-mode-design.md` is implemented in this same iteration. Items per that spec:

- `focusedEntityIds: Set<string>` state replacing `showTransactions: boolean`
- Click entity → toggle focus membership; stacked focus across multiple entities
- Bundle aggregation: one bezier per `(focused, counterpart)` pair
- `TransactionBundleEdge` component replaces `TransactionEdge`
- `TransactionBundlePopover` for bundle details
- `bundleTransactions` pure helper + tests
- Toolbar: remove Hide/Show transactions; add "Clear focus (N)"
- PPTX export uses bundles
- Focus visual on entities: teal dashed ring (distinct from black outline and selection blue)

Implementation details remain as in the MVP-3.9 spec — no re-design.

## 0.4 Revision — 2026-05-13 (iteration 4)

User feedback after iter 3 + MVP-3.9:

1. **Cluster re-collapse bug fix.** When a cluster is expanded, its member entities render individually. On re-collapse, the members were still rendered (not filtered from `visibleEntities`), so the chart showed both the cluster placeholder AND the loose members at the same time. Fix in `StructureChartStep`: derive a `renderEntities` value that excludes entities not present in the current `tierResult.positions` keys (= folded members). Layout already produces the right positions; just align the render to it.
2. **Percentage label position — directly above child.** In `OwnershipEdge.tsx`, replace the 80%-along-the-source-to-target heuristic with `labelX = targetX`, `labelY = targetY - 10`. Sits on the vertical drop just above the child, where the eye naturally associates it.
3. **Simpler loading screen.** `AtlasLoader.tsx` keeps the brand `AnimatedLogo` animation but drops the stage breakdown ("extracting:stage1/2/3"), the entity-count progress line, the warnings list, and the "Skip remaining" button. Shows: logo animation + "Loading chart…" text only.
4. **Add transaction UI.** New `AddTransactionDialog.tsx` component plus a "+ Transaction" button in `FloatingPalette.tsx`. Dialog fields: From entity (dropdown), To entity (dropdown), Type (loan / royalty / dividend / service_fee / management_fee / other), Amount in EUR (optional), Mismatch checkbox, and conditionally Mismatch classification (D/NI or DD) + ATAD2 article (text). Submit calls `upsertEdge` with `kind: 'transaction'`. New transaction renders immediately if either from or to entity is in the focus set.

## 0.5 Revision — 2026-05-13 (iteration 5)

User feedback after iter 4:

1. **Transaction edges look weird with the bezier arc.** Switch `TransactionBundleEdge` from `getBezierPath` (curvature 0.6) to `getSmoothStepPath`. Same handles (right → left), but orthogonal routing — out right, horizontal, vertical, horizontal in left. No arcs.
2. **Ownership percentage label too low on the line.** Use `labelX, labelY` from `getSmoothStepPath` directly — the natural path midpoint. Replace the iter 4 `targetX, targetY - 10` override.
3. **Drag transaction labels to reposition.** Make the transaction bundle label `<div>` draggable via local component state (`{ dx, dy }`). Pointer down + drag → offset accumulates; release → label stays at new offset. No persistence — resets on page reload. (Persistence is deferred to a future iteration; would require either a DB column or a localStorage scope.)

Files affected: `TransactionBundleEdge.tsx`, `OwnershipEdge.tsx`. No data model changes.

## 1. Goal

Fix the production-grade defects in the corporate structure chart that block real client use, by rewriting the layout positioning step, adding data validators, and rendering two convention-driven visuals (stacked-paper cluster, fiscal-unity overlay) that are already required by the data model but not yet drawn.

After this spec ships:
- The Castleton / S4 Energy production case renders without node-on-node overlap, without label truncation, with all edges visible, and with multi-parent JV children correctly centered under their parents.
- Long entity names ("Castleton Commodities Luxembourg Holdings S.à r.l.") render in full — no `…` truncation.
- Bad data is surfaced rather than hidden: ownership percentages that don't sum to 100% show a warning badge on the affected child; entities missing legal_form or jurisdiction block render with an error banner; ownership cycles block render with a clear error.
- Disconnected entities (orphans) are hidden by default but counted in the toolbar so the user can reveal and fix them.
- Clusters render as a stacked-paper visual with explicit count ("3WO OpCo's B.V. (29 entiteiten)") matching the Duvel reference convention.
- Dutch CIT fiscal unity members render inside a dashed-outline group with a label, matching the S4 reference convention. Uses the existing `atad2_structure_groupings` table — no schema change.

## 2. Why this matters

Live testing of the Castleton / S4 Energy chart on production exposed four classes of failure that the 2026-05-08 polish + hark specs did not address:

- **Layout positioning is wrong, not just unstyled.** `tierLayout` distributes siblings on a fixed `HORIZ_SEP = 180px` and sorts them alphabetically. With wide labels and multi-parent JV cases, this produces node-on-node overlap, truncated labels, and crossing harks. The smooth-step routing from MVP-3.7 cannot rescue positions that are themselves wrong.
- **Bad data renders silently.** Castleton 62.7% + Participatie Fonds 40% = 102.7% under S4 Energy renders without warning. The real numbers (Castleton Lux 96.65% + Foundation De Andevi 3.35%) would also render without warning. Fiscal conclusions are drawn from this chart; silent rendering of bad ownership data is the worst failure mode.
- **Orphans float disconnected.** Cradle B.V. appears in the production screenshot floating to the right with no edges. The current `visibleEntities` filter only hides orphans when their `source` is `ai_extracted`; user-added orphans render but with no indication that they're disconnected, and AI-extracted orphans simply disappear with no toolbar acknowledgement.
- **Conventions in the data model aren't rendered.** `atad2_structure_groupings` (fiscal_unity / consolidation_group with `member_ids[]`) exists in the schema but `StructureChartStep` never loads it. The Dutch CIT fiscal unity dashed-outline overlay from the S4 reference chart and similar tax-memo deliverables is therefore impossible to produce today.

These four together turn the chart from a working tax-memo instrument into a thing advisors can't trust. Single focused spec.

## 3. Scope

### In MVP-3.8 (this spec)

1. **Hybrid layout-engine rewrite of `tierLayout.ts`.** Keep anchor selection and BFS-based rank toplogy; replace per-tier positioning with label-aware packing, barycenter sweep, multi-parent centering, longest-path layering, and side-handle routing for generation-skipping edges. Delete `dagreLayout.ts` and the `dagre` dependency.
2. **Pure validator module.** Detects ownership-sum violations, missing legal_form/jurisdiction, and cycles. Returns structured results; rendering decides what to show. Orphans (entities disconnected from the anchor's ownership tree) are not detected here — they fall out of `tierLayout` as today.
3. **Stacked-paper cluster visual.** 3-layer SVG with explicit member count in the label.
4. **Fiscal-unity dashed-outline overlay.** New React Flow overlay layer reading `atad2_structure_groupings`.
5. **Orphan toolbar counter.** Toolbar shows "N disconnected — show" when there are orphans; clicking renders them with a red warning badge.
6. **Auto-layout button removed.** Layout already re-runs automatically on every data change; the button is now redundant.

### Explicitly out of scope (cut from the original spec on user direction)

- **No new entity columns.** No `is_focal`, no `business_activity`, no `kvk_number` / `ein` / `tax_residence_iso`.
- **No focal-entity red outline.** Depends on `is_focal`.
- **No color toggle by business activity.** Depends on `business_activity`. Existing jurisdiction-based fill stays as-is. No "off" mode either — the current palette stays.
- **No optional KvK / EIN / tax residence tooltip.**
- **No shape convention change.** Current shape mapping (rect=corporation, triangle=partnership, oval=trust, rect+inner ellipse=D/H entity, rect+inner triangle apex up=hybrid partnership, rect+inner triangle apex down=reverse hybrid, stickman=individual) stays exactly as today. This matches the user's strict tax-chart conventions.
- **No `ownership_voting_only` distinction** from voting vs economic interest (already out per current data model).
- **No multi-class share support.**
- **No in-canvas editing of percentages or reparenting.** Edits still go through the inspector.
- **No animation of structural changes / time travel / version history.**
- **No changes to the already-shipped 2026-05-08 features** (smooth-step hark, side handles for transactions, taxpayer outline, transaction curvature/zIndex/labels, show/hide transactions toggle, recollapse banner, cluster→parent synth edges, PPTX bbox-fit, name dedup, label offset, addOwnershipBus).

### WMC reference

The original spec cited `WMC_-_legal_structure.pptx` in section §7.4 acceptance criteria. The file is not in the repo. The WMC chart image pasted into the brainstorm conversation is what is treated as the WMC reference for visual conformance.

## 4. Layout engine rewrite (`src/lib/structure/tierLayout.ts`)

### 4.1 Public signature — unchanged

```ts
export function tierLayout(args: {
  entities: StructureEntity[];
  ownershipEdges: StructureEdge[];
  clusters: Cluster[];
}): TierLayoutResult;
```

`TierLayoutResult` keeps `positions`, `clusterPositions`, `ranks`, `ranksRendered`, `orphans`. No call-site changes in `StructureChartStep`.

### 4.2 Algorithm phases

Replace the existing body of `tierLayout` with the following pipeline. All phases synchronous and deterministic.

**Phase 1 — Label line-break pre-computation.** Call `wrapLabels(entities)` (new module, §6). For each entity, computes the entity name wrapped into ≤ 3 lines at the fixed `NODE_WIDTH = 160px` (accounting for 16px horizontal padding each side, so available text width ≈ 128px in Inter bold 13px). Returns `Map<entityId, string[]>` — the wrapped lines for the name only. Legal form and jurisdiction stay on their own single lines. Nodes do NOT auto-size; every entity (and every cluster) gets `width = 160`, `height = 100`. A name that doesn't fit in 3 lines is truncated with `…` on the third line.

**Phase 2 — Anchor selection.** Existing `selectAnchor()` stays unchanged.

Cycles are detected by the validator (§5) before this function is called; `tierLayout` assumes a DAG and is not responsible for cycle handling.

**Phase 3 — Longest-path layering.** For each entity, compute `rank(e) = 1 + max(rank(p) for p in parents(e))`, with UPEs at rank 0. Iterative algorithm: initialize all UPEs at rank 0; for each remaining entity, recompute rank as `1 + max(parent.rank)` until stable. Stable in O(V·E) worst case but typically O(V+E). Replaces the current BFS with `Math.abs(candidate) < Math.abs(existing)` minimum-distance logic.

**Phase 4 — Cluster placement on rank.** For each cluster `c`, set `c.rank = parent.rank + 1`. Clusters live on the same rank as their parent's child-tier; multiple clusters per tier are allowed.

**Phase 5 — Barycenter sweep (2 iterations).**
- **Down-sweep:** for each tier from top to bottom, sort slots (entity or cluster) by mean X of their parents. Slots with no parents on the previous tier keep their previous order.
- **Up-sweep:** for each tier from bottom to top, sort slots by mean X of their children.
- 2 full sweeps typically converges; we hardcode 2 for determinism.
- Slot sort key for tie-breaking: `(taxpayer ? 0 : 1, isCluster ? 1 : 0, name)`.

**Phase 6 — Row-wrap and X-packing per tier.**

Constants:
- `NODE_WIDTH = 160`
- `MIN_GAP = 32` (uniform — no scaling needed since widths are uniform)
- `MAX_ROW_WIDTH = 1200`
- `MAX_PER_ROW = floor((MAX_ROW_WIDTH + MIN_GAP) / (NODE_WIDTH + MIN_GAP))` ≈ 6 — caps row count

For each tier in order:
1. Count siblings `N` in the tier.
2. Compute `rowWidth = N × NODE_WIDTH + (N − 1) × MIN_GAP`. If `rowWidth ≤ MAX_ROW_WIDTH`, single row. Otherwise compute `rowsNeeded = ceil(N / MAX_PER_ROW)` and split into rows. Distribute siblings round-robin or sequentially across rows so the last row isn't drastically shorter (e.g., `perRow = ceil(N / rowsNeeded)`).
3. Within each row, order siblings by `preferredX` (= mean X of their parents on the previous row, or 0 for tier 0).
4. Within each row, place siblings left-to-right at uniform `NODE_WIDTH + MIN_GAP` step.
5. Center each row relative to the parents-barycenter (for tier > 0) or canvas center (for tier 0).
6. Compute Y per row inside the tier: row `r` of tier `t` gets `y = baseY_tier_t + r × (NODE_HEIGHT + ROW_GAP)`, where `ROW_GAP = 60` (smaller than between-tier vertical sep).

The result: a tier with N=4 children renders as one row of 4. A tier with N=10 children renders as two rows of 5. A tier with N=13 renders as 3 rows of 5/5/3 (or 5/4/4 by even-distribution).

`tierLayout` returns positions as before, but the tier may span MULTIPLE y-coordinates internally. The `ranksRendered` array stays per-tier (not per-row).

**Phase 7 — Y assignment per tier.**
Each tier reserves vertical space equal to `tierRows × NODE_HEIGHT + (tierRows − 1) × ROW_GAP + TIER_GAP_BELOW`, where `TIER_GAP_BELOW = 80` is the inter-tier vertical space. The first row of tier `t` sits at `y = sum(reservedY for tiers 0..t-1)`. Subsequent rows of the same tier stack at `+ NODE_HEIGHT + ROW_GAP`.

`NODE_HEIGHT = 100` is uniform across all entities and clusters.

**Phase 8 — Cluster positions.** Mirror entity positions: clusters get x/y from the same packing as entities. `clusterPositions` is populated alongside `positions`.

**Phase 9 — Orphan list.** Entities that ranked successfully but were not picked up by any tier (shouldn't happen) plus entities the BFS never reached (orphans by definition). Returned in `orphans` field as today.

### 4.2b Multi-row hark routing

For a tier that wraps into multiple rows, the existing `getSmoothStepPath` (MVP-3.7) handles each parent→child edge independently. For uniform-width nodes with row 1 / row 2 structure, separate edges naturally produce a hark-like appearance: parent.bottom → straight down to row-1.top is short; parent.bottom → straight down past row-1 → row-2.top is a longer drop that visually shares vertical space with row-1's drops.

For visual consistency with the Duvel reference (shared bus per row), the smooth-step routing is sufficient if `borderRadius` and parent-bottom alignment is preserved. No custom edge component is needed; the visual hark emerges from the strict-tier layout where all children in a row share the same Y.

Where row-2 children would have their drops cross row-1 nodes: avoid by aligning the X of row-2 children with the GAPS between row-1 children where possible. The `preferredX` for row-2 children is derived from their parents (same as row 1), so by default they fall under their barycenter and may overlap row-1 columns. Acceptable for v1 — the smooth-step routing curves around the overlap.

### 4.3 Generation-skip edge routing

In `StructureChart.tsx`, in the `initialEdges` useMemo, after positions are known compute for each ownership edge:

```ts
const childRank = ranks.get(e.to_entity_id);
const parentRank = ranks.get(e.from_entity_id);
const skips = childRank != null && parentRank != null && childRank > parentRank + 1;

if (skips) {
  const parentEntity = entities.find(x => x.id === e.from_entity_id);
  const childEntity = entities.find(x => x.id === e.to_entity_id);
  const goRight = childEntity.position_x > parentEntity.position_x;
  return {
    ...baseOwnershipEdge,
    sourceHandle: goRight ? 'right' : 'left',
    targetHandle: 'top',
  };
}
return baseOwnershipEdge; // default top↔bottom
```

`ranks` is exposed from `tierLayout` via the existing `TierLayoutResult.ranks` field, lifted into `StructureChartStep` state and passed to `<StructureChart>` as a new prop `ranks: Map<string, number>`.

### 4.4 Performance

Target: 50 entities < 50ms, 200 entities < 100ms, synchronous. Achievable: each phase is O(V+E) or O(V·E) worst case; barycenter is 2 sweeps × O(V log V) for sorting. Label pre-measure runs once per render via a cached hidden canvas; warm cache is O(V) on subsequent renders.

### 4.5 Removal of dagre

Delete:
- `src/lib/structure/dagreLayout.ts`
- `src/lib/structure/__tests__/dagreLayout.test.ts`
- `dagre` from `package.json` dependencies
- The "Auto-layout" button in `FloatingToolbar.tsx` and its handler in `StructureChartStep.tsx`

The existing useEffect that re-runs `handleAutoLayout` on data changes stays. The function is renamed `runLayout` since "auto" is now the only mode.

## 5. Validators (`src/lib/structure/validator.ts`)

New pure module. No React, no IO. Tested independently.

### 5.1 Module surface

```ts
export type ValidatorSeverity = 'block' | 'warn';

export interface OwnershipSumIssue {
  child_id: string;
  sum_pct: number;        // e.g. 87.3 or 102.7
}

export interface ValidatorResult {
  cycles: string[][];                       // each inner array is one cycle's entity ids in order
  missingFields: Array<{ entity_id: string; missing: ('legal_form' | 'jurisdiction_iso')[] }>;
  ownershipSumIssues: OwnershipSumIssue[];
  hasBlocking: boolean;                     // cycles.length > 0 || missingFields.length > 0
}

export function validate(
  entities: StructureEntity[],
  edges: StructureEdge[],
): ValidatorResult;
```

Orphans are not handled here — they are returned by `tierLayout` as today (`TierLayoutResult.orphans`). The validator only catches data shape problems; layout reachability is the layout's concern.

### 5.2 Rules

- **Ownership-sum.** For each entity `c` that has ≥1 incoming ownership edge, compute `sum = Σ edge.ownership_pct ?? 100` (a `null` percentage is treated as 100% per the spec convention — edges without a percentage imply 100% ownership). If `|sum − 100| > 0.01`, emit `OwnershipSumIssue { child_id: c.id, sum_pct: sum }`. Severity: warn (badge on node, chart still renders).
- **Missing fields.** For each entity, check `legal_form` non-empty and `jurisdiction_iso` non-empty. Emit per-entity `missingFields` entry. Severity: block (render replaced by error banner).
- **Cycles.** DFS-with-color (white / gray / black) over the ownership graph. When the DFS hits a gray node, walk back through the predecessor chain to extract the cycle. Each cycle returned as an array of entity ids in cycle order. Severity: block.

### 5.3 Rendering decisions

In `StructureChartStep`:
- Compute `validation = validate(entities, edges)` in a useMemo.
- If `validation.hasBlocking`: render `<BlockingBanner result={validation} />` instead of the chart canvas. Banner lists missing-field entities and cycle members with "Open in inspector" buttons. `tierLayout` is not called in this state.
- Otherwise: run `tierLayout` and render chart. Pass `ownershipSumIssues` and the orphan-set to `<StructureChart>` for badge rendering.

In `EntityNode.tsx`, accept a new optional `data` field:
- `data.warningBadge?: { kind: 'ownership_sum'; sum_pct: number } | { kind: 'orphan' }`
- When set, render a small SVG badge in the top-right corner: red filled rect (10×10) with white "!" glyph. Hover shows tooltip with the issue text.

Orphan reveal flow:
- Toolbar receives `orphanCount: number` from `tierLayout`'s output (after layout runs).
- When `orphanCount > 0`, toolbar renders a button: "N disconnected · Show". Clicking it flips a `showOrphans` flag in `StructureChartStep` state.
- When `showOrphans` is true, the orphan entities are positioned in a horizontal row at the bottom of the canvas (auto X with `siblingGap = 40 + width`, y = `maxY + tierHeight`) and rendered with `warningBadge: { kind: 'orphan' }`. The button label becomes "N disconnected · Hide".

## 6. Label line-break oracle (`src/lib/structure/labelMeasure.ts`)

New module — repurposed from "measure label widths" to "compute line-breaks at fixed width."

```ts
export function wrapLabels(
  entities: StructureEntity[],
): Map<string, string[]>;
```

For each entity, returns the entity name wrapped to a sequence of strings, each fitting within `NODE_TEXT_WIDTH = 128px` (160 − 16 × 2 padding) when rendered in Inter bold 13px. Max 3 lines; if the name doesn't fit, the third line ends with `…`.

Implementation: lazy hidden `<canvas>` element measured via `CanvasRenderingContext2D.measureText`. Greedy word-wrap algorithm:

1. Split name on whitespace into tokens.
2. Build lines greedily: append next token to current line if it still fits; otherwise push current line and start new.
3. If a single token is wider than `NODE_TEXT_WIDTH`: hard-break at character boundary.
4. If more than 3 lines produced: truncate line 3 by appending `…` until it fits.

Legal form and jurisdiction stay on their own single lines and are NOT wrapped (they're short enough by convention).

Module-level cache `Map<entityId, string[]>` keyed by `${entity.id}:${entity.name}:${entity.legal_form}:${entity.jurisdiction_iso}` so it self-invalidates on entity changes.

### 6.1 EntityNode rendering with multi-line names

`EntityNode.tsx` renders the wrapped name as multiple `<tspan>` elements inside a single `<text>` block. Each tspan gets `x={W/2}` and `dy="1em"` (after the first) so lines stack. The block sits vertically centered within the available area above the legal-form and jurisdiction lines.

```tsx
<text x={W / 2} y={20}
  fontFamily="Inter, system-ui, sans-serif" fontSize={13} fontWeight={700}
  fill={PALETTE.text} textAnchor="middle">
  {data.nameLines.map((line, i) => (
    <tspan key={i} x={W / 2} dy={i === 0 ? 0 : '1.2em'}>{line}</tspan>
  ))}
</text>
```

`data.nameLines: string[]` replaces the old single `data.name`. Other fields (legal_form, jurisdiction_iso, taxpayer outline, warning badge, individual fallback) stay as-is.

## 7. Cluster visual (`src/components/structure/nodes/ClusterNode.tsx`)

Replace the current cluster placeholder with a stacked-paper effect.

### 7.1 Geometry

Three rectangles offset 4px / 8px right + down from the front rect:
- Back rect (z=0): fill `#d8d2c8`, stroke `#8a857d`, 1px
- Mid rect (z=1): fill `#e3ddd0`, stroke `#8a857d`, 1px
- Front rect (z=2): fill matches palette (NL or foreign based on `jurisdictionMix`), stroke `#3a3530` 1px

Front rect is the label rect. Same width and height as a regular entity node, but the overall component width grows by 8px to fit the offset.

### 7.2 Label

Two lines:
- Line 1 (bold, 12px): the cluster's logical name, default "Operating entities" (matching the S4 Energy reference). When the cluster's members share a common naming stem (e.g. all start with "3WO" or all contain "Holding"), use that stem; otherwise fall back to "Operating entities". Derivation is a pure helper in `relevance.ts`; no DB column added.
- Line 2 (11px): `(N entities)` — English per the `feedback_english_only_ui.md` project rule. (The Duvel reference uses Dutch "entiteiten" but English wins to keep UI strings consistent.)

### 7.3 Expand affordance

Click anywhere on the cluster node calls existing `data.onExpand()`. No change to the expand mechanism.

## 8. Fiscal-unity overlay (`src/components/structure/overlays/FiscalUnityOverlay.tsx`)

New React Flow overlay component. Renders dashed-outline rectangles around grouping members.

### 8.1 Data

`StructureChartStep` loads groupings on chart load:
```ts
const [groupings, setGroupings] = useState<StructureGroup[]>([]);
// in loadChart success:
const loadedGroupings = await listGroupings(loaded.chart.id);
setGroupings(loadedGroupings);
```

New helper in `client.ts`:
```ts
export async function listGroupings(chart_id: string): Promise<StructureGroup[]>;
```

Passed to `<StructureChart>` as a new prop.

### 8.2 Rendering

In `StructureChart.tsx`, add `<FiscalUnityOverlay groupings={groupings} />` as a child element of `<ReactFlow>` (inside the `<ReactFlowProvider>` already established by `<ReactFlow>`). The overlay subscribes to the node store via `useStore(s => s.nodeLookup)` (from `@xyflow/react`) so it re-renders reactively while users drag nodes.

For each grouping:
- Compute the bounding box of all member node positions (min/max X, Y + node width/height).
- Add 16px padding.
- Render an SVG `<rect>` with `stroke-dasharray: 4 4`, `stroke: #555`, `fill: none`, `rx: 4`.
- Render the label at the top-left inside the box: white background, 11px Inter 500, color `#333`, padding `2px 6px`, `z-index: 1`.

The overlay renders ABOVE the edges but BELOW the node selection outline (so a selected node's blue ring still wins).

### 8.3 Visual style per kind

- `fiscal_unity` → stroke `#555`, label "Dutch CIT fiscal unity" or the user-supplied `grouping.label`.
- `consolidation_group` → stroke `#999`, dash `8 4` (longer dashes), label "Consolidation group" or user-supplied.

Both styles drawn for the same chart if both exist.

## 9. Files

### Modified
```
src/lib/structure/tierLayout.ts                                   // §4: hybrid rewrite
src/lib/structure/client.ts                                       // §8.1: listGroupings
src/components/structure/StructureChart.tsx                       // §4.3 generation-skip handles, §8.2 overlay, ranks prop
src/components/structure/StructureChartStep.tsx                   // §5.3 validator pipeline, §8.1 groupings load, §4.5 auto-layout removal, orphan reveal flag
src/components/structure/FloatingToolbar.tsx                      // §5.3 orphan counter, §4.5 auto-layout button removed
src/components/structure/nodes/EntityNode.tsx                     // fixed 160x100 box; multi-line name via <tspan>; warningBadge slot; truncate() removed
src/components/structure/nodes/ClusterNode.tsx                    // §7: stacked-paper visual + (N entiteiten) label
src/components/structure/exports/exportToPptx.ts                  // §8.3 dashed-outline overlay export, no changes to existing logic
package.json                                                       // dagre removed
```

### New
```
src/lib/structure/labelMeasure.ts                                 // §6: hidden canvas measurement
src/lib/structure/validator.ts                                    // §5: pure validator
src/components/structure/overlays/FiscalUnityOverlay.tsx          // §8: dashed-outline overlay
src/components/structure/BlockingBanner.tsx                       // §5.3: error banner for block-severity
src/lib/structure/__tests__/validator.test.ts                     // unit tests for validator rules
src/lib/structure/__tests__/labelMeasure.test.ts                  // unit tests for label measurement + cache
```

### Deleted
```
src/lib/structure/dagreLayout.ts
src/lib/structure/__tests__/dagreLayout.test.ts
```

## 10. Tests

### 10.1 `tierLayout.test.ts` — extended

Existing tests stay where compatible (anchor selection, rank assignment). New cases:

- **JV centering**: child with parents at x=−200 and x=+200 lands at x≈0 ± gap tolerance.
- **Generation-skip rank**: A owns B, A owns C, B owns C → C.rank = 2 = max(A.rank+1=1, B.rank+1=2). Longest-path verified.
- **Single-row tier**: 4 children → all on same row, same Y, spaced at `NODE_WIDTH + MIN_GAP` step. No overlap.
- **Multi-row wrap**: 10 children → 2 rows of 5; row 2 sits below row 1 with `ROW_GAP` between them; both rows centered under parent's barycenter.
- **Multi-row distribution**: 13 children → 3 rows (5/4/4 or similar even split, not 6/6/1).
- **Performance**: 50-entity synthetic chart layout < 50ms. 200-entity synthetic chart < 100ms. Wall clock via `performance.now()`.
- **Existing tests** for anchor selection and basic ranks continue to pass.

`tierLayout` is not given cyclic input (the validator gates on cycles first), so no test for cycle handling here.

### 10.2 `validator.test.ts` — new

- **Ownership-sum**: 100% → empty. 87.3% → one issue. 102.7% → one issue. 100.005% → no issue (tolerance). Edges with `ownership_pct: null` count as 100%.
- **Missing fields**: entity with `legal_form: null` and `jurisdiction_iso: 'NL'` → one missingFields entry with `missing: ['legal_form']`. Both missing → one entry with `['legal_form', 'jurisdiction_iso']`. Empty string treated same as null.
- **Cycle**: A→B→A → one cycle of length 2. A→B→C→A → one cycle of length 3. Two independent cycles in the same graph → both returned.
- **hasBlocking**: true iff cycles or missingFields non-empty.

### 10.3 `labelMeasure.test.ts` — new

- **Single short name** → 1 line; equal to the input.
- **Two-word name that fits on one line** → 1 line.
- **Long multi-word name** → wraps to 2-3 lines on word boundaries, all lines fit within `NODE_TEXT_WIDTH`.
- **Name exceeding 3 lines** → 3 lines with `…` on the last.
- **Single token wider than NODE_TEXT_WIDTH** → hard-broken at character boundary.
- **Cache hit**: wrapping the same entity twice returns the same array reference.
- **Cache invalidation**: when entity name changes, re-wraps.

Existing test count: 46. Expected post-change: 46 + ~16 new test cases ≈ 62 tests.

## 11. Manual smoke test

After implementation, on the dev server at `http://localhost:8080` signed in:

1. **Castleton / S4 production case.** Open the existing S4 Energy session. No node-on-node overlap. No `…` truncation in any label. All ownership edges visible. The Castleton 62.7% + Fonds 40% data triggers a warning badge on S4 Energy reading "Ownership 102.7%". The cluster "6 other subsidiaries" sits under its parent with a connecting edge.
2. **S4 Energy reference (corrected data).** Manually edit Castleton to 96.65% and add Foundation De Andevi at 3.35%. Warning badge disappears.
3. **Duvel Moortgat case.** Create a new session with Duvel Moortgat NV at the top, Duhco S.A. (LUX) and Duhco Nederland B.V. (NL) on layer 1. "3WO OpCo's B.V. (29 entiteiten)" cluster renders with stacked-paper visual and the count in the label. No focal red outline (out of scope).
4. **Synthetic JV.** Create A, B, and C. A → C 50%, B → C 50%. C lands centered between A and B. Both edges visible with their percentages.
5. **Generation skipping.** A owns B 100%, A owns C 50%, B owns C 50%. A→C edge routes via side handle, not through B.
6. **Missing field.** Edit an entity to clear its legal_form. Chart is replaced by a banner listing the entity. "Open in inspector" link works.
7. **Cycle.** Manually create A→B then B→A. Chart blocked with banner listing A and B.
8. **Orphan.** Use the "+ Entity" palette to add a corp without connecting it. Toolbar shows "1 disconnected — show". Click reveals it at the bottom with a red badge.
9. **Fiscal unity overlay.** Insert a row into `atad2_structure_groupings` for the S4 session with members = the 3 NL operating entities. Reload. Dashed outline appears around them with "Dutch CIT fiscal unity" label.
10. **PPTX export.** Click Export PPTX. Open the file. Dashed-outline group is present. Stacked-paper cluster is present. No regressions vs the MVP-3.7 export.
11. **Uniform width + multi-line name.** Long entity names like "De Drie Wijzen uit Oost Holding B.V." wrap to 3 lines inside a 160×100 box. All entity boxes are visually the same width. No truncation in normal cases.
12. **Multi-row siblings.** Create a parent with 10 children. The children wrap onto 2 rows of 5, both centered under the parent, each row hanging from the parent via its own hark.

## 12. Out of scope — explicit notes

- **WMC test case** (spec acceptance §7.4): the .pptx file is not in the repo. The WMC chart image pasted into the brainstorm conversation is treated as the reference. No automated visual regression for WMC.
- **Color modes other than the current jurisdiction palette.** Not changed. The "off" mode mentioned in the original spec is also cut because business_activity is cut — there is only one mode.
- **Voting vs economic interest, multi-class shares, in-canvas edits, time travel.** Out per §3.

## 13. References

- Prior specs: `docs/superpowers/specs/2026-05-08-structure-chart-polish-design.md`, `docs/superpowers/specs/2026-05-08-structure-chart-hark-and-pptx-design.md`
- Memory: `feedback_tax_chart_conventions.md` (strict shape conventions, parchment palette, no pill-badges)
- React Flow overlays: https://reactflow.dev/learn/customization/custom-nodes
- Sugiyama-style hierarchical layout reference: Sugiyama, Tagawa, Toda — *Methods for Visual Understanding of Hierarchical System Structures* (IEEE, 1981). Hybrid implementation here is a simplified variant adapted to the synchronous deterministic constraint.
