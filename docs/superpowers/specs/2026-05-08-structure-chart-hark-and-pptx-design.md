# Structure Chart Hark + PPTX Polish — Design Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorm → spec)
**Builds on:** all earlier MVPs (1, 2, 3, 3.5, 3.6).
**Owner:** Lennart Wilming

## 1. Goal

Tighten the structure-chart deliverable along nine specific axes raised after live testing of MVP-3.6:

- The PPTX export must fit any chart on a 13.33"×7.5" widescreen slide, with no name duplication and no label/node collisions.
- Ownership connectors must form a Big4-style "hark" (rake): one shared trunk down from the parent, a horizontal bus, and short vertical drops to each child — visually identical in both the on-screen chart and the PPTX export.
- Transaction edges leave entities through their LEFT/RIGHT side handles instead of TOP/BOTTOM, so they never collide with the orthogonal ownership tree.
- A toolbar toggle lets the user hide transactions to read the ownership tree alone, and bring them back.
- Expanded clusters can be collapsed back via a single "Collapse" affordance; in collapsed state the parent's ownership line is visible to the cluster placeholder.

## 2. Why this matters

Real testing on the production deploy showed:

- **PPTX is unusable as a deliverable.** Half the bottom-tier entities fall off the right edge of the slide; the taxpayer name reads "S4 Energy B.V. B.V." (legal-form duplication); transaction labels float in the middle of the canvas at unrelated coordinates. Sending this to a client is unthinkable.
- **Diagonals look amateur.** Big4 / IFA tax-memo charts always render parent-to-child relationships with strict orthogonal hark connectors. We currently render straight diagonals (`getStraightPath` on `OwnershipEdge`). When a parent has 2+ children, a single shared trunk is the standard.
- **Transactions visually fight ownership.** Both classes of edge currently exit the same handles (top/bottom). On dense charts they cross and become unreadable. Side handles for transactions resolve this.
- **Clusters are a one-way trip.** Once a user expands a cluster, the chart has no way back. After expanding several, the chart re-clutters with the very entities the user wanted hidden.
- **Cluster placeholder isn't connected.** When a cluster is shown, no line points from its parent down to it; readers can't tell whose subsidiaries got bundled.

These nine items together turn an awkward demo into a deliverable. Single focused spec.

## 3. Scope

### In MVP-3.7 (this spec)
1. **PPTX bounding-box translate + uniform scale** so any chart fits 13.33"×7.5" with 0.3" margins.
2. **PPTX name de-duplication**: only append `legal_form` if not already in `name`.
3. **PPTX edge label offset**: position labels above the line midpoint with a 0.15" Y-offset to avoid overlap.
4. **Hark ownership connectors** in xyflow: replace `getStraightPath` with `getSmoothStepPath` in `OwnershipEdge.tsx`.
5. **Hark connectors in PPTX**: per parent with ≥2 children, render one shared trunk + horizontal bus + vertical drops.
6. **Side handles for transactions**: add `Position.Left` / `Position.Right` handles to `EntityNode.tsx`; transactions use `sourceHandle: 'right'`, `targetHandle: 'left'`. Ownership stays top↔bottom.
7. **Show/Hide transactions toggle** in `FloatingToolbar.tsx`. Default visible.
8. **Cluster recollapse via toolbar**: a small "N expanded · Collapse" button in `FloatingToolbar`, shown only when ≥1 cluster is expanded.
9. **Cluster ownership line**: synthesize `parent_id → clusterId` ownership edges in `StructureChartStep.tsx` so the cluster placeholder is visibly connected to its parent.

### Explicitly out of scope (deferred)
- Per-node "↩" badge to recollapse just one cluster (not needed for MVP).
- Animated trunk highlight when hovering an ownership edge.
- "Auto-arrange" of transactions to minimize edge crossings (geometry-aware routing).
- Custom xyflow edge component for shared bus rendering on screen — `getSmoothStepPath` produces the bus visually via overlap, no custom component needed.

## 4. PPTX export fixes (`exports/exportToPptx.ts`)

### 4.1 Bounding-box + uniform scale + offset

Today the export divides chart pixel positions by `PX_PER_IN = 96` and writes them straight to the slide. Charts whose tierLayout produces negative X (parent siblings spread around X=0) end up off the slide.

Replace the inline coordinate computation in `addEntityShape` and `addEdge` with a precomputed scale + offset:

```ts
const MARGIN_IN = 0.3;
const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;

function computeFit(entities: StructureEntity[]) {
  if (entities.length === 0) return { scale: 1, offsetX: MARGIN_IN, offsetY: MARGIN_IN };
  const xs = entities.map((e) => e.position_x);
  const ys = entities.map((e) => e.position_y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const spanX = (maxX - minX) / PX_PER_IN + BOX_W_IN;
  const spanY = (maxY - minY) / PX_PER_IN + BOX_H_IN;
  const availW = SLIDE_W_IN - 2 * MARGIN_IN;
  const availH = SLIDE_H_IN - 2 * MARGIN_IN;
  const scale = Math.min(1, availW / spanX, availH / spanY);
  const offsetX = MARGIN_IN - (minX / PX_PER_IN) * scale;
  const offsetY = MARGIN_IN - (minY / PX_PER_IN) * scale;
  return { scale, offsetX, offsetY };
}

function projectXY(e: StructureEntity, fit: ReturnType<typeof computeFit>) {
  return {
    x: (e.position_x / PX_PER_IN) * fit.scale + fit.offsetX,
    y: (e.position_y / PX_PER_IN) * fit.scale + fit.offsetY,
    w: BOX_W_IN * fit.scale,
    h: BOX_H_IN * fit.scale,
  };
}
```

`exportToPptx`'s entry function calls `computeFit(entities)` once and passes `fit` plus `projectXY` results into `addEntityShape` / `addEdge`. Both helpers update their geometry math accordingly.

### 4.2 Name de-duplication

Current text construction:

```ts
const text = `${e.name}\n${e.legal_form ?? ''}\n(${e.jurisdiction_iso})`.trim();
```

Replace with:

```ts
function buildEntityLabel(e: StructureEntity): string {
  const lines: string[] = [e.name];
  const lf = (e.legal_form ?? '').trim();
  if (lf && !e.name.toLowerCase().includes(lf.toLowerCase())) {
    lines.push(lf);
  }
  lines.push(`(${e.jurisdiction_iso})`);
  return lines.join('\n');
}
```

`addEntityShape` calls `buildEntityLabel(e)` instead of constructing inline.

### 4.3 Edge label offset

Edge labels currently sit at the line's midpoint, often overlapping a node. Offset them by 0.15" perpendicular to the line (or above for predominantly-horizontal lines):

```ts
function labelPosition(fx: number, fy: number, tx: number, ty: number) {
  const midX = (fx + tx) / 2;
  const midY = (fy + ty) / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular offset, 0.15" away on the "up" side
  const offX = (-dy / len) * 0.15;
  const offY = ( dx / len) * 0.15;
  return { x: midX + offX - 0.5, y: midY + offY - 0.1 };
}
```

(Width 1.0", height 0.2" is enough for `Loan EUR 5M`. Centered text.)

### 4.4 Hark connectors in PPTX

When a parent has ≥2 ownership-children, draw a shared bus instead of N independent diagonals.

Add a function `addOwnershipBus(slide, parent, children, fit)`:

```ts
function addOwnershipBus(
  slide: PptxGenJS.Slide,
  parent: StructureEntity,
  children: StructureEntity[],
  fit: ReturnType<typeof computeFit>,
) {
  if (children.length === 0) return;

  const parentPos = projectXY(parent, fit);
  const childPositions = children.map((c) => projectXY(c, fit));
  const parentBottomX = parentPos.x + parentPos.w / 2;
  const parentBottomY = parentPos.y + parentPos.h;

  // Bus runs at the midpoint between parent.bottom and the children's tops.
  const childTopY = Math.min(...childPositions.map((c) => c.y));
  const busY = (parentBottomY + childTopY) / 2;

  const lineColor = PALETTE.ownershipStroke.replace('#', '');

  // 1. Vertical drop from parent to bus
  slide.addShape('line' as PptxGenJS.ShapeType, {
    x: parentBottomX, y: parentBottomY,
    w: 0.001, h: busY - parentBottomY,
    line: { color: lineColor, width: 1.5 },
  } as never);

  if (children.length > 1) {
    // 2. Horizontal bus across all children
    const minChildX = Math.min(...childPositions.map((c) => c.x + c.w / 2));
    const maxChildX = Math.max(...childPositions.map((c) => c.x + c.w / 2));
    slide.addShape('line' as PptxGenJS.ShapeType, {
      x: minChildX, y: busY,
      w: maxChildX - minChildX, h: 0.001,
      line: { color: lineColor, width: 1.5 },
    } as never);
  }

  // 3. Vertical drops from bus to each child top
  for (let i = 0; i < children.length; i++) {
    const c = childPositions[i];
    const childTopX = c.x + c.w / 2;
    slide.addShape('line' as PptxGenJS.ShapeType, {
      x: childTopX, y: busY,
      w: 0.001, h: c.y - busY,
      line: { color: lineColor, width: 1.5 },
    } as never);

    // ownership-percentage label sits on the child's drop line
    const edge = ownershipEdges.find(
      (e) => e.from_entity_id === parent.id && e.to_entity_id === children[i].id,
    );
    if (edge?.ownership_pct != null) {
      slide.addText(`${edge.ownership_pct}%`, {
        x: childTopX - 0.3, y: (busY + c.y) / 2 - 0.1,
        w: 0.6, h: 0.2,
        fontFace: 'Inter', fontSize: 9, color: '3a3530',
        align: 'center' as const,
      });
    }
  }
}
```

`exportToPptx`'s main loop replaces the per-edge ownership rendering with a per-parent grouping pass:

```ts
const ownershipByParent = new Map<string, StructureEntity[]>();
for (const e of edges.filter((x) => x.kind === 'ownership')) {
  const parent = entities.find((x) => x.id === e.from_entity_id);
  const child  = entities.find((x) => x.id === e.to_entity_id);
  if (!parent || !child) continue;
  const list = ownershipByParent.get(parent.id) ?? [];
  list.push(child);
  ownershipByParent.set(parent.id, list);
}
for (const [parentId, kids] of ownershipByParent) {
  const parent = entities.find((e) => e.id === parentId)!;
  addOwnershipBus(slide, parent, kids, fit);
}
```

Transaction edges keep their per-edge `addEdge` rendering (curved arrows, side-to-side). Their label uses the offset helper from §4.3.

## 5. Hark on screen (`OwnershipEdge.tsx`)

Replace `getStraightPath` with `getSmoothStepPath`:

```ts
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from '@xyflow/react';

const [path, labelX, labelY] = getSmoothStepPath({
  sourceX, sourceY, targetX, targetY,
  borderRadius: 4,
});
```

When tierLayout puts all children of one parent at the same Y (which it always does — strict tier layout), the smooth-step segments overlap into a single visible bus.

The label position calculation stays the same (xyflow gives `labelX`/`labelY` from the helper).

## 6. Side handles for transactions

### 6.1 Handles on `EntityNode.tsx`

Add Left and Right handles alongside the existing Top (target) and Bottom (source):

```tsx
<Handle type="target" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
<Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
<Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
<Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0 }} />
```

`id` is required when a node has multiple handles per side semantics. xyflow uses `id` to bind edges.

### 6.2 Edge handle binding in `StructureChart.tsx`

In the `initialEdges` useMemo, the transaction branch gets:

```ts
sourceHandle: 'right',
targetHandle: 'left',
```

Ownership edges keep no explicit handle (xyflow defaults to top/bottom which is what they need).

The `curvature: 0.6` setting in `TransactionEdge.tsx` stays — xyflow's bezier path between right and left handles arcs naturally.

## 7. Toggle Show/Hide transactions

### 7.1 State in `StructureChartStep.tsx`

```ts
const [showTransactions, setShowTransactions] = useState(true);

const renderableEdges = useMemo(
  () => (showTransactions ? edgesWithCluster : edgesWithCluster.filter((e) => e.kind === 'ownership')),
  [edgesWithCluster, showTransactions],
);
```

(`edgesWithCluster` is the merged `[...visibleEdges, ...clusterEdges]` array introduced in §8.)

`<StructureChart edges={renderableEdges} ... />` consumes the filtered set.

Toolbar counts (`ownershipCount` / `transactionCount`) keep showing the **real** counts — the toggle hides edges visually, doesn't change the data.

### 7.2 Toolbar UI in `FloatingToolbar.tsx`

Add two new props:

```ts
interface Props {
  // ... existing
  transactionsVisible: boolean;
  onToggleTransactions: () => void;
}
```

Render the button between Auto-layout and Re-extract:

```tsx
<Button
  size="sm"
  variant={transactionsVisible ? 'default' : 'outline'}
  onClick={onToggleTransactions}
  disabled={busy || isExtracting}
>
  {transactionsVisible ? 'Hide transactions' : 'Show transactions'}
</Button>
```

The `default` variant gives a subtle filled state when transactions are visible — matches `state-clarity` UX rule.

## 8. Cluster recollapse + parent ownership line

### 8.1 Synthesize parent → cluster ownership edges

In `StructureChartStep.tsx`, after computing `clusterLayout` (which contains positions) and `activeClusters` (the actual cluster definitions with `parent_id`):

```ts
const clusterEdges = useMemo<StructureEdge[]>(() => {
  if (!chart) return [];
  const out: StructureEdge[] = [];
  for (const c of activeClustersRef.current) {
    const idStr = clusterId(c);
    out.push({
      id: `cluster-edge-${idStr}`,
      chart_id: chart.id,
      from_entity_id: c.parent_id,
      to_entity_id: idStr,
      kind: 'ownership',
      ownership_pct: null,
      ownership_voting_only: null,
      transaction_type: null,
      amount_eur: null,
      is_mismatch: false,
      mismatch_classification: null,
      mismatch_atad2_article: null,
      label: null,
      source: 'ai_extracted',
      created_at: '',
      updated_at: '',
    });
  }
  return out;
}, [chart, clusterLayout]);

const edgesWithCluster = useMemo(() => [...visibleEdges, ...clusterEdges], [visibleEdges, clusterEdges]);
```

`activeClustersRef` is a ref updated inside `handleAutoLayout` so the synth-edges stay in sync with the layout pass that produced the cluster placeholders.

`edgesWithCluster` replaces `visibleEdges` everywhere it was passed to `<StructureChart>` and to the showTransactions filter.

The OwnershipEdge component renders these edges normally; they have no `ownership_pct` label so the bus stays clean.

### 8.2 Recollapse banner in `FloatingToolbar.tsx`

Add another prop:

```ts
expandedClusterCount: number;
onCollapseAll: () => void;
```

Render when count > 0, just left of the action buttons:

```tsx
{expandedClusterCount > 0 && (
  <button
    type="button"
    onClick={onCollapseAll}
    className="text-xs text-neutral-500 hover:text-neutral-900 px-2 py-1 rounded hover:bg-neutral-100 whitespace-nowrap"
  >
    {expandedClusterCount} expanded · Collapse
  </button>
)}
```

In `StructureChartStep.tsx`:

```ts
const handleCollapseAll = useCallback(() => {
  setExpandedClusters(new Set());
}, []);

// pass to toolbar:
<FloatingToolbar
  // ... existing
  expandedClusterCount={expandedClusters.size}
  onCollapseAll={handleCollapseAll}
  transactionsVisible={showTransactions}
  onToggleTransactions={() => setShowTransactions((v) => !v)}
/>
```

The existing `useEffect` that re-runs layout when `expandedClusters` changes already handles the recollapse — when set is cleared, layout re-runs with all clusters folded again.

## 9. Files

### Modified
```
src/components/structure/exports/exportToPptx.ts                // §4: fit + dedup + label offset + hark bus
src/components/structure/edges/OwnershipEdge.tsx                // §5: getSmoothStepPath
src/components/structure/nodes/EntityNode.tsx                   // §6.1: 4 handles
src/components/structure/StructureChart.tsx                     // §6.2: handle binding for transactions
src/components/structure/StructureChartStep.tsx                 // §7+§8: showTransactions, clusterEdges, collapseAll
src/components/structure/FloatingToolbar.tsx                    // §7+§8: toggle button + collapse banner
```

### New / Deleted
None.

## 10. Tests

UI changes; no unit tests added. Existing 46 stay green.

The `buildEntityLabel`, `computeFit`, `labelPosition`, and `addOwnershipBus` helpers in `exportToPptx.ts` are pure-ish (no React); could be extracted and unit-tested in a follow-up if the export becomes finicky. Not in this spec.

## 11. Manual smoke test

1. **PPTX fits slide**: open a 50-entity chart, click Export PPTX. Open the file. All entities visible inside the slide bounds. No content cut off at the right edge.
2. **No name dup**: taxpayer name reads "S4 Energy B.V." not "S4 Energy B.V. B.V.".
3. **Edge labels readable**: transaction labels sit above their lines; no overlap with entity boxes.
4. **Hark on screen**: parent with 5 children renders as one shared trunk → horizontal bus → 5 short drops to children. No diagonals.
5. **Hark in PPTX**: same shape on the exported slide.
6. **Side handles**: a transaction between two entities exits the source's right edge, enters the target's left edge. Ownership lines stay top-bottom.
7. **Toggle hides transactions**: click "Hide transactions" — all transaction edges + labels disappear; ownership tree remains. Click "Show transactions" — they reappear.
8. **Recollapse banner**: expand a cluster — banner "1 expanded · Collapse" appears in the toolbar. Click it — cluster folds back, banner disappears.
9. **Cluster has parent line**: in collapsed state, a line visibly connects the cluster placeholder to its parent.

## 12. References

- xyflow path helpers: https://reactflow.dev/api-reference/utils/get-smooth-step-path
- xyflow handles per node: https://reactflow.dev/learn/customization/custom-nodes#multiple-handles
- pptxgenjs shape API: https://gitbrent.github.io/PptxGenJS/docs/api-shapes-and-lines/
- UI/UX rules applied: `state-clarity`, `progressive-disclosure`, `motion-meaning`, `visual-hierarchy`
