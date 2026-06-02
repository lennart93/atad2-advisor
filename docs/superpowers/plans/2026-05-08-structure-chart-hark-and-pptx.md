# Structure Chart Hark + PPTX Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the structure-chart deliverable (PPTX) actually fit a slide and look like a Big4 chart, plus tighten the interactive canvas with hark connectors, side-handle transactions, a Show/Hide-transactions toggle, and a cluster recollapse path.

**Architecture:** Six existing files modified. No new components, no new dependencies. PPTX export gets a uniform-scale fit + per-parent shared-bus connector. xyflow's `OwnershipEdge` switches from straight to smooth-step routing. EntityNode gains side handles; transactions bind to right→left. FloatingToolbar gains a transactions-toggle and a per-session expanded-clusters collapse banner. StructureChartStep synthesizes parent→cluster ownership edges so cluster placeholders are visibly connected.

**Tech Stack:** Existing React + Vite + TS + Tailwind + `@xyflow/react` 12.10.2 + `pptxgenjs`. No new deps.

**Spec:** [docs/superpowers/specs/2026-05-08-structure-chart-hark-and-pptx-design.md](../specs/2026-05-08-structure-chart-hark-and-pptx-design.md). Read first.

**Project rules (CRITICAL):**
- **NEVER `git commit` or `git push`.** Commit steps below are preparation only — only run when the user explicitly asks.
- **`main` is live production.**
- **All UI strings must be English.**

---

## File Structure

### Modified
```
src/components/structure/exports/exportToPptx.ts                // computeFit + dedup label + label offset + addOwnershipBus
src/components/structure/edges/OwnershipEdge.tsx                // getStraightPath → getSmoothStepPath
src/components/structure/nodes/EntityNode.tsx                   // 4 handles (Top/Bottom/Left/Right)
src/components/structure/StructureChart.tsx                     // sourceHandle/targetHandle on transaction edges
src/components/structure/StructureChartStep.tsx                 // showTransactions, clusterEdges synth, handleCollapseAll
src/components/structure/FloatingToolbar.tsx                    // transactions toggle + collapse banner
```

### New / Deleted
None.

---

## Task index

| # | Task | Files |
|---|---|---|
| 1 | PPTX export overhaul | `exportToPptx.ts` |
| 2 | On-screen hark + side handles | `OwnershipEdge.tsx`, `EntityNode.tsx`, `StructureChart.tsx` |
| 3 | Toolbar features + cluster ownership lines | `FloatingToolbar.tsx`, `StructureChartStep.tsx` |
| 4 | Local verification + manual smoke | none |

---

## Task 1: PPTX export overhaul

`exports/exportToPptx.ts` gets four changes: a `computeFit` helper that scales any chart to the slide, a `buildEntityLabel` helper that de-duplicates legal-form, a `labelPosition` helper that offsets edge labels off the line, and a new `addOwnershipBus` helper that draws hark connectors per parent.

**Files:**
- Modify: `src/components/structure/exports/exportToPptx.ts`

- [ ] **Step 1: Read the file** to confirm its current shape.

```bash
cat "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor/src/components/structure/exports/exportToPptx.ts"
```

The file currently exports `exportToPptx({ entities, edges, taxpayerName })`, with helpers `addEntityShape`, `addEdge`, `formatAmount`, and a `PALETTE` import. Constants `PX_PER_IN = 96`, `BOX_W_IN = 1.4`, `BOX_H_IN = 0.85` are at the top.

- [ ] **Step 2: Add the four new helpers**

Insert these helpers above the `exportToPptx` function (right after the existing constants):

```ts
const MARGIN_IN = 0.3;
const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;

interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function computeFit(entities: StructureEntity[]): Fit {
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

interface EntityRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function projectXY(e: StructureEntity, fit: Fit): EntityRect {
  return {
    x: (e.position_x / PX_PER_IN) * fit.scale + fit.offsetX,
    y: (e.position_y / PX_PER_IN) * fit.scale + fit.offsetY,
    w: BOX_W_IN * fit.scale,
    h: BOX_H_IN * fit.scale,
  };
}

function buildEntityLabel(e: StructureEntity): string {
  const lines: string[] = [e.name];
  const lf = (e.legal_form ?? '').trim();
  if (lf && !e.name.toLowerCase().includes(lf.toLowerCase())) {
    lines.push(lf);
  }
  lines.push(`(${e.jurisdiction_iso})`);
  return lines.join('\n');
}

function labelPosition(fx: number, fy: number, tx: number, ty: number) {
  const midX = (fx + tx) / 2;
  const midY = (fy + ty) / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular offset, 0.15" away on the "up" side
  const offX = (-dy / len) * 0.15;
  const offY = (dx / len) * 0.15;
  return { x: midX + offX - 0.5, y: midY + offY - 0.1 };
}
```

- [ ] **Step 3: Update `addEntityShape` to use `Fit` + `buildEntityLabel`**

Change the function signature from:

```ts
function addEntityShape(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  e: StructureEntity,
  x: number,
  y: number,
)
```

to:

```ts
function addEntityShape(
  slide: PptxGenJS.Slide,
  pres: PptxGenJS,
  e: StructureEntity,
  fit: Fit,
)
```

Inside the function, derive `x`, `y`, `w`, `h` from `projectXY`:

```ts
const { x, y, w, h } = projectXY(e, fit);
const text = buildEntityLabel(e);
```

Then update every shape inside the function so its `x`, `y`, `w`, `h` use these (instead of hardcoded `BOX_W_IN`, `BOX_H_IN`):
- `slide.addShape(pres.ShapeType.rect, { x, y, w, h, ... })` (replace any `w: BOX_W_IN` with `w`, similarly `h`)
- The text-call: `slide.addText(text, { x, y, w, h, ... })`
- For composite shapes (D/H entity, reverse hybrid, hybrid partnership, individual), replace the inner-shape coords:
  - D/H ellipse: `{ x: x + 0.05 * fit.scale, y: y + 0.07 * fit.scale, w: w - 0.1 * fit.scale, h: h - 0.14 * fit.scale, ... }`
  - Reverse hybrid triangle: `{ x: x + 0.1 * fit.scale, y: y + 0.1 * fit.scale, w: w - 0.2 * fit.scale, h: h - 0.2 * fit.scale, ... flipV: true }`
  - Hybrid partnership triangle: same offsets as reverse hybrid but `flipV: false`
  - Individual head circle: `{ x: x + w / 2 - 0.12 * fit.scale, y, w: 0.24 * fit.scale, h: 0.24 * fit.scale, ... }`
  - Individual trapezoid body: `{ x: x + 0.2 * fit.scale, y: y + 0.25 * fit.scale, w: w - 0.4 * fit.scale, h: h - 0.25 * fit.scale, ... }`
  - Individual label-below-shape `addText`: `{ x, y: y + h + 0.05 * fit.scale, w, h: 0.4 * fit.scale, ... align: 'center' as const, fontSize: 9 * fit.scale * 0.9 }` — keep readable; floor of font size 7

Use `Math.max(7, 9 * fit.scale)` for `fontSize` so labels stay readable when scale shrinks.

- [ ] **Step 4: Replace per-edge ownership rendering with `addOwnershipBus`**

Add this new helper alongside the others (after `addEdge`):

```ts
function addOwnershipBus(
  slide: PptxGenJS.Slide,
  parent: StructureEntity,
  childEntities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  fit: Fit,
) {
  if (childEntities.length === 0) return;

  const parentPos = projectXY(parent, fit);
  const childPositions = childEntities.map((c) => projectXY(c, fit));
  const parentBottomX = parentPos.x + parentPos.w / 2;
  const parentBottomY = parentPos.y + parentPos.h;

  const childTopY = Math.min(...childPositions.map((c) => c.y));
  const busY = (parentBottomY + childTopY) / 2;

  const lineColor = PALETTE.ownershipStroke.replace('#', '');

  // 1. Vertical drop from parent to bus
  slide.addShape('line' as PptxGenJS.ShapeType, {
    x: parentBottomX,
    y: parentBottomY,
    w: 0.001,
    h: busY - parentBottomY,
    line: { color: lineColor, width: 1.5 },
  } as never);

  if (childEntities.length > 1) {
    const minChildX = Math.min(...childPositions.map((c) => c.x + c.w / 2));
    const maxChildX = Math.max(...childPositions.map((c) => c.x + c.w / 2));
    slide.addShape('line' as PptxGenJS.ShapeType, {
      x: minChildX,
      y: busY,
      w: maxChildX - minChildX,
      h: 0.001,
      line: { color: lineColor, width: 1.5 },
    } as never);
  }

  for (let i = 0; i < childEntities.length; i++) {
    const c = childPositions[i];
    const child = childEntities[i];
    const childTopX = c.x + c.w / 2;

    slide.addShape('line' as PptxGenJS.ShapeType, {
      x: childTopX,
      y: busY,
      w: 0.001,
      h: c.y - busY,
      line: { color: lineColor, width: 1.5 },
    } as never);

    const edge = ownershipEdges.find(
      (e) => e.from_entity_id === parent.id && e.to_entity_id === child.id,
    );
    if (edge?.ownership_pct != null) {
      slide.addText(`${edge.ownership_pct}%`, {
        x: childTopX - 0.3,
        y: (busY + c.y) / 2 - 0.1,
        w: 0.6,
        h: 0.2,
        fontFace: 'Inter',
        fontSize: Math.max(7, 9 * fit.scale),
        color: '3a3530',
        align: 'center' as const,
      });
    }
  }
}
```

- [ ] **Step 5: Update `addEdge` to use `Fit` + `labelPosition`** (transactions only — ownership now goes through `addOwnershipBus`)

Change `addEdge`'s signature:

```ts
function addEdge(
  slide: PptxGenJS.Slide,
  e: StructureEdge,
  from: StructureEntity,
  to: StructureEntity,
  fit: Fit,
)
```

(Add the `fit` parameter.) Replace coordinate math at the top of the function:

```ts
const fp = projectXY(from, fit);
const tp = projectXY(to, fit);
const fx = fp.x + fp.w / 2;
const fy = fp.y + fp.h;
const tx = tp.x + tp.w / 2;
const ty = tp.y;
```

For the label-text calls, replace the inline midpoint math with:

```ts
const lp = labelPosition(fx, fy, tx, ty);
slide.addText(/* label content */, {
  x: lp.x,
  y: lp.y,
  w: 1.0,
  h: 0.2,
  fontFace: 'Inter',
  fontSize: Math.max(7, 9 * fit.scale),
  /* color etc. */
});
```

Apply this to BOTH the ownership-pct branch (already replaced by bus, so this branch can be DELETED from `addEdge`) AND the transaction branch.

After cleanup, `addEdge` only handles transaction edges (the ownership branch is removed). Rename the function to `addTransactionEdge` for clarity.

- [ ] **Step 6: Update `exportToPptx` main loop**

Find the existing render-pass:

```ts
for (const e of entities) {
  const x = e.position_x / PX_PER_IN;
  const y = e.position_y / PX_PER_IN;
  addEntityShape(slide, pres, e, x, y);
}

for (const ed of edges) {
  const from = entities.find(x => x.id === ed.from_entity_id);
  const to   = entities.find(x => x.id === ed.to_entity_id);
  if (!from || !to) continue;
  addEdge(slide, ed, from, to);
}
```

Replace with:

```ts
const fit = computeFit(entities);
const ownershipEdges = edges.filter((e) => e.kind === 'ownership');
const transactionEdges = edges.filter((e) => e.kind === 'transaction');

// Entities
for (const e of entities) {
  addEntityShape(slide, pres, e, fit);
}

// Ownership: shared bus per parent
const ownershipByParent = new Map<string, StructureEntity[]>();
for (const e of ownershipEdges) {
  const child = entities.find((x) => x.id === e.to_entity_id);
  if (!child) continue;
  const list = ownershipByParent.get(e.from_entity_id) ?? [];
  list.push(child);
  ownershipByParent.set(e.from_entity_id, list);
}
for (const [parentId, kids] of ownershipByParent) {
  const parent = entities.find((x) => x.id === parentId);
  if (!parent) continue;
  addOwnershipBus(slide, parent, kids, ownershipEdges, fit);
}

// Transactions: one curved line per edge
for (const ed of transactionEdges) {
  const from = entities.find((x) => x.id === ed.from_entity_id);
  const to = entities.find((x) => x.id === ed.to_entity_id);
  if (!from || !to) continue;
  addTransactionEdge(slide, ed, from, to, fit);
}
```

- [ ] **Step 7: Verify**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 46 tests pass, build succeeds.

- [ ] **Step 8: Commit (when user asks)**

```bash
git add src/components/structure/exports/exportToPptx.ts
git commit -m "feat(pptx): fit-to-slide + name dedup + label offset + hark bus connectors"
```

---

## Task 2: On-screen hark + side handles

Three small changes across three files.

**Files:**
- Modify: `src/components/structure/edges/OwnershipEdge.tsx`
- Modify: `src/components/structure/nodes/EntityNode.tsx`
- Modify: `src/components/structure/StructureChart.tsx`

### Step A: `getSmoothStepPath` for ownership

In `src/components/structure/edges/OwnershipEdge.tsx`, replace the current `getStraightPath` import + call. The relevant line near the top is:

```ts
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getStraightPath } from '@xyflow/react';
```

Change to:

```ts
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from '@xyflow/react';
```

And inside the component, replace:

```ts
const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
```

with:

```ts
const [path, labelX, labelY] = getSmoothStepPath({
  sourceX, sourceY, targetX, targetY,
  borderRadius: 4,
});
```

Everything else in the file stays.

### Step B: Four handles on `EntityNode.tsx`

In `src/components/structure/nodes/EntityNode.tsx`, find the existing `<Handle ...>` declarations near the top of the JSX. They look like:

```tsx
<Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
<Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
```

Replace with FOUR handles, each with a unique `id`:

```tsx
<Handle type="target" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
<Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
<Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
<Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0 }} />
```

The `id` is required when a node has multiple handles per side semantics (xyflow uses it to bind edges).

### Step C: Bind transaction edges to right→left handles

In `src/components/structure/StructureChart.tsx`, find the `initialEdges` useMemo. The transaction-branch object literal currently is:

```ts
: ({
    id: e.id,
    source: e.from_entity_id,
    target: e.to_entity_id,
    type: 'transaction',
    zIndex: 10,
    markerEnd: { ... },
    data: { ... },
  } as TransactionEdgeType),
```

Add two new fields between `target` and `type`:

```ts
sourceHandle: 'right',
targetHandle: 'left',
```

So the transaction branch becomes:

```ts
: ({
    id: e.id,
    source: e.from_entity_id,
    target: e.to_entity_id,
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'transaction',
    zIndex: 10,
    markerEnd: { ... },
    data: { ... },
  } as TransactionEdgeType),
```

(Ownership branch stays as-is — no `sourceHandle`/`targetHandle`, xyflow defaults to top↔bottom which is correct for ownership.)

### Steps

- [ ] **Step 1: Apply Step A** — `OwnershipEdge.tsx` switches to `getSmoothStepPath`.
- [ ] **Step 2: Apply Step B** — four handles on `EntityNode.tsx`.
- [ ] **Step 3: Apply Step C** — `sourceHandle: 'right'`, `targetHandle: 'left'` on transaction branch in `StructureChart.tsx`.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 46 tests pass, build succeeds.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/components/structure/edges/OwnershipEdge.tsx src/components/structure/nodes/EntityNode.tsx src/components/structure/StructureChart.tsx
git commit -m "feat(structure): hark ownership connectors + side handles for transactions"
```

---

## Task 3: Toolbar features + cluster ownership lines

Two new toolbar features (Hide/Show transactions, expanded-clusters collapse banner) and synthesized parent→cluster ownership edges so cluster placeholders look connected.

**Files:**
- Modify: `src/components/structure/FloatingToolbar.tsx`
- Modify: `src/components/structure/StructureChartStep.tsx`

### Step A: Extend `FloatingToolbar` props + render new controls

In `src/components/structure/FloatingToolbar.tsx`, find the existing `Props` interface and the `FloatingToolbar` function. Add four new props:

```ts
interface Props {
  status: string;
  entityCount: number;
  ownershipCount: number;
  transactionCount: number;
  onAutoLayout: () => void;
  onReExtract: () => void;
  onExportPptx: () => void;
  busy?: boolean;
  // NEW
  transactionsVisible: boolean;
  onToggleTransactions: () => void;
  expandedClusterCount: number;
  onCollapseAll: () => void;
}
```

Destructure the new props in the function signature:

```ts
export function FloatingToolbar({
  status,
  entityCount,
  ownershipCount,
  transactionCount,
  onAutoLayout,
  onReExtract,
  onExportPptx,
  busy,
  transactionsVisible,
  onToggleTransactions,
  expandedClusterCount,
  onCollapseAll,
}: Props) {
```

In the JSX, find the existing actions row (the section with Auto-layout / Re-extract / Export PPTX). Insert two new elements:

1. **Just BEFORE the Auto-layout button**, add the recollapse banner (only when count > 0):

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

2. **Between Auto-layout and Re-extract**, add the transactions toggle:

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

(`isExtracting` is the existing local variable computed earlier in the component.)

### Step B: State + synth-edges + handlers in `StructureChartStep.tsx`

In `src/components/structure/StructureChartStep.tsx`, do the following:

**B.1. Add a `useRef` for active clusters**

Near the other refs/state, add:

```ts
const activeClustersRef = useRef<Cluster[]>([]);
```

(Import `useRef` from `react` if it isn't already in the import line.)

**B.2. Update `useRef` to track the last layout's clusters**

Inside `handleAutoLayout`, just AFTER the line `const activeClusters = allClusters.clusters.filter(...)`, add:

```ts
activeClustersRef.current = activeClusters;
```

So the ref is updated on every layout pass. This lets the `clusterEdges` `useMemo` (defined below) read the most-recent active clusters.

**B.3. Add `showTransactions` state**

Near the other `useState` calls:

```ts
const [showTransactions, setShowTransactions] = useState(true);
```

**B.4. Add `clusterEdges` and `edgesWithCluster` `useMemo`s**

Just after the existing `visibleEdges` `useMemo`:

```ts
// Synthesize parent → cluster_placeholder ownership edges so the cluster
// placeholder is visibly connected to its parent in the chart.
const clusterEdges = useMemo<StructureEdge[]>(() => {
  if (!chart) return [];
  const out: StructureEdge[] = [];
  // Read from the layout-pass ref so we synth edges only for currently-rendered clusters.
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
  // Recompute when clusterLayout changes (which happens when handleAutoLayout fires).
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [chart, clusterLayout]);

const edgesWithCluster = useMemo<StructureEdge[]>(
  () => [...visibleEdges, ...clusterEdges],
  [visibleEdges, clusterEdges],
);

const renderableEdges = useMemo<StructureEdge[]>(
  () => (showTransactions ? edgesWithCluster : edgesWithCluster.filter((e) => e.kind === 'ownership')),
  [edgesWithCluster, showTransactions],
);
```

**B.5. Add `handleCollapseAll` callback**

Near the other `useCallback`s:

```ts
const handleCollapseAll = useCallback(() => {
  setExpandedClusters(new Set());
}, []);
```

**B.6. Pass `renderableEdges` to `<StructureChart>`**

Find the `<StructureChart>` JSX. Change:

```tsx
<StructureChart
  entities={visibleEntities}
  edges={visibleEdges}
  ...
/>
```

to:

```tsx
<StructureChart
  entities={visibleEntities}
  edges={renderableEdges}
  ...
/>
```

**B.7. Pass new props to `<FloatingToolbar>`**

Find the `<FloatingToolbar>` JSX. Add the four new props:

```tsx
<FloatingToolbar
  status={typeof status === 'string' ? status : ''}
  entityCount={visibleEntities.length}
  ownershipCount={visibleEdges.filter((e) => e.kind === 'ownership').length}
  transactionCount={visibleEdges.filter((e) => e.kind === 'transaction').length}
  onAutoLayout={handleAutoLayout}
  onReExtract={handleReExtract}
  onExportPptx={() => {
    exportToPptx({
      entities: visibleEntities,
      edges: visibleEdges,
      taxpayerName: '',
    });
  }}
  busy={busy}
  // NEW
  transactionsVisible={showTransactions}
  onToggleTransactions={() => setShowTransactions((v) => !v)}
  expandedClusterCount={expandedClusters.size}
  onCollapseAll={handleCollapseAll}
/>
```

(Note: the toolbar `ownershipCount` / `transactionCount` keep using `visibleEdges` — i.e., real counts, not visibility-filtered. The toggle only affects rendering.)

(Note: PPTX export still uses the unfiltered `visibleEdges` so the deliverable always includes transactions — toggling visibility on screen doesn't omit them from the export.)

### Steps

- [ ] **Step 1: Apply Step A** — extend `FloatingToolbar` props + render banner + render toggle button.

- [ ] **Step 2: Apply Step B.1 + B.2** — `activeClustersRef` + ref update inside `handleAutoLayout`.

- [ ] **Step 3: Apply Step B.3** — `showTransactions` state.

- [ ] **Step 4: Apply Step B.4** — three new `useMemo`s (`clusterEdges`, `edgesWithCluster`, `renderableEdges`).

- [ ] **Step 5: Apply Step B.5** — `handleCollapseAll` callback.

- [ ] **Step 6: Apply Step B.6** — pass `renderableEdges` to `<StructureChart>`.

- [ ] **Step 7: Apply Step B.7** — pass four new props to `<FloatingToolbar>`.

- [ ] **Step 8: Verify**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 46 tests pass, build succeeds.

- [ ] **Step 9: Commit (when user asks)**

```bash
git add src/components/structure/FloatingToolbar.tsx src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): show/hide transactions + recollapse banner + cluster ownership lines"
```

---

## Task 4: Local verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: All-green check**

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

Open `http://localhost:8080`, sign in, navigate to the existing S4 Energy session's structure-chart step.

1. **PPTX fits slide**: Click Export PPTX → open the file. All entities visible inside the slide; no content cut off at the right edge.
2. **No name duplication**: Taxpayer reads "S4 Energy B.V." (one B.V., not two).
3. **Edge labels readable**: Transaction labels sit above their lines; no overlap with entity boxes. Ownership lines have percentages on the child-side drop, not in the middle of the canvas.
4. **Hark on-screen**: Parent with 5 children renders with ONE shared trunk → horizontal bus → 5 short drops to children. No diagonals; corner radius 4px.
5. **Hark in PPTX**: Same shape on the exported slide.
6. **Side handles for transactions**: A transaction between two entities exits source's right edge, enters target's left edge. Ownership lines stay top-bottom.
7. **Toggle hides transactions**: Click "Hide transactions" — all transaction edges + labels disappear; ownership tree remains. Click again — they reappear.
8. **Recollapse banner**: Expand a cluster — banner "1 expanded · Collapse" appears. Click it — cluster folds back, banner disappears.
9. **Cluster has parent line**: In collapsed state, a line visibly connects the cluster placeholder to its parent.

- [ ] **Step 4: Document any deviations**

If any item above doesn't behave as expected, capture a screenshot + DevTools details. That becomes the next iteration's input.

---

## Self-Review

### Spec coverage

| Spec § | Implemented in |
|---|---|
| §3.1 PPTX bbox/scale/offset | Task 1 Steps 2, 3, 5, 6 |
| §3.2 Name dedup | Task 1 Step 2 (`buildEntityLabel`) + Step 3 |
| §3.3 Edge label offset | Task 1 Step 2 (`labelPosition`) + Step 5 |
| §3.4 Hark on-screen | Task 2 Step A |
| §3.5 Hark in PPTX | Task 1 Step 4 (`addOwnershipBus`) + Step 6 |
| §3.6 Side handles | Task 2 Steps B + C |
| §3.7 Show/Hide transactions | Task 3 Step A + B.3 + B.4 + B.6 + B.7 |
| §3.8 Cluster recollapse banner | Task 3 Step A (banner) + B.5 + B.7 |
| §3.9 Cluster ownership line | Task 3 Step B.1 + B.2 + B.4 + B.6 |

### Placeholder scan
- No "TBD" / "TODO" / "implement later" remaining.
- Every code step shows the actual code or actual diff snippet.
- Every command step shows the actual command + expected output.

### Type-name consistency
- `Fit` / `EntityRect` / `computeFit` / `projectXY` / `buildEntityLabel` / `labelPosition` / `addOwnershipBus` — all defined in Task 1 Step 2 + Step 4, used consistently in Steps 3, 5, 6.
- `addEdge` is renamed to `addTransactionEdge` in Task 1 Step 5; the call site in Step 6 uses the new name.
- `activeClustersRef` defined in Task 3 Step B.1, referenced in Step B.4. `clusterEdges`, `edgesWithCluster`, `renderableEdges` defined in Step B.4 in that order, consumed in Step B.6.
- `transactionsVisible`, `onToggleTransactions`, `expandedClusterCount`, `onCollapseAll` — names match between `FloatingToolbar` Props (Step A) and the StructureChartStep call site (Step B.7).
- xyflow handle ids `'top' | 'bottom' | 'left' | 'right'` consistent between `EntityNode.tsx` (Step B) and `StructureChart.tsx` transaction edge config (Step C).

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-structure-chart-hark-and-pptx.md`.**

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Three substantive tasks fit this flow well.

**2. Inline Execution** — execute in this session via the executing-plans skill, batched with checkpoints.

Which approach?
