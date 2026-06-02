# Structure Chart Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three live bugs (React Flow attribution, `+ Entity` disappears, PPTX export broken) and apply four visual upgrades (always-on taxpayer outline, curved/foreground transaction edges, short taxpayer-perspective transaction labels with amount + mismatch sublines).

**Architecture:** Four existing files modified. No new components, no new dependencies. All changes are small targeted edits.

**Tech Stack:** Existing React + Vite + TS + Tailwind + `@xyflow/react` 12.10.2 + `pptxgenjs`. No new deps.

**Spec:** [docs/superpowers/specs/2026-05-08-structure-chart-polish-design.md](../specs/2026-05-08-structure-chart-polish-design.md). Read first.

**Project rules (CRITICAL):**
- **NEVER `git commit` or `git push`.** Commit steps are preparation only — only run when user explicitly asks.
- **`main` is live production.**
- **All UI strings must be English.**

---

## File Structure

### Modified
```
src/components/structure/StructureChartStep.tsx           // orphan-filter exception, static PPTX import
src/components/structure/StructureChart.tsx               // hideAttribution, zIndex on transaction edges, taxpayer-flag injection
src/components/structure/edges/TransactionEdge.tsx        // curvature 0.6, taxpayer-perspective topLine, sublines
src/components/structure/nodes/EntityNode.tsx             // 1.5px black outline when is_taxpayer
```

### New / Deleted
None.

---

## Task index

| # | Task | Files |
|---|---|---|
| 1 | Bug fixes — attribution + orphan filter + PPTX static import | `StructureChart.tsx` + `StructureChartStep.tsx` |
| 2 | Visual — taxpayer outline + transactions curvature/zIndex/labels | `EntityNode.tsx`, `TransactionEdge.tsx`, `StructureChart.tsx` |
| 3 | Local verification + manual smoke | none |

---

## Task 1: Bug fixes — attribution, orphan filter, PPTX static import

Three small fixes, all in two files.

**Files:**
- Modify: `src/components/structure/StructureChart.tsx`
- Modify: `src/components/structure/StructureChartStep.tsx`

### Fix A: Hide React Flow attribution

In `src/components/structure/StructureChart.tsx`, find the `<ReactFlow>` JSX. Add the `proOptions` prop:

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  edgeTypes={edgeTypes}
  // ... existing props ...
  proOptions={{ hideAttribution: true }}
>
```

(Place the prop adjacent to the other top-level `<ReactFlow>` props; order doesn't matter.)

### Fix B: `+ Entity` orphan-filter exception

In `src/components/structure/StructureChartStep.tsx`, find the `visibleEntities` `useMemo`. Currently it returns:

```tsx
return entities.filter((e) => connected.has(e.id));
```

Change to:

```tsx
return entities.filter(
  (e) => connected.has(e.id) || e.source === 'user_added' || e.source === 'user_edited',
);
```

This keeps user-added entities visible even when they have no ownership-edge path to the taxpayer.

### Fix C: PPTX static import

In `src/components/structure/StructureChartStep.tsx`:

**Step 1**: Add a static import at the top of the file (alongside the other component imports):

```tsx
import { exportToPptx } from './exports/exportToPptx';
```

**Step 2**: Find the existing `onExportPptx` handler in the JSX (it's currently a dynamic-import block with `@vite-ignore`). Replace the entire handler:

```tsx
onExportPptx={() => {
  const modulePath = /* @vite-ignore */ './exports/exportToPptx';
  import(/* @vite-ignore */ modulePath)
    .then((m: { exportToPptx: ... }) => m.exportToPptx({ ... }))
    .catch((err) => console.error(err));
}}
```

with:

```tsx
onExportPptx={() => {
  exportToPptx({
    entities: visibleEntities,
    edges: visibleEdges,
    taxpayerName: '',
  });
}}
```

(`taxpayerName: ''` is an existing limitation; PPTX export uses it as the filename. Out of scope to wire it up to chart.session_id → atad2_sessions.taxpayer_name in this task.)

### Steps

- [ ] **Step 1: Apply Fix A** in `StructureChart.tsx` — add `proOptions={{ hideAttribution: true }}` to `<ReactFlow>`.

- [ ] **Step 2: Apply Fix B** in `StructureChartStep.tsx` — extend the `visibleEntities` filter.

- [ ] **Step 3: Apply Fix C** in `StructureChartStep.tsx` — add static `import { exportToPptx }` and replace the dynamic-import handler.

- [ ] **Step 4: Verify**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 46 tests pass, build succeeds. Bundle for `AssessmentStructure-*.js` will grow ~300 kB (pptxgenjs now bundled in main chunk).

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/components/structure/StructureChart.tsx src/components/structure/StructureChartStep.tsx
git commit -m "fix(structure): hide attribution, render user-added entities, static PPTX import"
```

---

## Task 2: Visual — taxpayer outline + transaction curvature/zIndex/labels

All visual upgrades in three files. Bundled because they're tightly related and small.

**Files:**
- Modify: `src/components/structure/nodes/EntityNode.tsx`
- Modify: `src/components/structure/edges/TransactionEdge.tsx`
- Modify: `src/components/structure/StructureChart.tsx`

### Step A: Taxpayer outline in `EntityNode.tsx`

Find the SVG block where the outer shape is rendered. There are three outer-shape branches (`rect`, `polygon`, `ellipse`) plus an `individual` branch — each currently sets `stroke={PALETTE.outerStroke}` and `strokeWidth={0.75}`.

For each of the four branches, replace those two attributes:

```tsx
stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
```

Concretely (showing one branch as the canonical example — apply the same to the other three):

```tsx
{geom.outer.kind === 'rect' && (
  <rect
    width={BOX.width}
    height={BOX.height}
    rx={geom.outer.rx}
    fill={fill}
    stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
    strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
  />
)}
```

For the `individual` branch (which renders a circle head + trapezoid body, both filled), apply the same two attributes to BOTH the head circle and the body polygon. Result: the dark grey individual silhouette gains a 1.5 px black outline if it's the taxpayer (rare but supported).

DO NOT change the existing selected-state outline (the wrapper SVG's `outline: 2px solid #1f5489`). That stays as-is. The black taxpayer-stroke + blue selected-outline coexist visually.

### Step B: Transaction curvature in `TransactionEdge.tsx`

Find the `getBezierPath` call:

```tsx
const [path, labelX, labelY] = getBezierPath({
  sourceX, sourceY, targetX, targetY, curvature: 0.4,
});
```

Change `curvature: 0.4` to `curvature: 0.6`.

### Step C: Transaction edge zIndex + taxpayer-flag injection in `StructureChart.tsx`

Two changes here, both inside the `initialEdges` `useMemo`:

**C.1**: Find the taxpayer entity once at the top of the `useMemo`:

```tsx
const initialEdges = useMemo<ChartEdgeType[]>(
  () => {
    const taxpayerId = props.entities.find((e) => e.is_taxpayer)?.id;
    return props.edges.map<ChartEdgeType>((e) =>
      e.kind === 'ownership'
        ? ({ /* unchanged ownership branch */ })
        : ({
            id: e.id,
            source: e.from_entity_id,
            target: e.to_entity_id,
            type: 'transaction',
            zIndex: 10,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: e.is_mismatch
                ? PALETTE.mismatchStroke
                : PALETTE.normalTransactionStroke,
            },
            data: {
              transaction_type: (e.transaction_type ?? 'other') as TransactionEdgeData['transaction_type'],
              amount_eur: e.amount_eur,
              is_mismatch: e.is_mismatch,
              mismatch_classification: (e.mismatch_classification ?? null) as TransactionEdgeData['mismatch_classification'],
              mismatch_atad2_article: e.mismatch_atad2_article,
              label: e.label,
              is_taxpayer_from: taxpayerId != null && e.from_entity_id === taxpayerId,
              is_taxpayer_to:   taxpayerId != null && e.to_entity_id   === taxpayerId,
            } satisfies TransactionEdgeData,
          } as TransactionEdgeType),
    );
  },
  [props.edges, props.entities],
);
```

Notes:
- The whole `useMemo` body is wrapped in `{ const taxpayerId = ...; return ...map(...); }` instead of the bare arrow.
- `props.entities` is added to the dep array (was just `props.edges`).
- The transaction branch gains `zIndex: 10` and the two new boolean flags inside `data`.
- The ownership branch is unchanged (no `zIndex`, no taxpayer flags).

### Step D: Update `TransactionEdgeData` interface and the rendered label in `TransactionEdge.tsx`

**D.1**: Extend the interface:

```tsx
export interface TransactionEdgeData {
  transaction_type: TransactionType;
  amount_eur: number | null;
  is_mismatch: boolean;
  mismatch_classification: MismatchClassification | null;
  mismatch_atad2_article: string | null;
  label: string | null;
  is_taxpayer_from?: boolean;
  is_taxpayer_to?: boolean;
}
```

**D.2**: Add a top-line helper near the existing `TYPE_VERB` map:

```tsx
function topLine(data: TransactionEdgeData): string {
  if (data.is_taxpayer_from) return 'Payable';
  if (data.is_taxpayer_to)   return 'Receivable';
  return TYPE_VERB[data.transaction_type] ?? 'Transaction';
}
```

**D.3**: Rewrite the JSX of the label block. Current:

```tsx
<EdgeLabelRenderer>
  <div style={{ /* ... */ }}>
    <div>{data?.label || amount}</div>
    {subline && <div style={{ fontSize: 10, marginTop: 1 }}>{subline}</div>}
  </div>
</EdgeLabelRenderer>
```

Replace with:

```tsx
<EdgeLabelRenderer>
  <div style={{
    position: 'absolute',
    transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
    background: '#fff',
    border: '0.75px solid rgba(0,0,0,0.16)',
    borderRadius: 2,
    padding: '4px 8px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 11.5,
    fontWeight: 700,
    color: stroke,
    textAlign: 'center',
    pointerEvents: 'all',
    lineHeight: 1.25,
  }}>
    <div>{data ? topLine(data) : 'Transaction'}</div>
    {data?.amount_eur != null && (
      <div style={{ fontWeight: 600, fontSize: 11 }}>
        EUR {formatAmount(data.amount_eur)}
      </div>
    )}
    {data?.is_mismatch && data.mismatch_classification && (
      <div style={{ fontWeight: 600, fontSize: 10 }}>
        {data.mismatch_classification} mismatch
        {data.mismatch_atad2_article ? ' · art ' + data.mismatch_atad2_article : ''}
      </div>
    )}
  </div>
</EdgeLabelRenderer>
```

The local variables `stroke` and `formatAmount` already exist in the file — keep them.

**D.4**: Remove now-unused locals if any. Specifically the old `verb`, `amount`, `subline` constants near the top of the function body can be deleted (they're no longer referenced after the JSX rewrite). Compile-check will flag any leftover references.

### Steps

- [ ] **Step 1: Apply Step A** — taxpayer outline branches in `EntityNode.tsx` (rect, polygon, ellipse, individual head + body).

- [ ] **Step 2: Apply Step B** — `curvature: 0.4 → 0.6` in `TransactionEdge.tsx`.

- [ ] **Step 3: Apply Step C** — `taxpayerId` discovery + `zIndex: 10` + `is_taxpayer_from`/`to` flags in `StructureChart.tsx`'s `initialEdges` useMemo. Add `props.entities` to dep array.

- [ ] **Step 4: Apply Step D** — extend `TransactionEdgeData`, add `topLine` helper, rewrite the label block, remove unused locals.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 46 tests pass, build succeeds.

- [ ] **Step 6: Commit (when user asks)**

```bash
git add src/components/structure/nodes/EntityNode.tsx src/components/structure/edges/TransactionEdge.tsx src/components/structure/StructureChart.tsx
git commit -m "feat(structure): taxpayer outline + curved transactions + short labels"
```

---

## Task 3: Local verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Final all-green check**

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

Open the app at `http://localhost:8080`, sign in, navigate to the existing S4 Energy session's structure-chart step.

1. **Attribution gone**: no "React Flow" badge in bottom-right of canvas.
2. **+ Entity works**: click `+ Entity ▾` → pick "Corporation" → new "New entity" appears at canvas position (200, 200) and stays visible. Doesn't get filtered as orphan.
3. **PPTX export works**: click "Export PPTX" → browser downloads `Taxpayer - Structure Chart.pptx` (or similar). Open it: native PPT shapes visible.
4. **Taxpayer outlined**: even with no node selected, the taxpayer entity has a 1.5 px black border around its shape. Click on a non-taxpayer node — the taxpayer black outline stays; the clicked node gains the blue selection outline.
5. **Transactions curve clearly**: on a chart with a transaction between parent and direct child, the transaction edge visibly bows away from the ownership line. Where ownership and transaction overlap in 2D, transaction draws ON TOP of ownership (zIndex). No more straight transaction edges hidden behind ownership.
6. **Transaction labels short + structured**: any transaction where one endpoint is the taxpayer reads `Receivable` (in-flow) or `Payable` (out-flow) on line 1, EUR amount on line 2, mismatch info on line 3 (when applicable). Where neither endpoint is taxpayer, line 1 falls back to type (Loan, Royalty, etc.).

- [ ] **Step 4: Document any deviations** as the next iteration's input.

---

## Self-Review

### Spec coverage
| Spec section | Implemented in |
|---|---|
| §3 In MVP-3.6 — hide attribution | Task 1, Fix A |
| §3 In MVP-3.6 — `+ Entity` orphan-filter exception | Task 1, Fix B |
| §3 In MVP-3.6 — PPTX static import | Task 1, Fix C |
| §3 In MVP-3.6 — taxpayer 1.5px black outline | Task 2, Step A |
| §3 In MVP-3.6 — transaction curvature 0.6 | Task 2, Step B |
| §3 In MVP-3.6 — transaction zIndex 10 | Task 2, Step C |
| §3 In MVP-3.6 — short taxpayer-perspective labels + amount + mismatch sublines | Task 2, Steps C + D |
| §3 Out-of-scope items | Acknowledged, no tasks |
| §4 Bug fixes (4.1-4.3) | Task 1 |
| §5 Visual upgrades (5.1-5.3) | Task 2 |
| §8 Manual smoke test | Task 3 |

### Placeholder scan
- No "TBD" / "TODO" / "implement later" remaining.
- Every code step shows the actual code or the actual diff.
- Every command step shows the actual command + expected output.

### Type-name consistency
- `TransactionEdgeData` shape consistent across Task 2 Step C (parent-side data construction) and Step D (consumer-side render). The two new optional fields `is_taxpayer_from` / `is_taxpayer_to` defined in D.1 and used in D.2 + populated in C.1 — same names everywhere.
- `taxpayerId` is a local in `StructureChart.tsx`'s `initialEdges` useMemo (Task 2 Step C); not exposed elsewhere.
- `topLine` helper added inside `TransactionEdge.tsx`; consumed inline. Not exported.
- `'#1a1a1a'` literal used in EntityNode taxpayer-outline (Task 2 Step A). Same value already used elsewhere as text color via `PALETTE.text`'s related constants — no semantic conflict.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-structure-chart-polish.md`.**

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. 3 small tasks, fits well.

**2. Inline Execution** — execute in this session via the executing-plans skill, batched with checkpoints.

Which approach?
