# Structure Chart Polish — Design Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorm → spec)
**Builds on:**
- `docs/superpowers/specs/2026-05-08-structure-chart-loading-and-framing-design.md` (just-shipped MVP-3.5)
- All earlier MVPs in this series
**Owner:** Lennart Wilming

## 1. Goal

Tighten the structure-chart's visual polish and fix three live bugs that block normal usage. After this spec ships:

- The taxpayer is always visually distinct as the chart's centre (subtle black outline, even when not selected).
- Transaction edges are always curved enough to visibly arc over ownership lines, never overlapping the orthogonal tree.
- Transaction labels are short and read from the taxpayer's perspective (`Receivable` / `Payable` instead of full prose), with the amount on a second line.
- Adding a new entity via the "+ Entity" pop-out actually renders it on the canvas.
- Exporting to PPTX produces a real `.pptx` file in production builds.
- The "React Flow" attribution badge in the canvas's bottom-right is hidden.

## 2. Why this matters

Live testing on the production deploy revealed:

- **Bug — `+ Entity` button silently does nothing.** Clicking opens the popout, picking a type inserts a row in the DB, but the new entity never appears on the canvas. Cause: the orphan filter (introduced earlier) hides any entity without an ownership-edge path to the taxpayer. A freshly-added entity has no edges yet, so it's filtered out before it ever renders.
- **Bug — PPTX export is broken in production.** The dynamic-import-with-`@vite-ignore` hack we used to defer the load works in dev but Rollup can't resolve the path at build time, so clicking Export PPTX fails silently in production.
- **Visual noise.** The "React Flow" badge in the bottom-right corner is OSS attribution from the library — fine for an open prototype, wrong for a Big4-grade tax deliverable. Transaction edges sometimes draw straight through ownership lines, making the chart hard to read. Long verbose transaction labels ("Receivable from shareholder Hibernian Amsterdam Holdings N.V.") clutter the canvas instead of communicating the tax-relevant fact ("Receivable, EUR 5M, D/NI mismatch").
- **Taxpayer indistinct.** The chart's anchor entity (the taxpayer) only gains a blue outline when explicitly clicked. A reader scanning the chart should see the taxpayer immediately as the focal point.

These are all readability + correctness fixes, not architecture. Single focused spec.

## 3. Scope

### In MVP-3.6 (this spec)
- Hide the React Flow attribution via `proOptions={{ hideAttribution: true }}`.
- Make `+ Entity` work: exclude `source = 'user_added'` entities from the orphan filter so newly-added nodes appear immediately.
- Fix PPTX export: replace the dynamic import with a static import in `StructureChartStep.tsx`.
- Taxpayer always shows a 1.5 px black outline (around the entity-node SVG outer shape).
- Transaction edges always render with `curvature: 0.6` (was 0.4) so they arc visibly above ownership lines.
- Transaction edges render with higher `zIndex` than ownership edges, ensuring the curve draws on top.
- Transaction labels: when one endpoint is the taxpayer, show `Receivable` (taxpayer is the `to_entity_id`, money flows in) or `Payable` (taxpayer is the `from_entity_id`, money flows out). Otherwise show the human-readable type (`Loan`, `Royalty`, `Dividend`, etc.). The `label` free-text field from the DB is ignored for visual rendering and remains editable in the inspector only.
- Transaction labels include amount on a second line (`EUR 5M`) when `amount_eur` is non-null. Mismatch info (`D/NI · art 12aa`) on a third line when present.

### Explicitly out of scope (deferred)
- Pre-extract trigger changes — current `finishAssessment`-fire-and-forget stays.
- Big4 strict-tier visual upgrades (parked plan).
- Aggressive subtree clustering (parked plan).
- Per-tier collapse, jurisdiction swimlanes, undo/redo (parked).

## 4. Bug fixes

### 4.1 React Flow attribution

In `src/components/structure/StructureChart.tsx`, on the `<ReactFlow>` element add:

```tsx
proOptions={{ hideAttribution: true }}
```

Per `@xyflow/react`'s docs, this is the documented way to suppress the attribution badge for non-Pro users. Single prop addition.

### 4.2 `+ Entity` silently disappears

Root cause: the `visibleEntities` `useMemo` in `StructureChartStep.tsx` uses a BFS-from-anchor over ownership edges to compute connected entities; any entity without an edge is filtered out. New `user_added` entities have no edges yet, so they vanish from the rendered chart.

Fix: extend the filter to ALWAYS include `source = 'user_added'` (and `'user_edited'`) regardless of connectivity. Only `ai_extracted` orphans are hidden — those are extraction noise the user didn't choose to keep.

```ts
return entities.filter(
  (e) => connected.has(e.id) || e.source === 'user_added' || e.source === 'user_edited',
);
```

The user can then drag-connect the new entity to existing ones via React Flow's connection handles, and ownership edges they create persist as `source = 'user_added'`.

A user-added entity that's still disconnected after the user finishes adding it: still rendered (visible). It will look like a floating island until the user wires it up. Acceptable for MVP-3.6; if it becomes annoying we add a "Disconnected" cluster in v2.

### 4.3 PPTX export broken in production

Current code in `StructureChartStep.tsx`:

```ts
onExportPptx={() => {
  const modulePath = /* @vite-ignore */ './exports/exportToPptx';
  import(/* @vite-ignore */ modulePath).then(...).catch(...)
}}
```

The `@vite-ignore` hint tells Vite (dev) to leave the import alone, but Rollup (prod build) can't statically follow it and the module never gets bundled. Clicking the button fails silently.

Fix: static import at the top of the file:

```ts
import { exportToPptx } from './exports/exportToPptx';
```

Then the handler becomes:

```ts
onExportPptx={() => exportToPptx({
  entities: visibleEntities,
  edges: visibleEdges,
  taxpayerName: '',  // could be passed from chart.session_id → taxpayer_name lookup; placeholder ok
})}
```

Bundle size impact: `pptxgenjs` is ~300 kB minified. It now ships in the main `AssessmentStructure-*.js` chunk instead of being lazy-loaded. Acceptable since the chart page already pulls in xyflow + html-to-image and is not on the critical path. If we want to keep lazy-loading later, fix it via a proper Vite-friendly dynamic import (no `@vite-ignore`) — out of scope for this spec.

## 5. Visual upgrades

### 5.1 Taxpayer outline

In `src/components/structure/nodes/EntityNode.tsx`, the existing SVG `<rect>` (and the polygon/ellipse alternatives in the same component) currently has a thin `0.75 px` `outerStroke`. The selected-state outline is rendered via the wrapper `<svg>`'s CSS `outline`.

Change: when `data.is_taxpayer === true`, make the outer-shape stroke `1.5 px` solid `#1a1a1a`. When the taxpayer is also `selected`, the existing 2 px blue selection outline remains (drawn outside the shape via CSS). The two are independently visible — no flicker.

Concretely, where each outer shape sets `stroke={PALETTE.outerStroke}`:

```tsx
stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
```

Also: keep the existing selected-state `outline: 2px solid #1f5489` on the wrapper SVG. Don't remove it.

### 5.2 Transaction edges always curved + on top

In `src/components/structure/edges/TransactionEdge.tsx`:

```tsx
const [path, labelX, labelY] = getBezierPath({
  sourceX, sourceY, targetX, targetY, curvature: 0.6,
});
```

(Was `0.4`.) `0.6` produces a visible arc even on near-vertical parent→child shapes.

In `src/components/structure/StructureChart.tsx`, where the `initialEdges` useMemo maps each `StructureEdge` into an xyflow edge object, add `zIndex: 10` to the transaction branch (ownership edges keep the default `zIndex: 0`):

```ts
e.kind === 'transaction'
  ? { ..., zIndex: 10 }
  : { ... }
```

This makes transactions render on top of ownership lines so the curved arc reads as overlapping in front, not behind.

### 5.3 Transaction labels — short, taxpayer-perspective, with amount

`TransactionEdge.tsx` currently has a `TYPE_VERB` map and renders `${verb} EUR ${amount}` plus optional mismatch subline.

Rewrite the label logic so the FIRST line communicates the relationship from the taxpayer's perspective when the taxpayer is involved:

```tsx
interface TransactionEdgeData {
  // existing fields...
  is_taxpayer_from?: boolean;  // injected by parent: source === taxpayer
  is_taxpayer_to?: boolean;    // injected by parent: target === taxpayer
}

function topLine(data: TransactionEdgeData): string {
  if (data.is_taxpayer_from) return 'Payable';   // taxpayer pays out
  if (data.is_taxpayer_to)   return 'Receivable'; // taxpayer receives
  return TYPE_VERB[data.transaction_type];       // other → fallback to type
}
```

The two new flags are computed in `StructureChart.tsx`'s `initialEdges` mapping — it already has the entity list, can find the taxpayer by `is_taxpayer === true`, and tag each transaction edge accordingly.

Layout per edge label:

```
┌─────────────────────┐
│ Receivable          │  ← line 1, bold, 700 weight, color = stroke
│ EUR 5M              │  ← line 2, 600 weight, smaller, color = stroke
│ D/NI · art 12aa     │  ← line 3, 600 weight, 10px, color = stroke (only on mismatch)
└─────────────────────┘
```

Lines 2 and 3 are conditionally rendered. Existing `formatAmount()` stays.

The DB's free-text `label` field is **not** rendered visually anymore. It remains editable in `EdgeInspector` for note-keeping, but the chart shows the structured short label.

## 6. Files

### Modified
```
src/components/structure/StructureChart.tsx               // hideAttribution, zIndex on transaction edges, taxpayer flags injection
src/components/structure/edges/TransactionEdge.tsx        // curvature 0.6, taxpayer-perspective topLine, amount + mismatch sublines
src/components/structure/nodes/EntityNode.tsx             // 1.5px black outline when is_taxpayer
src/components/structure/StructureChartStep.tsx           // visibleEntities filter excludes user_added/edited orphans; static PPTX import
```

### New / Deleted
None.

## 7. Tests

All four files are component-level UI; no new unit tests. Existing 46 tests stay green.

The `topLine` helper inside `TransactionEdge.tsx` has 3 branches; could be extracted and unit-tested if it grows. Left inline for now — it's 3 lines.

## 8. Manual smoke test

1. **Attribution gone**: open chart, no "React Flow" badge bottom-right.
2. **+ Entity works**: click `+ Entity ▾` → pick "Corporation" → new entity appears at (200, 200) with name "New entity". Doesn't disappear.
3. **PPTX export works**: click Export PPTX → browser downloads `<TaxpayerName> - Structure Chart.pptx`. Opens in PowerPoint with shapes.
4. **Taxpayer always outlined**: load any chart, taxpayer entity has a 1.5 px black border even when nothing is selected. Click another node → taxpayer outline stays; the clicked node gets the blue 2 px selection outline.
5. **Transaction curves visible**: load a chart with transactions between parent and direct child. The transaction arc visibly bows away from the ownership line; the two don't overlap.
6. **Short labels**: a transaction where taxpayer is receiver → label reads `Receivable` (not "Receivable from shareholder ...") + `EUR 5M`. Where taxpayer is payer → `Payable`. Where neither endpoint is taxpayer → fallback to type (`Loan`, `Royalty`, etc.).
7. **Mismatch line**: a D/NI transaction shows the third subline with `D/NI · art 12aa`.

## 9. References

- Spec MVP-3.5: `docs/superpowers/specs/2026-05-08-structure-chart-loading-and-framing-design.md`
- Visual conventions memory: `~/.claude/projects/.../memory/feedback_tax_chart_conventions.md`
- React Flow `proOptions`: https://reactflow.dev/api-reference/react-flow#prooptions
