# Transaction Focus Mode — Design Spec

**Date:** 2026-05-13
**Status:** Approved (brainstorm → spec)
**Builds on:** `docs/superpowers/specs/2026-05-12-tcm-structure-chart-refactor-design.md` (MVP-3.8 — must ship first)
**Owner:** Lennart Wilming

## 1. Goal

Replace the always-visible transaction-edge rendering on the structure chart with an on-demand, focus-driven model that bundles transactions per entity-pair. This eliminates the "spaghetti" of 15+ crossing bezier curves visible on real client charts (e.g. S4 Energy) and lets advisors build a focused transaction picture step-by-step for the memo.

After this spec ships:
- The chart defaults to ownership-only — no transaction edges visible on load.
- Clicking an entity adds it to a "focus set"; that entity's transactions render as bundles (one bezier per counterpart, regardless of underlying transaction count).
- Clicks accumulate: clicking S4 then a parent then a child progressively reveals more bundles, building a memo-ready picture.
- Clicking an already-focused entity removes it from the set.
- A toolbar "Clear focus" button resets the set.
- PPTX and PNG exports capture the currently visible state — focus set in, ownership-only when empty.

## 2. Why this matters

Production testing of the S4 Energy chart (MVP-3.7 deployed, MVP-3.8 pending) showed that even with hark ownership routing, side-handle transaction edges, and short transaction labels, charts with 15+ transactions become unreadable. The S4 case has Receivable / Payable / Loan transactions between every parent and the taxpayer plus the taxpayer and several subsidiaries — visually, all transaction curves overlap.

The bezier-curve approach also makes label placement impossible to control: `Receivable EUR 14k`, `Payable EUR 65k`, and `Loan EUR 31.5k` labels collide with each other and the underlying node boxes.

Existing mitigations (the MVP-3.7 Hide/Show transactions toggle) work but force a binary choice between full chaos and complete invisibility. Tax advisors writing a memo on a specific entity want to see ONLY that entity's transactions and progressively reveal more as the analysis develops. That use case is the source of this spec.

## 3. Scope

### In MVP-3.9 (this spec)

1. **Focus-set state in `StructureChartStep`.** Replace `showTransactions: boolean` with `focusedEntityIds: Set<string>`. Default empty.
2. **Click-to-toggle focus** on entity nodes. Click an entity → toggle membership in the focus set. Multi-focus accumulates. Clicking empty canvas has no effect on the focus set — clearing requires the toolbar "Clear focus" button.
3. **Bundle aggregation** in `StructureChart`. For each focused entity, group its outgoing AND incoming transactions by counterpart entity. Render ONE bezier per (focused, counterpart) pair.
4. **Bundle visualization** in `TransactionEdge`. Single transaction → existing label (e.g. `Receivable · €5M`). Two or more → summary label `(N transactions · €<sum>)`. Mismatch styling (red) when ANY transaction in the bundle is a mismatch.
5. **Bundle click popover** showing the individual transactions (type, amount, mismatch classification, ATAD2 article). Read-only; existing edge inspector remains the edit surface.
6. **Visual focus indicator** on focused entities (subtle accent — e.g. 2px ring inside the existing outline, distinct from the selected-state blue outline).
7. **Toolbar changes:** remove the Hide/Show transactions button; add a "Clear focus (N)" button shown only when `focusedEntityIds.size > 0`.
8. **PPTX export rebuild.** Replace per-transaction rendering with bundle rendering driven by `focusedEntityIds`. Empty focus set → no transactions in export.

### Explicitly out of scope (cut to keep scope tight)

- **No multi-focus keyboard shortcuts** (e.g. Shift+click for additive vs Ctrl+click for replace). Single-click toggle is the only interaction.
- **No cluster focus.** Clicking a cluster placeholder does NOT add its members to the focus set. (Future spec if needed.)
- **No focus persistence across sessions** — focus set is per-session, lost on reload. Persisting is YAGNI for tax memos (advisors typically work in one sitting).
- **No "filter by transaction type" toggle.** The bundle popover lists all types; filtering can come later.
- **No animation on bundle reveal/hide.** Instant toggle.
- **No changes to the validator pipeline, label measurement, layout engine, cluster visual, or fiscal-unity overlay** — those are MVP-3.8's territory.

### Dependency

This spec assumes MVP-3.8 ships first. If MVP-3.8 hasn't merged when implementation starts, the implementer must rebase / handle merge conflicts in `StructureChart.tsx`, `StructureChartStep.tsx`, `FloatingToolbar.tsx`, and `exportToPptx.ts`.

## 4. State model (`src/components/structure/StructureChartStep.tsx`)

### 4.1 Replace `showTransactions` with focus set

Current:
```ts
const [showTransactions, setShowTransactions] = useState(true);
```

New:
```ts
const [focusedEntityIds, setFocusedEntityIds] = useState<Set<string>>(new Set());
```

Toggle handler:
```ts
const handleToggleFocus = useCallback((entityId: string) => {
  setFocusedEntityIds((prev) => {
    const next = new Set(prev);
    if (next.has(entityId)) next.delete(entityId);
    else next.add(entityId);
    return next;
  });
}, []);

const handleClearFocus = useCallback(() => {
  setFocusedEntityIds(new Set());
}, []);
```

### 4.2 Pass focus state to `<StructureChart>`

Add prop `focusedEntityIds: Set<string>` and `onToggleFocus: (id: string) => void`. The chart component uses these for:
- Determining which transactions to render
- Rendering the focus visual on entity nodes
- Wiring entity-click → `onToggleFocus`

### 4.3 Pass to `<FloatingToolbar>`

Remove props: `transactionsVisible`, `onToggleTransactions`. Add props: `focusedCount: number`, `onClearFocus: () => void`.

## 5. Bundle aggregation (`src/components/structure/StructureChart.tsx`)

### 5.1 Bundle data shape

```ts
interface TransactionBundle {
  bundleId: string;             // `${from_id}|${to_id}`
  from_entity_id: string;
  to_entity_id: string;
  transactions: StructureEdge[]; // the underlying transaction edges
  totalAmount: number | null;    // sum of amount_eur where non-null
  hasMismatch: boolean;          // any transaction.is_mismatch
}
```

### 5.2 Aggregation pass

In `initialEdges` useMemo, BEFORE building React Flow edge objects:

1. Filter `props.edges` to transactions only: `txns = edges.filter(e => e.kind === 'transaction')`.
2. Filter to those touching the focus set: `relevant = txns.filter(e => focused.has(e.from_entity_id) || focused.has(e.to_entity_id))`.
3. Group by directed pair: `Map<string, StructureEdge[]>` keyed by `${from}|${to}`.
4. Build a `TransactionBundle` per group.
5. Map each bundle → one React Flow edge with `type: 'transactionBundle'`, `data: { bundle: TransactionBundle }`.

Ownership edges are unchanged.

### 5.3 Bundle edge object

```ts
{
  id: bundle.bundleId,
  source: bundle.from_entity_id,
  target: bundle.to_entity_id,
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'transactionBundle',
  zIndex: 10,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: bundle.hasMismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke,
  },
  data: { bundle },
}
```

The existing `TransactionEdge` component renders single bundles; we extend it OR add a new `TransactionBundleEdge` component (decided in §6).

## 6. Bundle rendering (`src/components/structure/edges/TransactionEdge.tsx` or new `TransactionBundleEdge.tsx`)

### 6.1 Component replacement

Every transaction edge in the new model is rendered as a bundle, even a "bundle" of size 1 (which renders with the existing single-transaction label). So a single `TransactionBundleEdge` component handles both N=1 and N≥2 cases. The existing `TransactionEdge.tsx` is replaced by `TransactionBundleEdge.tsx`.

### 6.2 Bundle edge component

```tsx
interface TransactionBundleEdgeData {
  bundle: TransactionBundle;
}

function TransactionBundleEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }: EdgeProps<...>) {
  const { bundle } = data;
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, curvature: 0.6,
  });
  const stroke = bundle.hasMismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke;
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke, strokeWidth: 1.5 }} />
      <EdgeLabelRenderer>
        <div
          style={{
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
            lineHeight: 1.25,
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
          onClick={() => setPopoverOpen((v) => !v)}
        >
          {bundle.transactions.length === 1
            ? <SingleTransactionLabel txn={bundle.transactions[0]} />
            : <BundleSummaryLabel bundle={bundle} />}
        </div>
        {popoverOpen && (
          <TransactionBundlePopover
            bundle={bundle}
            x={labelX}
            y={labelY}
            onClose={() => setPopoverOpen(false)}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
}
```

### 6.3 Label format

**Single transaction (N=1):** existing `topLine` + amount + mismatch sublines from the current `TransactionEdge`.

**Bundle (N≥2):**
- Line 1 (bold): `(N transactions)` — N = `bundle.transactions.length`
- Line 2 (regular): `€<sum>` formatted with same `formatAmount` helper, where sum = total of non-null `amount_eur` across the bundle's transactions; omitted if all amounts are null
- Line 3 (only when `bundle.hasMismatch`): `<mismatches> mismatch` — count of mismatch transactions in the bundle, e.g. `1 of 3 mismatch`

### 6.4 Mismatch color

If `bundle.hasMismatch`, color the entire bundle red (`PALETTE.mismatchStroke`). Even a single mismatch in a 5-transaction bundle elevates the whole bundle to red — the advisor needs to know.

## 7. Bundle popover (`src/components/structure/TransactionBundlePopover.tsx`)

New component.

### 7.1 Trigger

Click the bundle's edge label → opens. Click outside or the close button → closes. One popover open at a time (clicking another bundle closes the previous).

### 7.2 Position

Anchored at the label position, rendered as an absolutely-positioned div above the chart canvas. Width ~280px. Auto-flips when near the canvas edge (out of scope for v1 — start position-fixed; adjust if it breaks).

### 7.3 Content

```
┌──────────────────────────────────────┐
│ S4 Energy B.V. → Castleton           │  ← entities by name
│ 3 transactions · €6.5M total          │  ← summary
├──────────────────────────────────────┤
│ Loan       €5.0M    D/NI · art 12aa  │  ← per-transaction row
│ Royalty    €1.4M                      │
│ Service    €100k                      │
└──────────────────────────────────────┘
```

Each row clickable → opens the edge inspector for that specific transaction (so the user can edit it). Closes the popover.

### 7.4 Styling

Tailwind/shadcn — `bg-white border border-neutral-200 rounded-md shadow-lg`. Same visual language as `FloatingInspector`.

## 8. Focus visual on entity nodes (`src/components/structure/nodes/EntityNode.tsx`)

When an entity is in the focus set, render a subtle accent. The taxpayer's 1.5px black outline (from MVP-3.6) stays. The selection outline (2px blue) stays. The focus accent is a third visual:

```tsx
{data.focused && (
  <rect
    x={-3} y={-3}
    width={W + 6} height={H + 6}
    fill="none"
    stroke="#2d7d6e"           // teal — distinct from focal-red and selection-blue
    strokeWidth={2}
    strokeDasharray="3 3"
    rx={4}
  />
)}
```

Pass `focused: boolean` through `EntityNodeData` (set by `StructureChart` per entity).

Clicking an entity now does TWO things:
1. Existing: opens the inspector (`onSelectionChange`)
2. New: toggles focus (`onToggleFocus`)

These are not mutually exclusive — both happen on the same click. Selection drives the inspector; focus drives the transaction reveal. The user opens the inspector by clicking, AND simultaneously starts seeing transactions for that entity. This is desired: "I want to know about this entity" naturally means both "show me its details" and "show me its transactions."

## 9. Toolbar (`src/components/structure/FloatingToolbar.tsx`)

### 9.1 Removed
- `transactionsVisible: boolean` prop
- `onToggleTransactions: () => void` prop
- The Hide/Show transactions button

### 9.2 Added
- `focusedCount: number` prop
- `onClearFocus: () => void` prop
- A "Clear focus (N)" button rendered only when `focusedCount > 0`. Style: outline button, similar to the existing "N expanded · Collapse" pattern.

### 9.3 Counters

The existing counters `entityCount · ownershipCount · transactionCount` stay. `transactionCount` continues to show the TOTAL number of transactions in the data, not the number currently visible. Add a hint when `focusedCount > 0`: e.g. `12 transactions (X visible)`. Or just leave it as is — the user knows what they clicked. **Decision: leave as is.** YAGNI.

## 10. PPTX export (`src/components/structure/exports/exportToPptx.ts`)

### 10.1 Signature change

Add `focusedEntityIds?: Set<string>` to the export options. Default empty (no transactions exported).

```ts
export async function exportToPptx({
  entities,
  edges,
  groupings = [],
  focusedEntityIds = new Set(),
  taxpayerName,
}: {
  entities: StructureEntity[];
  edges: StructureEdge[];
  groupings?: StructureGroup[];
  focusedEntityIds?: Set<string>;
  taxpayerName: string;
})
```

### 10.2 Replace per-transaction rendering with bundle rendering

The existing `addTransactionEdge(slide, edge, from, to, fit)` is called once per transaction. Replace with bundle-aware code:

```ts
const transactionEdges = edges.filter((e) => e.kind === 'transaction');
const relevantTxns = transactionEdges.filter(
  (e) => focusedEntityIds.has(e.from_entity_id) || focusedEntityIds.has(e.to_entity_id),
);

// Group by (from, to)
const bundlesByPair = new Map<string, StructureEdge[]>();
for (const t of relevantTxns) {
  const key = `${t.from_entity_id}|${t.to_entity_id}`;
  const list = bundlesByPair.get(key) ?? [];
  list.push(t);
  bundlesByPair.set(key, list);
}

for (const [key, txns] of bundlesByPair) {
  const [fromId, toId] = key.split('|');
  const from = entities.find((e) => e.id === fromId);
  const to = entities.find((e) => e.id === toId);
  if (!from || !to) continue;
  addTransactionBundle(slide, txns, from, to, fit);
}
```

### 10.3 `addTransactionBundle` helper

Mirror `addTransactionEdge` but produce a single line per bundle with the bundle-summary label format (`(N transactions · €total)` for N≥2, single-transaction label for N=1). Mismatch color when any transaction in the bundle is a mismatch.

### 10.4 Empty focus set → ownership-only PPTX

When `focusedEntityIds.size === 0`, NO transactions are exported. The PPTX shows only entities + ownership-bus + fiscal-unity overlay (from MVP-3.8). This is consistent with the on-screen behavior.

## 11. Files

### Modified
```
src/components/structure/StructureChartStep.tsx           // focus state, handlers, prop wiring
src/components/structure/StructureChart.tsx               // bundle aggregation, focus prop on nodes, edge type
src/components/structure/FloatingToolbar.tsx              // Hide/Show button removed, Clear focus button added
src/components/structure/nodes/EntityNode.tsx             // focus accent ring
src/components/structure/exports/exportToPptx.ts          // bundle rendering replaces per-transaction
```

### New
```
src/lib/structure/bundleTransactions.ts                                 // pure bundle aggregator
src/lib/structure/__tests__/bundleTransactions.test.ts                  // unit tests for the aggregator
src/components/structure/edges/TransactionBundleEdge.tsx                // replaces TransactionEdge in registration
src/components/structure/TransactionBundlePopover.tsx                   // bundle detail panel
```

### Deleted
```
src/components/structure/edges/TransactionEdge.tsx                      // replaced by TransactionBundleEdge
```

### Shared aggregation helper

The `bundleTransactions` aggregator (listed under New above) is a pure helper consumed by both `StructureChart` (for on-screen rendering) and `exportToPptx` (for PPTX bundles). One source of truth avoids divergent aggregation logic.

```ts
export function bundleTransactions(
  transactions: StructureEdge[],
  focusedEntityIds: Set<string>,
): TransactionBundle[];
```

## 12. Tests

### 12.1 `bundleTransactions.test.ts` — new

Pure helper, no React.

- **Empty focus set** → returns `[]`.
- **Single focused entity with 1 transaction to a counterpart** → 1 bundle, N=1, totalAmount = the transaction's amount.
- **Single focused entity with 3 transactions to the same counterpart** → 1 bundle, N=3, totalAmount = sum.
- **Single focused entity with transactions to 2 different counterparts** → 2 bundles.
- **2 focused entities, transactions between them** → 1 bundle (deduplicated).
- **Transaction with null amount_eur** → totalAmount excludes null entries; if all are null, totalAmount is null.
- **hasMismatch** → true iff at least one transaction in the bundle has `is_mismatch: true`.
- **Self-transaction** (from === to) → excluded (not a valid case; assertion).
- **Direction** (focused entity is `from` vs `to`) — both directions produce bundles; bundleId is directed (`${from}|${to}`), so A→B and B→A produce two separate bundles.

### 12.2 No new unit tests for `StructureChart`, `StructureChartStep`, toolbar, EntityNode, popover

These are React component layers; existing manual smoke covers them. The `bundleTransactions` helper has the logic; components just consume it.

Expected test count: 79 (current) + ~8 new bundle tests = ~87.

## 13. Manual smoke test

After implementation, on dev server:

1. **Default state.** Open S4 Energy session. Chart shows ownership tree only. No transaction edges visible. Toolbar shows total transaction count but no Clear button.
2. **Single focus.** Click S4 Energy. Entity gets the teal dashed ring. Transactions appear as bundles — one bezier per counterpart. Bundle labels show the per-pair summary.
3. **Bundle popover.** Click a bundle's label (e.g. S4 → Castleton). Popover opens listing the 3 transactions (Loan, Royalty, Service). Click outside → closes.
4. **Click in popover row.** Click the "Loan" row → edge inspector opens for that specific transaction. Popover closes.
5. **Stack focus.** Click a parent entity (e.g. Castleton). Castleton gets the teal ring. Its bundles appear too. S4's bundles remain.
6. **Toggle off.** Click S4 again. S4's ring disappears; S4's bundles disappear. Castleton's bundles stay.
7. **Clear focus.** Toolbar shows "Clear focus (1)". Click it. All rings and bundles disappear.
8. **Cluster click.** Click a cluster placeholder. Cluster expand still works (existing behavior). No focus added.
9. **PNG export (existing feature).** With S4 and a parent focused, take the PNG export. Image shows the visible state — ownership + the two focused entities' bundles.
10. **PPTX export.** With S4 and a parent focused, click Export PPTX. Open the file. Same: ownership-bus + bundles. No spaghetti.
11. **PPTX export, no focus.** Clear focus, then Export PPTX. No transactions in the PPTX, only ownership.
12. **Mismatch styling.** If at least one transaction in a bundle has `is_mismatch: true`, the bundle line is red and the label has the mismatch subline.

## 14. Out of scope — explicit notes

- **Cluster focus** (clicking a collapsed cluster to add all members) — future spec if needed.
- **Keyboard shortcuts** for multi-focus modes — single-click toggle is the only interaction.
- **Focus persistence across reload** — focus is per-session.
- **Animation / transitions** on bundle reveal — instant toggle.
- **Filter by transaction type** in the popover — popover lists all types; no filtering.
- **Touch / mobile interaction** — chart already requires mouse; no separate mobile UX.

## 15. References

- Spec MVP-3.7: `docs/superpowers/specs/2026-05-08-structure-chart-hark-and-pptx-design.md` — introduced the Hide/Show transactions toggle this spec removes.
- Spec MVP-3.8: `docs/superpowers/specs/2026-05-12-tcm-structure-chart-refactor-design.md` — must ship before this spec implements (file overlap on `StructureChart.tsx`, `StructureChartStep.tsx`, `FloatingToolbar.tsx`, `exportToPptx.ts`).
- React Flow custom edges: https://reactflow.dev/learn/customization/custom-edges
- Memory: `feedback_tax_chart_conventions.md` — strict shape conventions, parchment palette, no pill-badges.
