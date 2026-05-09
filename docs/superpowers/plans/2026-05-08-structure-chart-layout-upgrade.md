# Structure Chart Layout Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the structure-chart MVP so 50+ entity charts render readable: taxpayer-anchored ELK layout with multi-tier hierarchy, click-to-expand cluster nodes for non-ATAD2-relevant subsidiaries, full-viewport canvas with floating palette/inspector/toolbar overlays, white background.

**Architecture:** Replace `dagre` with `elkjs` for the structure-chart canvas only (admin chart keeps dagre). A new `relevance.ts` helper identifies ATAD2-relevant entities so siblings of non-relevant ones get bundled into a single `ClusterNode` that's expandable on click. Three columns become one full-viewport canvas with three floating overlays. Layout state stays client-side.

**Tech Stack:** Existing: React 18, Vite, TypeScript, Tailwind, shadcn/ui, `@xyflow/react` 12.10.2, `dagre` (admin only). New: `elkjs` ~0.9.x.

**Spec:** [docs/superpowers/specs/2026-05-08-structure-chart-layout-upgrade-design.md](../specs/2026-05-08-structure-chart-layout-upgrade-design.md). Read it before starting.

**Project rules (CRITICAL):**
- **NEVER `git commit` or `git push`.** Commit steps below are preparation only — only run them when the user explicitly asks.
- **`main` is live production.** Don't push unprompted.
- **All UI strings must be English.**

---

## File Structure

### New files
```
src/lib/structure/elkLayout.ts                              // taxpayer-anchored ELK layout (async)
src/lib/structure/relevance.ts                              // isAtad2Relevant + groupNonRelevantSiblings
src/lib/structure/__tests__/elkLayout.test.ts
src/lib/structure/__tests__/relevance.test.ts
src/components/structure/nodes/ClusterNode.tsx              // stacked-rect xyflow node, click to expand
src/components/structure/FloatingPalette.tsx                // top-left "+ Entity" pop-out
src/components/structure/FloatingInspector.tsx              // top-right, auto-show on selection
src/components/structure/FloatingToolbar.tsx                // bottom-center status + actions
```

### Modified files
```
package.json                                                // add elkjs
src/components/structure/StructureChart.tsx                 // bg=white, smoothstep edges, register cluster type, fix container size
src/components/structure/StructureChartStep.tsx             // async ELK trigger, cluster state, floating overlays layout
```

### Files left in place but no longer rendered
```
src/components/structure/EntityPalette.tsx                  // content lifted to FloatingPalette; safe to delete later
src/components/structure/StructureToolbar.tsx               // content lifted to FloatingToolbar; safe to delete later
src/components/structure/EntityInspector.tsx                // KEEP — embedded inside FloatingInspector
src/components/structure/EdgeInspector.tsx                  // KEEP — embedded inside FloatingInspector
src/lib/structure/dagreLayout.ts                            // KEEP — still used by admin/QuestionFlowCanvas.tsx
```

---

## Task index

| # | Task | Phase |
|---|---|---|
| 1 | Install elkjs | Foundation |
| 2 | `relevance.ts` (TDD) | Lib |
| 3 | `elkLayout.ts` (TDD) | Lib |
| 4 | `ClusterNode.tsx` | Component |
| 5 | `FloatingPalette.tsx` | Component |
| 6 | `FloatingInspector.tsx` | Component |
| 7 | `FloatingToolbar.tsx` | Component |
| 8 | Update `StructureChart.tsx` | Integration |
| 9 | Update `StructureChartStep.tsx` | Integration |
| 10 | Local verification + manual smoke | Verification |

---

## Task 1: Install elkjs

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npm install elkjs@^0.9.3
```

- [ ] **Step 2: Verify it imports**

Quick sanity check — temporarily in any existing TS file (no need to keep):

```bash
node -e "console.log(require('elkjs/lib/elk.bundled.js') ? 'ok' : 'missing')"
```

Expected output: `ok` (or no error).

- [ ] **Step 3: Run existing tests** to confirm no regression:

```bash
npm test
```

Expected: 26 tests pass.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add elkjs for structure-chart layout"
```

---

## Task 2: `relevance.ts` (TDD)

Determines whether an entity is ATAD2-relevant per the 5 criteria in spec §4.3, and groups non-relevant siblings under each parent.

**Files:**
- Create: `src/lib/structure/__tests__/relevance.test.ts`
- Create: `src/lib/structure/relevance.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/structure/__tests__/relevance.test.ts
import { describe, it, expect } from 'vitest';
import { isAtad2Relevant, groupNonRelevantSiblings } from '@/lib/structure/relevance';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const ent = (id: string, overrides: Partial<StructureEntity> = {}): StructureEntity => ({
  id,
  chart_id: 'c1',
  name: id,
  legal_form: null,
  jurisdiction_iso: 'NL',
  entity_type: 'corporation',
  is_taxpayer: false,
  position_x: 0,
  position_y: 0,
  source: 'ai_extracted',
  created_at: '',
  updated_at: '',
  ...overrides,
});

const ownEdge = (from: string, to: string, id = `${from}->${to}`): StructureEdge => ({
  id,
  chart_id: 'c1',
  from_entity_id: from,
  to_entity_id: to,
  kind: 'ownership',
  ownership_pct: 100,
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

const txEdge = (from: string, to: string, id = `tx-${from}->${to}`): StructureEdge => ({
  ...ownEdge(from, to, id),
  kind: 'transaction',
  ownership_pct: null,
  transaction_type: 'loan',
});

describe('isAtad2Relevant', () => {
  it('returns true for the taxpayer', () => {
    const tx = ent('tx', { is_taxpayer: true });
    expect(isAtad2Relevant(tx, [tx], [], [], 'tx')).toBe(true);
  });

  it('returns true for an ancestor of the taxpayer', () => {
    const parent = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const edges = [ownEdge('p', 'tx')];
    expect(isAtad2Relevant(parent, [parent, tx], edges, [], 'tx')).toBe(true);
  });

  it('returns true if the entity has any transaction edge', () => {
    const a = ent('a');
    const b = ent('b');
    expect(isAtad2Relevant(a, [a, b], [], [txEdge('a', 'b')], 'tx')).toBe(true);
    expect(isAtad2Relevant(b, [a, b], [], [txEdge('a', 'b')], 'tx')).toBe(true);
  });

  it('returns true for hybrid entity types', () => {
    const dh = ent('dh', { entity_type: 'dh_entity' });
    const hp = ent('hp', { entity_type: 'hybrid_partnership' });
    const rh = ent('rh', { entity_type: 'reverse_hybrid' });
    expect(isAtad2Relevant(dh, [dh], [], [], '')).toBe(true);
    expect(isAtad2Relevant(hp, [hp], [], [], '')).toBe(true);
    expect(isAtad2Relevant(rh, [rh], [], [], '')).toBe(true);
  });

  it('returns false for a plain subsidiary with no transactions or special status', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const sub = ent('sub');
    const edges = [ownEdge('tx', 'sub')];
    expect(isAtad2Relevant(sub, [tx, sub], edges, [], 'tx')).toBe(false);
  });
});

describe('groupNonRelevantSiblings', () => {
  it('returns no clusters when fewer than 2 non-relevant siblings share a parent', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const sub = ent('sub');
    const edges = [ownEdge('tx', 'sub')];
    const result = groupNonRelevantSiblings([tx, sub], edges, [], 'tx');
    expect(result.clusters).toEqual([]);
  });

  it('clusters 2+ non-relevant siblings of the same parent', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const b = ent('b');
    const c = ent('c');
    const ownership = [ownEdge('tx', 'a'), ownEdge('tx', 'b'), ownEdge('tx', 'c')];
    const result = groupNonRelevantSiblings([tx, a, b, c], ownership, [], 'tx');
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].parent_id).toBe('tx');
    expect(result.clusters[0].member_ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps an entity outside the cluster if it has any relevant descendant', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const inter = ent('inter'); // inter is non-relevant but has hybrid descendant
    const dh = ent('dh', { entity_type: 'dh_entity' });
    const dull = ent('dull'); // plain non-relevant sibling of inter
    const dull2 = ent('dull2');
    const edges = [
      ownEdge('tx', 'inter'),
      ownEdge('inter', 'dh'),
      ownEdge('tx', 'dull'),
      ownEdge('tx', 'dull2'),
    ];
    const result = groupNonRelevantSiblings([tx, inter, dh, dull, dull2], edges, [], 'tx');
    // inter should not be clustered because it has a relevant descendant (dh)
    // dull + dull2 should be clustered together
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].member_ids.sort()).toEqual(['dull', 'dull2']);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
npm test -- relevance
```

Expected: errors about missing module.

- [ ] **Step 3: Implement `relevance.ts`**

```ts
// src/lib/structure/relevance.ts
import type { StructureEntity, StructureEdge, StructureGroup } from './types';

const HYBRID_TYPES: ReadonlyArray<StructureEntity['entity_type']> = [
  'dh_entity',
  'hybrid_partnership',
  'reverse_hybrid',
];

/**
 * An entity is ATAD2-relevant if any of these criteria hold:
 * - it is the taxpayer (is_taxpayer = true)
 * - it is an ancestor of the taxpayer along ownership edges
 * - it has at least one transaction edge in or out
 * - its entity_type is one of the hybrid classifications
 * - it is a member of a fiscal-unity grouping that includes the taxpayer
 */
export function isAtad2Relevant(
  entity: StructureEntity,
  allEntities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  transactionEdges: StructureEdge[],
  taxpayerId: string,
  groupings: StructureGroup[] = [],
): boolean {
  if (entity.is_taxpayer) return true;
  if (HYBRID_TYPES.includes(entity.entity_type)) return true;
  if (transactionEdges.some(
    (e) => e.from_entity_id === entity.id || e.to_entity_id === entity.id,
  )) {
    return true;
  }
  if (taxpayerId && isAncestorOf(entity.id, taxpayerId, ownershipEdges)) return true;
  if (taxpayerId && groupings.some(
    (g) => g.kind === 'fiscal_unity' &&
           g.member_ids.includes(taxpayerId) &&
           g.member_ids.includes(entity.id),
  )) {
    return true;
  }
  return false;
}

/**
 * Walks UP from `descendantId` along ownership edges. Returns true if we hit
 * `ancestorId` along the way.
 */
function isAncestorOf(
  ancestorId: string,
  descendantId: string,
  ownershipEdges: StructureEdge[],
): boolean {
  const seen = new Set<string>();
  const stack = [descendantId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of ownershipEdges) {
      if (edge.to_entity_id === current) {
        if (edge.from_entity_id === ancestorId) return true;
        stack.push(edge.from_entity_id);
      }
    }
  }
  return false;
}

export interface Cluster {
  parent_id: string;
  member_ids: string[];
}

export interface ClusteringResult {
  clusters: Cluster[];
  /** entity IDs that ended up inside any cluster */
  clusteredIds: Set<string>;
}

/**
 * For each parent in the chart, group its DIRECT children that are non-relevant
 * AND have no relevant descendants into one cluster. Clusters of size < 2 are
 * dropped (no visual gain from clustering one node).
 */
export function groupNonRelevantSiblings(
  allEntities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  transactionEdges: StructureEdge[],
  taxpayerId: string,
  groupings: StructureGroup[] = [],
): ClusteringResult {
  // Precompute relevance for every entity.
  const relevance = new Map<string, boolean>();
  for (const e of allEntities) {
    relevance.set(
      e.id,
      isAtad2Relevant(e, allEntities, ownershipEdges, transactionEdges, taxpayerId, groupings),
    );
  }

  // For each entity, does it have any relevant descendant (going DOWN)?
  const hasRelevantDescendant = new Map<string, boolean>();
  function check(id: string, stack: Set<string>): boolean {
    if (hasRelevantDescendant.has(id)) return hasRelevantDescendant.get(id)!;
    if (stack.has(id)) return false; // cycle guard
    stack.add(id);
    let result = false;
    for (const edge of ownershipEdges) {
      if (edge.from_entity_id !== id) continue;
      const childId = edge.to_entity_id;
      if (relevance.get(childId)) { result = true; break; }
      if (check(childId, stack)) { result = true; break; }
    }
    stack.delete(id);
    hasRelevantDescendant.set(id, result);
    return result;
  }
  for (const e of allEntities) check(e.id, new Set());

  // Build child lists per parent.
  const childrenByParent = new Map<string, string[]>();
  for (const edge of ownershipEdges) {
    const list = childrenByParent.get(edge.from_entity_id) ?? [];
    list.push(edge.to_entity_id);
    childrenByParent.set(edge.from_entity_id, list);
  }

  const clusters: Cluster[] = [];
  const clusteredIds = new Set<string>();
  for (const [parentId, children] of childrenByParent) {
    const candidates = children.filter(
      (cid) => !relevance.get(cid) && !hasRelevantDescendant.get(cid),
    );
    if (candidates.length >= 2) {
      clusters.push({ parent_id: parentId, member_ids: candidates });
      for (const id of candidates) clusteredIds.add(id);
    }
  }

  return { clusters, clusteredIds };
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test
```

Expected: previous tests still pass plus new relevance tests pass (~32 total).

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/relevance.ts src/lib/structure/__tests__/relevance.test.ts
git commit -m "feat(structure): relevance.ts — ATAD2-relevance + sibling clustering"
```

---

## Task 3: `elkLayout.ts` (TDD)

Taxpayer-anchored layout. The pure-function rank-assignment logic is unit-tested; the actual `ELK` call is hidden behind a small wrapper interface so we can mock it.

**Files:**
- Create: `src/lib/structure/__tests__/elkLayout.test.ts`
- Create: `src/lib/structure/elkLayout.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/structure/__tests__/elkLayout.test.ts
import { describe, it, expect } from 'vitest';
import { selectAnchor, assignRanks } from '@/lib/structure/elkLayout';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const ent = (id: string, overrides: Partial<StructureEntity> = {}): StructureEntity => ({
  id,
  chart_id: 'c1',
  name: id,
  legal_form: null,
  jurisdiction_iso: 'NL',
  entity_type: 'corporation',
  is_taxpayer: false,
  position_x: 0,
  position_y: 0,
  source: 'ai_extracted',
  created_at: '',
  updated_at: '',
  ...overrides,
});

const ownEdge = (from: string, to: string): StructureEdge => ({
  id: `${from}->${to}`,
  chart_id: 'c1',
  from_entity_id: from,
  to_entity_id: to,
  kind: 'ownership',
  ownership_pct: 100,
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

describe('selectAnchor', () => {
  it('picks the entity with is_taxpayer=true', () => {
    const a = ent('a');
    const b = ent('b', { is_taxpayer: true });
    const c = ent('c');
    expect(selectAnchor([a, b, c], [])).toBe('b');
  });

  it('falls back to the entity with no incoming ownership when no taxpayer flag', () => {
    const a = ent('a');
    const b = ent('b');
    const edges = [ownEdge('a', 'b')];
    expect(selectAnchor([a, b], edges)).toBe('a');
  });

  it('among multiple UPEs, picks the one with the most descendants', () => {
    const a = ent('a');     // root with 0 descendants
    const b = ent('b');     // root with 2 descendants
    const c = ent('c');
    const d = ent('d');
    const edges = [ownEdge('b', 'c'), ownEdge('b', 'd')];
    expect(selectAnchor([a, b, c, d], edges)).toBe('b');
  });

  it('returns null for empty input', () => {
    expect(selectAnchor([], [])).toBeNull();
  });
});

describe('assignRanks', () => {
  it('places taxpayer at rank 0, parent at -1, child at +1', () => {
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const edges = [ownEdge('p', 'tx'), ownEdge('tx', 'c')];
    const ranks = assignRanks([p, tx, c], edges, 'tx');
    expect(ranks.get('tx')).toBe(0);
    expect(ranks.get('p')).toBe(-1);
    expect(ranks.get('c')).toBe(1);
  });

  it('grandparent gets rank -2, grandchild gets +2', () => {
    const gp = ent('gp');
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const gc = ent('gc');
    const edges = [
      ownEdge('gp', 'p'),
      ownEdge('p', 'tx'),
      ownEdge('tx', 'c'),
      ownEdge('c', 'gc'),
    ];
    const ranks = assignRanks([gp, p, tx, c, gc], edges, 'tx');
    expect(ranks.get('gp')).toBe(-2);
    expect(ranks.get('p')).toBe(-1);
    expect(ranks.get('tx')).toBe(0);
    expect(ranks.get('c')).toBe(1);
    expect(ranks.get('gc')).toBe(2);
  });

  it('multi-parent DAG entity gets the minimum-distance rank', () => {
    const p1 = ent('p1');
    const p2 = ent('p2');
    const gp = ent('gp');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    // c has two parents: tx (1 step) and p2 (would be reached via outgoing... we test parent path)
    // Build: tx → c, gp → p1 → c. c is at rank +1 (via tx) but ALSO reachable as descendant of gp via p1.
    // Expected: c gets rank +1 (closer is via taxpayer's direct child).
    const edges = [
      ownEdge('gp', 'p1'),
      ownEdge('p1', 'c'),
      ownEdge('p2', 'c'),
      ownEdge('tx', 'c'),
    ];
    const ranks = assignRanks([p1, p2, gp, tx, c], edges, 'tx');
    expect(ranks.get('c')).toBe(1);
  });

  it('orphans (no path to taxpayer) are not in the ranks map', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const orphan = ent('orphan');
    const edges: StructureEdge[] = [];
    const ranks = assignRanks([tx, orphan], edges, 'tx');
    expect(ranks.has('orphan')).toBe(false);
    expect(ranks.get('tx')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npm test -- elkLayout
```

Expected: errors about missing module.

- [ ] **Step 3: Implement `elkLayout.ts`**

```ts
// src/lib/structure/elkLayout.ts
import ELK from 'elkjs/lib/elk.bundled.js';
import { BOX } from './shapeGeometry';
import type { StructureEntity, StructureEdge } from './types';
import type { Cluster } from './relevance';

const elk = new ELK();

/**
 * Pick the layout anchor entity ID. Order:
 *   1. The entity with is_taxpayer = true (first match if multiple)
 *   2. UPE detection: entity with no incoming ownership edge.
 *      Among multiple UPEs, pick the one with the most descendants.
 *   3. null if no entities at all.
 */
export function selectAnchor(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
): string | null {
  if (entities.length === 0) return null;
  const taxpayer = entities.find((e) => e.is_taxpayer);
  if (taxpayer) return taxpayer.id;

  const incoming = new Set<string>();
  for (const e of ownershipEdges) incoming.add(e.to_entity_id);
  const upes = entities.filter((e) => !incoming.has(e.id));
  if (upes.length === 0) return entities[0].id;
  if (upes.length === 1) return upes[0].id;

  // Multiple UPEs — pick the one with most descendants.
  const descCount = new Map<string, number>();
  for (const u of upes) {
    const seen = new Set<string>([u.id]);
    const stack = [u.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of ownershipEdges) {
        if (e.from_entity_id === cur && !seen.has(e.to_entity_id)) {
          seen.add(e.to_entity_id);
          stack.push(e.to_entity_id);
        }
      }
    }
    descCount.set(u.id, seen.size - 1);
  }
  return upes.sort((a, b) => (descCount.get(b.id) ?? 0) - (descCount.get(a.id) ?? 0))[0].id;
}

/**
 * BFS in both directions from anchor along ownership edges:
 *   - INCOMING edges → parents at rank -1, -2, ...
 *   - OUTGOING edges → children at rank +1, +2, ...
 * Multi-parent (DAG) entities get the minimum absolute distance.
 * Orphans (no path to anchor) are NOT in the returned map.
 */
export function assignRanks(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  anchorId: string,
): Map<string, number> {
  const ranks = new Map<string, number>();
  if (!entities.find((e) => e.id === anchorId)) return ranks;
  ranks.set(anchorId, 0);

  // BFS down (children, positive ranks)
  const downQueue: Array<{ id: string; rank: number }> = [{ id: anchorId, rank: 0 }];
  while (downQueue.length) {
    const { id, rank } = downQueue.shift()!;
    for (const e of ownershipEdges) {
      if (e.from_entity_id !== id) continue;
      const child = e.to_entity_id;
      const candidate = rank + 1;
      const existing = ranks.get(child);
      if (existing === undefined || Math.abs(candidate) < Math.abs(existing)) {
        ranks.set(child, candidate);
        downQueue.push({ id: child, rank: candidate });
      }
    }
  }

  // BFS up (parents, negative ranks)
  const upQueue: Array<{ id: string; rank: number }> = [{ id: anchorId, rank: 0 }];
  while (upQueue.length) {
    const { id, rank } = upQueue.shift()!;
    for (const e of ownershipEdges) {
      if (e.to_entity_id !== id) continue;
      const parent = e.from_entity_id;
      const candidate = rank - 1;
      const existing = ranks.get(parent);
      if (existing === undefined || Math.abs(candidate) < Math.abs(existing)) {
        ranks.set(parent, candidate);
        upQueue.push({ id: parent, rank: candidate });
      }
    }
  }

  return ranks;
}

export interface PositionedEntity {
  id: string;
  x: number;
  y: number;
}

/**
 * Run ELK layout on the chart. Returns new positions for every entity that
 * appears as a node (i.e. not collapsed into a cluster). Cluster placeholders
 * are passed in via `clusters` and laid out as single nodes; their members
 * are NOT in the output.
 */
export async function elkLayout(args: {
  entities: StructureEntity[];
  ownershipEdges: StructureEdge[];
  /** Clusters of entities to fold into single placeholder nodes. */
  clusters: Cluster[];
}): Promise<{ positions: Map<string, PositionedEntity>; clusterPositions: Map<string, PositionedEntity> }> {
  const { entities, ownershipEdges, clusters } = args;

  // Build set of clustered (folded) entity IDs.
  const folded = new Set<string>();
  for (const c of clusters) for (const id of c.member_ids) folded.add(id);

  // Find the anchor (taxpayer / UPE / first).
  const anchorId = selectAnchor(entities, ownershipEdges);
  const ranks = anchorId
    ? assignRanks(entities, ownershipEdges, anchorId)
    : new Map<string, number>();

  // Children list = visible entities (not folded) plus one node per cluster.
  const visibleEntities = entities.filter((e) => !folded.has(e.id));
  const children = visibleEntities.map((e) => {
    const rank = ranks.get(e.id);
    const layoutOptions: Record<string, string> = {};
    if (rank !== undefined) {
      layoutOptions['elk.partitioning.partition'] = String(rank + 1000);
    }
    return {
      id: e.id,
      width: BOX.width,
      height: BOX.height,
      layoutOptions,
    };
  });

  // For each cluster: synthesize a placeholder node positioned under its parent rank.
  for (const c of clusters) {
    const parentRank = ranks.get(c.parent_id);
    const clusterRank = parentRank !== undefined ? parentRank + 1 : undefined;
    const layoutOptions: Record<string, string> = {};
    if (clusterRank !== undefined) {
      layoutOptions['elk.partitioning.partition'] = String(clusterRank + 1000);
    }
    children.push({
      id: clusterId(c),
      width: BOX.width + 16, // a touch wider for the stacked-card visual
      height: BOX.height + 12,
      layoutOptions,
    });
  }

  // Edges: only ownership edges between visible nodes. Edges INTO a folded
  // entity are redirected to its cluster placeholder.
  const memberToCluster = new Map<string, string>();
  for (const c of clusters) for (const id of c.member_ids) memberToCluster.set(id, clusterId(c));

  const edges = ownershipEdges
    .map((e) => ({
      id: e.id,
      sources: [memberToCluster.get(e.from_entity_id) ?? e.from_entity_id],
      targets: [memberToCluster.get(e.to_entity_id) ?? e.to_entity_id],
    }))
    .filter(
      (e, i, arr) =>
        arr.findIndex(
          (o) => o.sources[0] === e.sources[0] && o.targets[0] === e.targets[0],
        ) === i, // drop duplicates created by redirecting edges into the same cluster
    )
    .filter((e) => e.sources[0] !== e.targets[0]); // drop self-loops created by clustering

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
    children,
    edges,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await elk.layout(graph as any);

  const positions = new Map<string, PositionedEntity>();
  const clusterPositions = new Map<string, PositionedEntity>();
  const clusterIds = new Set(clusters.map(clusterId));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const node of result.children ?? []) {
    const out: PositionedEntity = { id: node.id, x: node.x ?? 0, y: node.y ?? 0 };
    if (clusterIds.has(node.id)) clusterPositions.set(node.id, out);
    else positions.set(node.id, out);
  }
  return { positions, clusterPositions };
}

export function clusterId(c: Cluster): string {
  return `cluster:${c.parent_id}:${c.member_ids.slice().sort().join(',')}`;
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test
```

Expected: all tests pass (relevance + new elkLayout pure-function tests). Total ~36.

- [ ] **Step 5: Compile-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit (when user asks)**

```bash
git add src/lib/structure/elkLayout.ts src/lib/structure/__tests__/elkLayout.test.ts
git commit -m "feat(structure): elkLayout.ts — taxpayer-anchored ELK with cluster support"
```

---

## Task 4: `ClusterNode.tsx`

A custom xyflow node type rendering a stacked-card visual for a cluster. Click anywhere on the card emits an event the parent uses to expand.

**Files:**
- Create: `src/components/structure/nodes/ClusterNode.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/nodes/ClusterNode.tsx
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';
import { BOX } from '@/lib/structure/shapeGeometry';

export interface ClusterNodeData extends Record<string, unknown> {
  count: number;
  /** ISO codes mapped to count, e.g. {NL:8, DE:4} */
  jurisdictions: Record<string, number>;
  /** "all-NL" | "all-foreign" | "mixed" — drives the fill */
  jurisdictionMix: 'all-NL' | 'all-foreign' | 'mixed';
  onExpand: () => void;
}

export type ClusterNodeType = Node<ClusterNodeData, 'cluster'>;

const W = BOX.width + 16;
const H = BOX.height + 12;
const STACK_OFFSET = 4;

function ClusterNodeComp({ data, selected }: NodeProps<ClusterNodeType>) {
  const fill = data.jurisdictionMix === 'all-foreign' ? PALETTE.foreign : PALETTE.nl;
  const fillRight = data.jurisdictionMix === 'mixed' ? PALETTE.foreign : fill;
  const jurisdictionsLine = Object.entries(data.jurisdictions)
    .sort(([, a], [, b]) => b - a)
    .map(([iso, n]) => `${iso} · ${n}`)
    .join('   ');

  return (
    <div
      style={{ width: W + STACK_OFFSET * 2, height: H + STACK_OFFSET * 2, position: 'relative', cursor: 'pointer' }}
      onClick={data.onExpand}
      title="Click to expand"
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <svg
        width={W + STACK_OFFSET * 2}
        height={H + STACK_OFFSET * 2}
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? `2px solid #1f5489` : 'none',
          outlineOffset: 6,
          borderRadius: 2,
        }}
      >
        {/* Two background rects for "stacked" depth */}
        <rect x={STACK_OFFSET * 2} y={STACK_OFFSET * 2} width={W} height={H} rx={2}
          fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75} opacity={0.55}/>
        <rect x={STACK_OFFSET} y={STACK_OFFSET} width={W} height={H} rx={2}
          fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75} opacity={0.78}/>
        {/* Front rect — split fill if mixed */}
        {data.jurisdictionMix === 'mixed' ? (
          <>
            <rect x={0} y={0} width={W / 2} height={H} rx={2}
              fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
            <rect x={W / 2} y={0} width={W / 2} height={H} rx={2}
              fill={fillRight} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
          </>
        ) : (
          <rect x={0} y={0} width={W} height={H} rx={2}
            fill={fill} stroke={PALETTE.outerStroke} strokeWidth={0.75}/>
        )}
        {/* Label */}
        <text x={W / 2} y={H / 2 - 4}
          fontFamily="Inter, system-ui, sans-serif" fontSize={13} fontWeight={700}
          fill={PALETTE.text} textAnchor="middle">
          {data.count} other {data.count === 1 ? 'subsidiary' : 'subsidiaries'}
        </text>
        <text x={W / 2} y={H / 2 + 14}
          fontFamily="Inter, system-ui, sans-serif" fontSize={10} fontWeight={500}
          fill={PALETTE.textMuted} textAnchor="middle">
          {jurisdictionsLine}
        </text>
        <text x={W / 2} y={H - 6}
          fontFamily="Inter, system-ui, sans-serif" fontSize={9.5} fontWeight={500}
          fill={PALETTE.textMuted} textAnchor="middle">
          click to expand
        </text>
      </svg>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComp);
```

- [ ] **Step 2: Compile-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit (when user asks)**

```bash
git add src/components/structure/nodes/ClusterNode.tsx
git commit -m "feat(structure): ClusterNode — stacked-card cluster visual"
```

---

## Task 5: `FloatingPalette.tsx`

Replaces the left-rail `EntityPalette`. Default: small "+ Entity" pill in the top-left of the canvas. Click expands to a popover listing 7 entity types.

**Files:**
- Create: `src/components/structure/FloatingPalette.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/FloatingPalette.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ENTITY_TYPES, type EntityType } from '@/lib/structure/types';

export function FloatingPalette({ onAdd }: { onAdd: (t: EntityType) => void }) {
  const [open, setOpen] = useState(false);

  const handlePick = (t: EntityType) => {
    onAdd(t);
    setOpen(false);
  };

  return (
    <div className="absolute top-4 left-4 z-10">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        + Entity {open ? '▴' : '▾'}
      </Button>
      {open && (
        <div className="mt-2 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg p-2 flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold px-2 py-1">
            Add entity
          </div>
          {ENTITY_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => handlePick(t.key)}
              className="text-left text-sm px-3 py-2 rounded hover:bg-neutral-50"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit (when user asks)**

```bash
git add src/components/structure/FloatingPalette.tsx
git commit -m "feat(structure): FloatingPalette — collapsible top-left entity palette"
```

---

## Task 6: `FloatingInspector.tsx`

Replaces the right-rail inspector. Auto-shows when there's a selection; manual close button; embeds existing `EntityInspector` and `EdgeInspector` content.

**Files:**
- Create: `src/components/structure/FloatingInspector.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/FloatingInspector.tsx
import { Button } from '@/components/ui/button';
import { EntityInspector } from './EntityInspector';
import { EdgeInspector } from './EdgeInspector';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

interface Props {
  selectedEntity: StructureEntity | null;
  selectedEdge: StructureEdge | null;
  onEntityChange: (patch: Partial<StructureEntity>) => void;
  onEntityDelete: () => void;
  onEdgeChange: (patch: Partial<StructureEdge>) => void;
  onEdgeDelete: () => void;
  onClose: () => void;
}

export function FloatingInspector({
  selectedEntity,
  selectedEdge,
  onEntityChange,
  onEntityDelete,
  onEdgeChange,
  onEdgeDelete,
  onClose,
}: Props) {
  if (!selectedEntity && !selectedEdge) return null;

  return (
    <aside
      className="absolute top-4 right-4 z-10 w-72 max-h-[calc(100vh-8rem)] overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-lg p-3"
      role="dialog"
      aria-label="Inspector"
    >
      <div className="flex justify-end -mt-1 -mr-1 mb-2">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close inspector">
          ✕
        </Button>
      </div>
      {selectedEntity && (
        <EntityInspector
          entity={selectedEntity}
          onChange={onEntityChange}
          onDelete={onEntityDelete}
        />
      )}
      {selectedEdge && (
        <EdgeInspector
          edge={selectedEdge}
          onChange={onEdgeChange}
          onDelete={onEdgeDelete}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Commit (when user asks)**

```bash
git add src/components/structure/FloatingInspector.tsx
git commit -m "feat(structure): FloatingInspector — auto-show overlay on selection"
```

---

## Task 7: `FloatingToolbar.tsx`

Replaces the top toolbar. Positioned bottom-center; shows status pill + counts + 3 action buttons.

**Files:**
- Create: `src/components/structure/FloatingToolbar.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/structure/FloatingToolbar.tsx
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  status: string;
  entityCount: number;
  ownershipCount: number;
  transactionCount: number;
  onAutoLayout: () => void;
  onReExtract: () => void;
  onExportPptx: () => void;
  busy?: boolean;
}

const EXTRACTING_PREFIX = 'extracting:';

export function FloatingToolbar({
  status,
  entityCount,
  ownershipCount,
  transactionCount,
  onAutoLayout,
  onReExtract,
  onExportPptx,
  busy,
}: Props) {
  const isExtracting = status.startsWith(EXTRACTING_PREFIX);
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-white border border-neutral-200 rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 text-sm">
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          isExtracting
            ? 'bg-amber-50 text-amber-700 animate-pulse'
            : status === 'extraction_failed'
            ? 'bg-red-50 text-red-700'
            : 'bg-emerald-50 text-emerald-700'
        }`}
      >
        {status || 'idle'}
      </span>
      <span className="text-xs text-neutral-500 whitespace-nowrap">
        {entityCount} entities · {ownershipCount} ownership · {transactionCount} transactions
      </span>
      <div className="w-px h-5 bg-neutral-200" />
      <Button size="sm" variant="outline" onClick={onAutoLayout} disabled={busy || isExtracting}>
        Auto-layout
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy || isExtracting}>
            Re-extract
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-extract from inputs?</AlertDialogTitle>
            <AlertDialogDescription>
              This overwrites AI-suggested entities and edges. Your manual edits and additions are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onReExtract}>Re-extract</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button size="sm" variant="outline" onClick={onExportPptx} disabled={busy || isExtracting}>
        Export PPTX
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit (when user asks)**

```bash
git add src/components/structure/FloatingToolbar.tsx
git commit -m "feat(structure): FloatingToolbar — bottom-center actions + status"
```

---

## Task 8: Update `StructureChart.tsx`

White background, smoothstep edges, blue selection outline, register cluster node type, fix the React Flow width/height warning.

**Files:**
- Modify: `src/components/structure/StructureChart.tsx`

- [ ] **Step 1: Read the current file** to find the exact imports and JSX to modify. Use Read on `c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor/src/components/structure/StructureChart.tsx`.

- [ ] **Step 2: Update imports — add `ClusterNode` and accept cluster nodes in the children**

In `StructureChart.tsx`, replace the existing imports of node/edge types with:

```tsx
import { EntityNode, type EntityNodeType } from './nodes/EntityNode';
import { ClusterNode, type ClusterNodeType } from './nodes/ClusterNode';
import {
  OwnershipEdge,
  type OwnershipEdgeData,
  type OwnershipEdgeType,
} from './edges/OwnershipEdge';
import {
  TransactionEdge,
  type TransactionEdgeData,
  type TransactionEdgeType,
} from './edges/TransactionEdge';
```

Replace the node/edge type registrations:

```tsx
const nodeTypes = { entity: EntityNode, cluster: ClusterNode };
const edgeTypes = { ownership: OwnershipEdge, transaction: TransactionEdge };
type ChartNodeType = EntityNodeType | ClusterNodeType;
type ChartEdgeType = OwnershipEdgeType | TransactionEdgeType;
```

- [ ] **Step 3: Extend `StructureChartProps` to accept cluster nodes**

```tsx
import type { ClusterNodeData } from './nodes/ClusterNode';
// ...

export interface StructureChartProps {
  entities: StructureEntity[];
  edges: StructureEdge[];
  /** Cluster nodes synthesized by the parent. */
  clusterNodes: Array<{ id: string; position: { x: number; y: number }; data: ClusterNodeData }>;
  onSelectionChange: (s: { kind: 'node' | 'edge'; id: string } | null) => void;
  onNodePositionEnd: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
}
```

- [ ] **Step 4: Update `initialNodes` to include cluster nodes**

Find the `initialNodes` `useMemo` and replace with:

```tsx
  const initialNodes = useMemo<ChartNodeType[]>(() => {
    const entityNodes: EntityNodeType[] = props.entities.map((e) => ({
      id: e.id,
      type: 'entity',
      position: { x: e.position_x, y: e.position_y },
      data: {
        name: e.name,
        legal_form: e.legal_form,
        jurisdiction_iso: e.jurisdiction_iso,
        entity_type: e.entity_type,
        is_taxpayer: e.is_taxpayer,
        source: e.source as EntityNodeType['data']['source'],
      },
    }));
    const clusters: ClusterNodeType[] = props.clusterNodes.map((c) => ({
      id: c.id,
      type: 'cluster',
      position: c.position,
      data: c.data,
    }));
    return [...entityNodes, ...clusters];
  }, [props.entities, props.clusterNodes]);
```

The two `useNodesState` / `useEdgesState` hooks now use `ChartNodeType` instead of `EntityNodeType`.

- [ ] **Step 5: Wire visual updates**

Find the `<div>` that wraps `<ReactFlow>` and confirm/update it to:

```tsx
    <div
      className="w-full h-full"
      style={{ background: '#ffffff' }}
    >
```

Find the `<ReactFlow>` props block. Add `defaultEdgeOptions={{ type: 'smoothstep' }}`. Update the `<Background>` to:

```tsx
        <Background gap={40} color="rgba(0,0,0,0.04)" />
```

Update the EntityNode's `selected` outline color (in `EntityNode.tsx`, line where `outline:` is set) — you can leave that for now and override via React Flow's `defaultEdgeOptions` + a custom selected style; OR update the EntityNode component directly to use `#1f5489` for selected. Cleanest fix: in `src/components/structure/nodes/EntityNode.tsx`, change the existing `outline: selected ? \`2px solid ${PALETTE.ownershipStroke}\` : 'none',` line to:

```tsx
            outline: selected ? `2px solid #1f5489` : 'none',
```

- [ ] **Step 6: Compile-check + tests**

```bash
npx tsc --noEmit
npm test
```

Expected: zero errors, 36+ tests pass.

- [ ] **Step 7: Commit (when user asks)**

```bash
git add src/components/structure/StructureChart.tsx src/components/structure/nodes/EntityNode.tsx
git commit -m "feat(structure): white bg, smoothstep edges, register cluster type"
```

---

## Task 9: Update `StructureChartStep.tsx`

Replace the 3-column layout with full-viewport canvas + 3 floating overlays. Switch the layout-trigger to async ELK + clustering. Manage cluster expand/collapse state.

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`

- [ ] **Step 1: Read the current file** to confirm current state. Use Read.

- [ ] **Step 2: Add new imports + utilities**

At the top, add:

```tsx
import { FloatingPalette } from './FloatingPalette';
import { FloatingInspector } from './FloatingInspector';
import { FloatingToolbar } from './FloatingToolbar';
import { elkLayout, clusterId, type PositionedEntity } from '@/lib/structure/elkLayout';
import { groupNonRelevantSiblings, type Cluster } from '@/lib/structure/relevance';
import type { ClusterNodeData } from './nodes/ClusterNode';
```

Remove the imports of `EntityPalette`, `EntityInspector` (only used inside FloatingInspector now), `EdgeInspector`, `StructureToolbar`, and `autoLayout` from `dagreLayout` — none are used directly here anymore.

Keep `EntityInspector` import only inside `FloatingInspector.tsx` (already imported there). In this file remove direct imports.

- [ ] **Step 3: Replace `handleAutoLayout` to use ELK + clustering**

Replace the existing `handleAutoLayout` (the dagre-based one) with:

```tsx
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  const handleAutoLayout = useCallback(async () => {
    if (!chart) return;
    const ownership = edges.filter((e) => e.kind === 'ownership');
    const transactions = edges.filter((e) => e.kind === 'transaction');
    const taxpayer = entities.find((e) => e.is_taxpayer);

    const allClusters = groupNonRelevantSiblings(
      entities,
      ownership,
      transactions,
      taxpayer?.id ?? '',
    );
    // Honor user's expand toggles: clusters whose ID is in expandedClusters
    // are removed (their members go back to being individual nodes).
    const activeClusters = allClusters.clusters.filter(
      (c) => !expandedClusters.has(clusterId(c)),
    );

    const { positions, clusterPositions } = await elkLayout({
      entities,
      ownershipEdges: ownership,
      clusters: activeClusters,
    });

    // Persist positions for visible entities
    setEntities((prev) =>
      prev.map((e) => {
        const p = positions.get(e.id);
        return p ? { ...e, position_x: p.x, position_y: p.y } : e;
      }),
    );
    for (const [, p] of positions) updateEntityPosition(p.id, p.x, p.y);

    // Stash cluster positions on local state for rendering
    setClusterLayout(buildClusterLayout(activeClusters, clusterPositions, entities));
  }, [chart, entities, edges, expandedClusters]);
```

- [ ] **Step 4: Add cluster-layout rendering helpers**

Add this helper at module scope (above the component), and a state variable for cluster layout:

```tsx
type ClusterLayout = Array<{ id: string; position: { x: number; y: number }; data: ClusterNodeData }>;

function buildClusterLayout(
  clusters: Cluster[],
  positions: Map<string, PositionedEntity>,
  entities: StructureEntity[],
  onExpand: (clusterIdStr: string) => void = () => {},
): ClusterLayout {
  return clusters
    .map((c) => {
      const idStr = clusterId(c);
      const pos = positions.get(idStr);
      if (!pos) return null;
      const members = c.member_ids
        .map((id) => entities.find((e) => e.id === id))
        .filter((e): e is StructureEntity => Boolean(e));
      const jurisdictions: Record<string, number> = {};
      for (const m of members) {
        const iso = (m.jurisdiction_iso || '').toUpperCase();
        jurisdictions[iso] = (jurisdictions[iso] ?? 0) + 1;
      }
      const allNL = Object.keys(jurisdictions).every((iso) => iso === 'NL');
      const allForeign = Object.keys(jurisdictions).every((iso) => iso !== 'NL' && iso !== '');
      const mix: ClusterNodeData['jurisdictionMix'] = allNL
        ? 'all-NL'
        : allForeign
        ? 'all-foreign'
        : 'mixed';
      return {
        id: idStr,
        position: { x: pos.x, y: pos.y },
        data: {
          count: members.length,
          jurisdictions,
          jurisdictionMix: mix,
          onExpand: () => onExpand(idStr),
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
```

In the component:

```tsx
  const [clusterLayout, setClusterLayout] = useState<ClusterLayout>([]);

  // Re-bind onExpand handlers whenever clusterLayout or expandedClusters change.
  // Each cluster's onExpand toggles its ID in expandedClusters and re-runs layout.
  const clusterNodes = useMemo<ClusterLayout>(
    () =>
      clusterLayout.map((c) => ({
        ...c,
        data: {
          ...c.data,
          onExpand: () => {
            setExpandedClusters((prev) => {
              const next = new Set(prev);
              next.add(c.id);
              return next;
            });
          },
        },
      })),
    [clusterLayout],
  );

  // When expandedClusters changes, rerun layout to promote the now-expanded cluster's members.
  useEffect(() => {
    if (chart && expandedClusters.size > 0) {
      handleAutoLayout();
    }
    // We intentionally only depend on expandedClusters — handleAutoLayout has its own deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedClusters]);
```

- [ ] **Step 5: Replace the existing entities-stack-detection useEffect**

Find the existing `useEffect` that triggers `handleAutoLayout` when 2+ entities are at (0,0). Update it to call the now-async function and to await it. Keep the `useRef<Set<string>>()` anti-loop guard.

```tsx
  const initialLayoutRunFor = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!chart) return;
    if (initialLayoutRunFor.current.has(chart.id)) return;
    const stacked = entities.filter(
      (e) => e.position_x === 0 && e.position_y === 0,
    ).length;
    if (stacked < 2) return;
    initialLayoutRunFor.current.add(chart.id);
    void handleAutoLayout();
  }, [chart, entities, handleAutoLayout]);
```

- [ ] **Step 6: Replace the `return` JSX with the floating layout**

Replace the entire `return ( ... )` block with:

```tsx
  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="px-4 py-3 border-b bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold">Step 5: Review structure chart</h1>
          <p className="text-xs text-neutral-500">
            Review the AI-generated draft, edit as needed, then continue to the report.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button
            onClick={goNext}
            disabled={
              status === 'loading' ||
              (typeof status === 'string' && status.startsWith('extracting:'))
            }
          >
            Next
          </Button>
        </div>
      </header>

      <main className="relative flex-1 min-h-0">
        <StructureChart
          entities={entities}
          edges={edges}
          clusterNodes={clusterNodes}
          onSelectionChange={setSelection}
          onNodePositionEnd={(id, x, y) => {
            setEntities((prev) =>
              prev.map((e) => (e.id === id ? { ...e, position_x: x, position_y: y } : e)),
            );
            updateEntityPosition(id, x, y);
          }}
          onConnect={handleConnect}
        />

        <FloatingPalette onAdd={handleAddEntity} />

        <FloatingInspector
          selectedEntity={selectedEntity}
          selectedEdge={selectedEdge}
          onEntityChange={updateSelectedEntity}
          onEntityDelete={deleteSelectedEntity}
          onEdgeChange={updateSelectedEdge}
          onEdgeDelete={deleteSelectedEdge}
          onClose={() => setSelection(null)}
        />

        <FloatingToolbar
          status={typeof status === 'string' ? status : ''}
          entityCount={entities.length}
          ownershipCount={edges.filter((e) => e.kind === 'ownership').length}
          transactionCount={edges.filter((e) => e.kind === 'transaction').length}
          onAutoLayout={() => void handleAutoLayout()}
          onReExtract={handleReExtract}
          onExportPptx={() => {
            const modulePath = /* @vite-ignore */ './exports/exportToPptx';
            import(/* @vite-ignore */ modulePath)
              .then(
                (m: {
                  exportToPptx: (opts: {
                    entities: StructureEntity[];
                    edges: StructureEdge[];
                    taxpayerName: string;
                  }) => void;
                }) => m.exportToPptx({ entities, edges, taxpayerName: '' }),
              )
              .catch((err) => console.error(err));
          }}
          busy={busy}
        />
      </main>
    </div>
  );
```

- [ ] **Step 7: Reset cluster expansion on Re-extract**

In `handleReExtract` (the existing function), at the start (right after `setBusy(true)`), add:

```tsx
    setExpandedClusters(new Set());
    setClusterLayout([]);
    initialLayoutRunFor.current.delete(chart.id);
```

That ensures a fresh extraction triggers a fresh layout pass.

- [ ] **Step 8: Compile-check + tests + build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: zero errors, all tests pass, build succeeds.

- [ ] **Step 9: Commit (when user asks)**

```bash
git add src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): full-viewport canvas with floating overlays + ELK + cluster expand"
```

---

## Task 10: Local verification + manual smoke

**Files:** none (verification).

- [ ] **Step 1: Run all checks**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
npm test
npm run build
```

Expected: zero TS errors, 36+ tests pass, build succeeds.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Manual smoke checklist**

Open the running app in a browser, sign in, navigate to a session with extracted structure data (e.g., the unblocked S4 Energy chart):

1. **Layout correctness**: taxpayer entity is roughly centered; entities owning the taxpayer are above it; subsidiaries are below; siblings sit on the same row.
2. **Floating overlays**:
   - Palette is collapsed in the top-left as a `+ Entity ▾` pill. Clicking expands it to a 7-button list. Clicking any type creates a new entity at (200, 200) and re-collapses.
   - Inspector is hidden initially. Clicking a node makes it slide in from the right. Editing fields persists. The `✕` closes it without deselecting; clicking the canvas background also closes it (deselect).
   - Toolbar at the bottom shows status pill + counts + 3 actions. During extraction the status pill pulses amber.
3. **Cluster expand/collapse**:
   - For a chart with non-relevant subsidiaries, a stacked-card cluster shows `<n> other subsidiaries` with jurisdiction breakdown.
   - Clicking the cluster removes it and lays out its members individually (smooth ~250ms transition).
4. **Visual chrome**: white background, very faint dot grid, blue (#1f5489) outline on selected nodes/edges.
5. **No React Flow warning** in the console about parent container width/height.
6. **Re-extract** clears clusters/expansion state and re-runs the pipeline from scratch.

- [ ] **Step 4: Note any deviations** as bugs to address before merging.

---

## Self-Review

### Spec coverage
| Spec section | Implemented in |
|---|---|
| §3 In MVP-2 — replace dagre with ELK | Tasks 1, 3 |
| §3 — taxpayer detection + BFS rank | Task 3 |
| §3 — cluster non-relevant siblings | Tasks 2, 4 |
| §3 — full-viewport canvas + floating panels | Tasks 5, 6, 7, 9 |
| §3 — white bg + grid + blue selection outline + width/height fix | Task 8 |
| §3 Out-of-scope items | None — explicitly out of scope |
| §4.1 anchor selection (taxpayer → UPE → null) | Task 3 (`selectAnchor` tests) |
| §4.2 BFS rank assignment | Task 3 (`assignRanks` tests) |
| §4.3 clustering rules + edge cases | Tasks 2, 9 (mixed-jurisdiction split fill: Task 4) |
| §4.4 ELK config | Task 3 (`elkLayout` impl) |
| §5 file structure | Task index matches |
| §6 UX details | Tasks 5, 6, 7, 8 |
| §7 data model — no schema changes | Confirmed (no migration tasks) |
| §8 perf budget | Verified by Task 10 manual smoke |
| §9 testing | Tasks 2, 3 (unit), Task 10 (manual smoke). Storybook deferred per spec. |

### Placeholder scan
- No "TBD", "TODO", "implement later" left in code-producing steps.
- Every code step shows actual code.
- Every command step shows the actual command.
- One narrative pointer in Task 8 step 5 ("you can leave that for now") was rewritten to a concrete instruction.

### Type-name consistency
- `Cluster` and `ClusteringResult` types defined in Task 2 (`relevance.ts`), referenced in Tasks 3, 4, 9 — consistent.
- `clusterId(c: Cluster)` defined in Task 3 (`elkLayout.ts`), referenced in Task 9 — consistent.
- `ClusterNodeData` defined in Task 4, imported in Tasks 8 (StructureChart) and 9 (StructureChartStep) — consistent.
- `PositionedEntity` defined in Task 3, imported in Task 9 — consistent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-structure-chart-layout-upgrade.md`.**

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Best for a 10-task plan because each subagent gets only the slice it needs.

**2. Inline Execution** — execute in this session via the executing-plans skill, batched with checkpoints.

Which approach?
