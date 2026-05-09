# Structure Chart Big4 Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the structure-chart's `elkjs`-based layout with a custom strict-tier layout that produces Big4-quality deliverables. Aggressive clustering of non-relevant subtrees, hidden orphans behind a banner, tier headers, individuals rendered with consistent visual weight, crisp step-edges.

**Architecture:** Drop `elkjs`. Add sync `tierLayout.ts` (BFS from taxpayer → ranks → strict horizontal rows). Update `relevance.ts` so clustering captures whole non-relevant subtrees. Run layout on every data change (no `(0,0)` gate); accept that user-drag positions don't persist across data changes (lock-layout toggle is a follow-up).

**Tech Stack:** Existing React + Vite + TS + Tailwind + `@xyflow/react` 12.10.2 + vitest. **Removed:** `elkjs`. **No new deps.**

**Spec:** [docs/superpowers/specs/2026-05-08-structure-chart-big4-redesign-design.md](../specs/2026-05-08-structure-chart-big4-redesign-design.md). Read it first.

**Project rules (CRITICAL):**
- **NEVER `git commit` or `git push`.** Commit steps below are preparation only — only run them when the user explicitly asks.
- **`main` is live production.**
- **All UI strings must be English.**

---

## File Structure

### New
```
src/lib/structure/tierLayout.ts                     // sync taxpayer-anchored tier layout
src/lib/structure/__tests__/tierLayout.test.ts      // pure-function tests
src/components/structure/TierHeaders.tsx            // left-margin tier labels
src/components/structure/DisconnectedBanner.tsx     // floating "+ N disconnected" pill+popover
```

### Modified
```
src/lib/structure/relevance.ts                      // aggressive subtree clustering
src/components/structure/nodes/EntityNode.tsx       // individuals get colored box
src/components/structure/StructureChart.tsx         // 'step' edges + fitView opts
src/components/structure/StructureChartStep.tsx     // sync tierLayout + render new components
package.json                                        // remove elkjs
```

### Deleted
```
src/lib/structure/elkLayout.ts                      // selectAnchor/assignRanks/clusterId move to tierLayout.ts
src/lib/structure/__tests__/elkLayout.test.ts       // tests for selectAnchor/assignRanks move to tierLayout.test.ts
```

---

## Task index

| # | Task | Phase |
|---|---|---|
| 1 | Update `relevance.ts` — aggressive subtree clustering (TDD) | Lib |
| 2 | Write `tierLayout.ts` (TDD) — moves selectAnchor/assignRanks/clusterId from elkLayout | Lib |
| 3 | Update `EntityNode.tsx` — individuals as colored box | Component |
| 4 | Write `TierHeaders.tsx` + `DisconnectedBanner.tsx` | Component |
| 5 | Update `StructureChart.tsx` — `'step'` edges + new fitView opts | Component |
| 6 | Update `StructureChartStep.tsx` — switch to sync tierLayout, render new components, drop (0,0) gate | Integration |
| 7 | Cleanup: delete `elkLayout.ts` + test, remove `elkjs` from package.json | Cleanup |
| 8 | Local verification + manual smoke | Verification |

---

## Task 1: Update `relevance.ts` — aggressive subtree clustering

`groupNonRelevantSiblings` currently puts only direct children into `member_ids`. Spec §5: cluster the **entire subtree** of each non-relevant child (count = total subtree size). Plus: skip iteration for any parent that's already inside a cluster (avoid double-clustering nested cases).

**Files:**
- Modify: `src/lib/structure/relevance.ts`
- Modify: `src/lib/structure/__tests__/relevance.test.ts`

- [ ] **Step 1: Add the new failing tests**

Open `src/lib/structure/__tests__/relevance.test.ts`. The existing test "clusters 2+ non-relevant siblings of the same parent" expects `member_ids` to be `['a','b','c']` (just direct children). With the new behavior the cluster's `member_ids` includes the entire subtree, so this assertion changes.

Replace the existing `describe('groupNonRelevantSiblings', ...)` block with:

```ts
describe('groupNonRelevantSiblings', () => {
  it('returns no clusters when fewer than 2 non-relevant siblings share a parent', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const sub = ent('sub');
    const edges = [ownEdge('tx', 'sub')];
    const result = groupNonRelevantSiblings([tx, sub], edges, [], 'tx');
    expect(result.clusters).toEqual([]);
  });

  it('clusters 2+ non-relevant siblings (no descendants)', () => {
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

  it('clusters non-relevant siblings AND their non-relevant descendants (whole subtree)', () => {
    const tx = ent('tx', { is_taxpayer: true });
    // tx has 2 non-relevant direct children (a, b), each with their own non-relevant grandchildren
    const a = ent('a');
    const b = ent('b');
    const a1 = ent('a1');
    const a2 = ent('a2');
    const b1 = ent('b1');
    const ownership = [
      ownEdge('tx', 'a'), ownEdge('tx', 'b'),
      ownEdge('a', 'a1'), ownEdge('a', 'a2'),
      ownEdge('b', 'b1'),
    ];
    const result = groupNonRelevantSiblings(
      [tx, a, b, a1, a2, b1], ownership, [], 'tx'
    );
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].member_ids.sort()).toEqual(['a', 'a1', 'a2', 'b', 'b1']);
    expect(result.clusteredIds.has('a1')).toBe(true);
    expect(result.clusteredIds.has('b1')).toBe(true);
  });

  it('keeps a non-relevant entity outside the cluster if it has any relevant descendant', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const inter = ent('inter');                       // non-relevant, but has dh descendant
    const dh = ent('dh', { entity_type: 'dh_entity' });
    const dull = ent('dull');
    const dull2 = ent('dull2');
    const edges = [
      ownEdge('tx', 'inter'),
      ownEdge('inter', 'dh'),
      ownEdge('tx', 'dull'),
      ownEdge('tx', 'dull2'),
    ];
    const result = groupNonRelevantSiblings([tx, inter, dh, dull, dull2], edges, [], 'tx');
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].member_ids.sort()).toEqual(['dull', 'dull2']);
  });

  it('does NOT double-cluster nested non-relevant subtrees', () => {
    // tx → a → (a1, a2) — all non-relevant.
    // Algorithm clusters [a, a1, a2] under tx. We should NOT also produce
    // a separate cluster of [a1, a2] under a.
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const a1 = ent('a1');
    const a2 = ent('a2');
    const sib = ent('sib');                           // gives tx a 2nd non-relevant subtree → triggers cluster
    const edges = [
      ownEdge('tx', 'a'), ownEdge('tx', 'sib'),
      ownEdge('a', 'a1'), ownEdge('a', 'a2'),
    ];
    const result = groupNonRelevantSiblings([tx, a, a1, a2, sib], edges, [], 'tx');
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].parent_id).toBe('tx');
    expect(result.clusters[0].member_ids.sort()).toEqual(['a', 'a1', 'a2', 'sib']);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npm test -- relevance
```

Expected: 2 tests fail (subtree expansion test + nested no-double-cluster test) — the others pass under the old code or were rewritten.

- [ ] **Step 3: Update `groupNonRelevantSiblings` in `relevance.ts`**

Open `src/lib/structure/relevance.ts`. Replace the body of `groupNonRelevantSiblings` (the `for (const [parentId, children] of childrenByParent)` block at the end) with:

```ts
  // Iterate parents and form clusters. We expand each candidate child into
  // its full non-relevant subtree (parent + all descendants), so the cluster's
  // member_ids represents the totality of what's collapsed. We also skip any
  // parent that is itself already inside a cluster, to prevent double-clustering
  // of nested non-relevant subtrees.
  const clusters: Cluster[] = [];
  const clusteredIds = new Set<string>();

  for (const [parentId, children] of childrenByParent) {
    if (clusteredIds.has(parentId)) continue;
    const candidates = children.filter(
      (cid) =>
        !relevance.get(cid) &&
        !hasRelevantDescendant.get(cid) &&
        !clusteredIds.has(cid),
    );
    if (candidates.length < 2) continue;

    // For each candidate, expand its entire subtree (BFS down ownership edges).
    const allMembers: string[] = [];
    for (const cid of candidates) {
      const seen = new Set<string>([cid]);
      const stack = [cid];
      while (stack.length) {
        const cur = stack.pop()!;
        allMembers.push(cur);
        for (const edge of ownershipEdges) {
          if (edge.from_entity_id === cur && !seen.has(edge.to_entity_id)) {
            seen.add(edge.to_entity_id);
            stack.push(edge.to_entity_id);
          }
        }
      }
    }
    clusters.push({ parent_id: parentId, member_ids: allMembers });
    for (const id of allMembers) clusteredIds.add(id);
  }

  return { clusters, clusteredIds };
}
```

(The previous version of this block — also titled "Build child lists per parent" / "for (const [parentId, children] of childrenByParent)" — gets replaced. Keep everything ABOVE this block, including the `relevance` map, `hasRelevantDescendant` map, and `childrenByParent` map. Only the cluster-formation loop changes.)

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test
```

Expected: all tests pass (relevance tests now reflect the aggressive clustering).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit (when user asks)**

```bash
git add src/lib/structure/relevance.ts src/lib/structure/__tests__/relevance.test.ts
git commit -m "feat(structure): aggressive subtree clustering"
```

---

## Task 2: Write `tierLayout.ts` (TDD)

`selectAnchor` and `assignRanks` are reused verbatim from `elkLayout.ts`. The new code is `tierLayout()` itself: takes entities + ownership edges + clusters + expanded-clusters set, returns positions in strict horizontal rows.

**Files:**
- Create: `src/lib/structure/tierLayout.ts`
- Create: `src/lib/structure/__tests__/tierLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/structure/__tests__/tierLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectAnchor, assignRanks, tierLayout, clusterId } from '@/lib/structure/tierLayout';
import type { Cluster } from '@/lib/structure/relevance';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const ent = (id: string, overrides: Partial<StructureEntity> = {}): StructureEntity => ({
  id, chart_id: 'c1', name: id, legal_form: null, jurisdiction_iso: 'NL',
  entity_type: 'corporation', is_taxpayer: false,
  position_x: 0, position_y: 0, source: 'ai_extracted',
  created_at: '', updated_at: '', ...overrides,
});

const ownEdge = (from: string, to: string): StructureEdge => ({
  id: `${from}->${to}`, chart_id: 'c1',
  from_entity_id: from, to_entity_id: to, kind: 'ownership',
  ownership_pct: 100, ownership_voting_only: null,
  transaction_type: null, amount_eur: null, is_mismatch: false,
  mismatch_classification: null, mismatch_atad2_article: null,
  label: null, source: 'ai_extracted', created_at: '', updated_at: '',
});

describe('selectAnchor (moved from elkLayout)', () => {
  it('picks the entity with is_taxpayer=true', () => {
    const a = ent('a');
    const b = ent('b', { is_taxpayer: true });
    expect(selectAnchor([a, b], [])).toBe('b');
  });

  it('falls back to UPE when no taxpayer flag', () => {
    const a = ent('a');
    const b = ent('b');
    expect(selectAnchor([a, b], [ownEdge('a', 'b')])).toBe('a');
  });

  it('returns null for empty input', () => {
    expect(selectAnchor([], [])).toBeNull();
  });
});

describe('assignRanks (moved from elkLayout)', () => {
  it('places taxpayer at rank 0, parent at -1, child at +1', () => {
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const ranks = assignRanks([p, tx, c], [ownEdge('p', 'tx'), ownEdge('tx', 'c')], 'tx');
    expect(ranks.get('tx')).toBe(0);
    expect(ranks.get('p')).toBe(-1);
    expect(ranks.get('c')).toBe(1);
  });

  it('orphans (no path to taxpayer) are not in the ranks map', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const orphan = ent('orphan');
    const ranks = assignRanks([tx, orphan], [], 'tx');
    expect(ranks.has('orphan')).toBe(false);
  });
});

describe('tierLayout', () => {
  it('places taxpayer at (0,0); parent above; child below', () => {
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [p, tx, c],
      ownershipEdges: [ownEdge('p', 'tx'), ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('tx')).toEqual({ id: 'tx', x: 0, y: 160 });
    expect(result.positions.get('p')!.y).toBe(0);
    expect(result.positions.get('c')!.y).toBe(320);
  });

  it('orphans land in the orphans array, not in positions', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const orphan = ent('orphan');
    const result = tierLayout({
      entities: [tx, orphan],
      ownershipEdges: [],
      clusters: [],
    });
    expect(result.positions.has('orphan')).toBe(false);
    expect(result.orphans.map((e) => e.id)).toEqual(['orphan']);
  });

  it('siblings within a tier are spread evenly and centered around X=0', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const c1 = ent('c1');
    const c2 = ent('c2');
    const c3 = ent('c3');
    const result = tierLayout({
      entities: [tx, c1, c2, c3],
      ownershipEdges: [ownEdge('tx', 'c1'), ownEdge('tx', 'c2'), ownEdge('tx', 'c3')],
      clusters: [],
    });
    const xs = ['c1', 'c2', 'c3'].map((id) => result.positions.get(id)!.x).sort((a, b) => a - b);
    // Expected: -180, 0, 180  (HORIZ_SEP=180)
    expect(xs[0]).toBe(-180);
    expect(xs[1]).toBe(0);
    expect(xs[2]).toBe(180);
  });

  it('a single entity in a tier sits at X=0', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [tx, c],
      ownershipEdges: [ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.positions.get('c')!.x).toBe(0);
  });

  it('cluster placeholders are positioned at parent.rank + 1', () => {
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const b = ent('b');
    const cluster: Cluster = { parent_id: 'tx', member_ids: ['a', 'b'] };
    const result = tierLayout({
      entities: [tx, a, b],
      ownershipEdges: [ownEdge('tx', 'a'), ownEdge('tx', 'b')],
      clusters: [cluster],
    });
    const cId = clusterId(cluster);
    // Cluster sits at rank +1 (Y=320) since taxpayer is at rank 0 (Y=160) and minRank=-? wait, minRank=0 (no parents).
    // With minRank=0: tx at Y=0; cluster at Y=160.
    expect(result.clusterPositions.get(cId)!.y).toBe(160);
    // Members are NOT in positions (they're folded into the cluster).
    expect(result.positions.has('a')).toBe(false);
    expect(result.positions.has('b')).toBe(false);
  });

  it('returns ranksRendered ascending, including only ranks that have at least one node or cluster', () => {
    const p = ent('p');
    const tx = ent('tx', { is_taxpayer: true });
    const c = ent('c');
    const result = tierLayout({
      entities: [p, tx, c],
      ownershipEdges: [ownEdge('p', 'tx'), ownEdge('tx', 'c')],
      clusters: [],
    });
    expect(result.ranksRendered).toEqual([-1, 0, 1]);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npm test -- tierLayout
```

Expected: errors about missing module.

- [ ] **Step 3: Implement `tierLayout.ts`**

Create `src/lib/structure/tierLayout.ts`:

```ts
import type { StructureEntity, StructureEdge } from './types';
import type { Cluster } from './relevance';

export const VERT_SEP = 160;
export const HORIZ_SEP = 180;

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

export function assignRanks(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  anchorId: string,
): Map<string, number> {
  const ranks = new Map<string, number>();
  if (!entities.find((e) => e.id === anchorId)) return ranks;
  ranks.set(anchorId, 0);

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

export function clusterId(c: Cluster): string {
  return `cluster:${c.parent_id}:${c.member_ids.slice().sort().join(',')}`;
}

export interface PositionedEntity {
  id: string;
  x: number;
  y: number;
}

export interface TierLayoutResult {
  positions: Map<string, PositionedEntity>;
  clusterPositions: Map<string, PositionedEntity>;
  ranks: Map<string, number>;
  ranksRendered: number[];
  orphans: StructureEntity[];
}

/**
 * Strict-tier layout. Sync, deterministic. See spec §4.
 */
export function tierLayout(args: {
  entities: StructureEntity[];
  ownershipEdges: StructureEdge[];
  clusters: Cluster[];
}): TierLayoutResult {
  const { entities, ownershipEdges, clusters } = args;

  const positions = new Map<string, PositionedEntity>();
  const clusterPositions = new Map<string, PositionedEntity>();
  const orphans: StructureEntity[] = [];

  const anchorId = selectAnchor(entities, ownershipEdges);
  if (!anchorId) {
    return { positions, clusterPositions, ranks: new Map(), ranksRendered: [], orphans: [...entities] };
  }
  const ranks = assignRanks(entities, ownershipEdges, anchorId);

  // Folded entity ids (members of a cluster — not laid out individually).
  const folded = new Set<string>();
  for (const c of clusters) for (const id of c.member_ids) folded.add(id);

  // Group entities + clusters by rank.
  type Slot =
    | { kind: 'entity'; entity: StructureEntity }
    | { kind: 'cluster'; cluster: Cluster };
  const slotsByRank = new Map<number, Slot[]>();

  for (const e of entities) {
    if (folded.has(e.id)) continue;
    const r = ranks.get(e.id);
    if (r === undefined) {
      orphans.push(e);
      continue;
    }
    const list = slotsByRank.get(r) ?? [];
    list.push({ kind: 'entity', entity: e });
    slotsByRank.set(r, list);
  }
  for (const c of clusters) {
    const parentRank = ranks.get(c.parent_id);
    if (parentRank === undefined) continue; // parent unreachable → skip cluster
    const r = parentRank + 1;
    const list = slotsByRank.get(r) ?? [];
    list.push({ kind: 'cluster', cluster: c });
    slotsByRank.set(r, list);
  }

  // Sort slots within each rank.
  function slotName(s: Slot): string {
    return s.kind === 'entity' ? s.entity.name : `~cluster:${s.cluster.parent_id}`;
  }
  function slotIso(s: Slot): string {
    if (s.kind === 'cluster') return ''; // clusters sort to end
    return (s.entity.jurisdiction_iso || '').toUpperCase();
  }
  for (const list of slotsByRank.values()) {
    list.sort((a, b) => {
      // 1. taxpayer always first within rank
      const aIsTx = a.kind === 'entity' && a.entity.is_taxpayer;
      const bIsTx = b.kind === 'entity' && b.entity.is_taxpayer;
      if (aIsTx !== bIsTx) return aIsTx ? -1 : 1;
      // 2. clusters sort last
      if (a.kind !== b.kind) return a.kind === 'cluster' ? 1 : -1;
      // 3. NL before foreign (within entities)
      if (a.kind === 'entity' && b.kind === 'entity') {
        const aNl = slotIso(a) === 'NL';
        const bNl = slotIso(b) === 'NL';
        if (aNl !== bNl) return aNl ? -1 : 1;
      }
      // 4. alphabetical by name
      return slotName(a).localeCompare(slotName(b));
    });
  }

  // Compute Y per rank (rank=anchor→Y=0 doesn't quite work; use minRank).
  const ranksRendered = Array.from(slotsByRank.keys()).sort((a, b) => a - b);
  const minRank = ranksRendered.length > 0 ? ranksRendered[0] : 0;

  for (const rank of ranksRendered) {
    const list = slotsByRank.get(rank)!;
    const slots = list.length;
    const y = (rank - minRank) * VERT_SEP;
    list.forEach((slot, i) => {
      const x = (i - (slots - 1) / 2) * HORIZ_SEP;
      if (slot.kind === 'entity') {
        positions.set(slot.entity.id, { id: slot.entity.id, x, y });
      } else {
        const id = clusterId(slot.cluster);
        clusterPositions.set(id, { id, x, y });
      }
    });
  }

  return { positions, clusterPositions, ranks, ranksRendered, orphans };
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test
```

Expected: all tests pass (relevance + tierLayout + previous suite).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit (when user asks)**

```bash
git add src/lib/structure/tierLayout.ts src/lib/structure/__tests__/tierLayout.test.ts
git commit -m "feat(structure): tierLayout — sync taxpayer-anchored strict-tier layout"
```

---

## Task 3: `EntityNode.tsx` — individuals as colored box

Spec §6.3: individuals get a `100×60px` dark grey box with stick figure inside; name + jurisdiction below the box (same vertical placement as corp boxes for visual rhythm). Currently they render as a bare stick figure with name floating below.

**Files:**
- Modify: `src/components/structure/nodes/EntityNode.tsx`

- [ ] **Step 1: Read current file** (see what's already there)

```bash
sed -n '1,140p' src/components/structure/nodes/EntityNode.tsx
```

There's a special branch for `entity_type === 'individual'` that renders a stick figure SVG without an outer rect, and renders name as an HTML `<div>` below the SVG. We replace that branch with a unified box-based rendering.

- [ ] **Step 2: Replace the individual branch**

In `EntityNode.tsx`, find the SVG block where the `geom.outer.kind === 'individual'` case is rendered (a `<g>` containing the head circle and the trapezoid silhouette) and the HTML `<div>` block below the SVG that renders the individual's name+jurisdiction.

Replace BOTH (the SVG `'individual'` branch AND the HTML below-the-svg block) with this single SVG-rendering logic that draws a colored box with the figure inside, plus name+jurisdiction below the box just like other types:

The relevant change inside the SVG: when `geom.outer.kind === 'individual'`, render a filled rect (using `PALETTE.individual` as fill) plus the stick figure on top of it (centered inside the rect). The label rendering OUTSIDE the SVG branch stays disabled for individuals (the `!isIndividual` guard around the corp-style label group). Add the same labels INSIDE the SVG for individuals.

Concretely: replace the `geom.outer.kind === 'individual'` case in the outer-shape switch with:

```tsx
        {geom.outer.kind === 'individual' && (
          <g>
            {/* Colored box like other entity types — gives visual weight + grid feel */}
            <rect
              width={BOX.width}
              height={BOX.height}
              rx={2}
              fill={PALETTE.individual}
              stroke={PALETTE.outerStroke}
              strokeWidth={0.75}
            />
            {/* Stick figure inside the box, white on dark */}
            <circle
              cx={BOX.width / 2}
              cy={18}
              r={6}
              fill="rgba(255,255,255,0.92)"
            />
            <polygon
              points={`${BOX.width / 2 - 12},${BOX.height - 8} ${BOX.width / 2 - 8},${BOX.height - 36} ${BOX.width / 2 + 8},${BOX.height - 36} ${BOX.width / 2 + 12},${BOX.height - 8}`}
              fill="rgba(255,255,255,0.92)"
            />
          </g>
        )}
```

Also: change the `!isIndividual && (` guard around the existing label-group `<text>`/`<text>` (the lines that render `data.name`, optional `data.legal_form`, and `data.jurisdiction_iso`). Remove that guard entirely so individuals get the same labels as corps.

Then: remove the HTML `<div>` block below the SVG that renders the individual's name+jurisdiction (it's no longer needed — labels are now inside the SVG, same as corps).

The result: individuals render as a 130×80 dark-grey rounded rect with a small stick figure at the top, and `name` / `(NL)` (or whatever jurisdiction) inside the box just like corps and partnerships.

- [ ] **Step 3: Type-check + tests**

```bash
npx tsc --noEmit
npm test
```

Expected: zero errors, all tests still pass.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/nodes/EntityNode.tsx
git commit -m "feat(structure): individuals render as colored box for grid consistency"
```

---

## Task 4: `TierHeaders.tsx` + `DisconnectedBanner.tsx`

Two small UI overlays. Bundle into one task since they're both ~30-line components.

**Files:**
- Create: `src/components/structure/TierHeaders.tsx`
- Create: `src/components/structure/DisconnectedBanner.tsx`

- [ ] **Step 1: Implement `TierHeaders.tsx`**

```tsx
// src/components/structure/TierHeaders.tsx
import { useReactFlow } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { VERT_SEP } from '@/lib/structure/tierLayout';

interface Props {
  /** Sorted ascending. e.g. [-2, -1, 0, 1, 2] */
  ranks: number[];
  /** Whether any entity in the chart is an individual UBO (controls the "UBO" label). */
  hasUbo?: boolean;
}

function labelFor(rank: number, minRank: number, maxRank: number, hasUbo: boolean): string {
  if (rank === 0) return 'Taxpayer';
  if (rank === 1) return 'Direct subs';
  if (rank > 1) return `Tier +${rank}`;
  if (rank === -1) return 'Parents';
  if (rank === minRank && hasUbo && rank <= -2) return 'UBO';
  if (rank === minRank) return 'UPE';
  return `Tier ${rank}`;
}

export function TierHeaders({ ranks, hasUbo = false }: Props) {
  // Translate world-Y (the rank's y in chart coordinates) into screen-Y via
  // useReactFlow's flowToScreenPosition.
  const flow = useReactFlow();
  const [tick, setTick] = useState(0); // re-render on viewport changes

  useEffect(() => {
    const handle = () => setTick((t) => t + 1);
    window.addEventListener('resize', handle);
    // ReactFlow doesn't expose a native 'viewport-change' event for hooks;
    // we re-render on raf-throttle when nodes change via parent prop, plus on resize.
    return () => window.removeEventListener('resize', handle);
  }, []);

  if (ranks.length === 0) return null;
  const minRank = ranks[0];
  const maxRank = ranks[ranks.length - 1];

  return (
    <div className="absolute left-0 top-0 z-10 pointer-events-none w-32" style={{ paddingLeft: 12 }}>
      {ranks.map((r) => {
        const worldY = (r - minRank) * VERT_SEP;
        const screen = flow.flowToScreenPosition({ x: 0, y: worldY });
        // Suppress unused-variable warning for tick; we re-render on resize.
        void tick;
        return (
          <div
            key={r}
            className="text-[10px] uppercase tracking-[0.06em] font-semibold text-neutral-400 absolute"
            style={{ top: screen.y, left: 0 }}
          >
            {labelFor(r, minRank, maxRank, hasUbo)}
          </div>
        );
      })}
    </div>
  );
}
```

> **Note**: `flowToScreenPosition` projects chart-coordinates to viewport-coordinates so the headers track pan/zoom. Re-render is forced via `tick`+`resize`; for true viewport-change tracking, `requestAnimationFrame` polling can be added in v2.

- [ ] **Step 2: Implement `DisconnectedBanner.tsx`**

```tsx
// src/components/structure/DisconnectedBanner.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { StructureEntity } from '@/lib/structure/types';

interface Props {
  orphans: StructureEntity[];
}

export function DisconnectedBanner({ orphans }: Props) {
  const [open, setOpen] = useState(false);
  if (orphans.length === 0) return null;

  return (
    <div className="absolute bottom-4 right-4 z-10">
      {open && (
        <div className="mb-2 w-72 max-h-64 overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
          <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-neutral-500 mb-2">
            Disconnected entities
          </div>
          <p className="text-xs text-neutral-500 mb-2">
            These entities have no ownership path to the taxpayer. They are extracted but not visible
            in the main chart. Use the inspector to link them, or accept them as out of scope.
          </p>
          <ul className="space-y-1.5">
            {orphans.map((e) => (
              <li key={e.id} className="text-xs flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="font-medium">{e.name}</span>{' '}
                  <span className="text-neutral-400">({e.jurisdiction_iso})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        + {orphans.length} disconnected {open ? '▴' : '▾'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/TierHeaders.tsx src/components/structure/DisconnectedBanner.tsx
git commit -m "feat(structure): TierHeaders + DisconnectedBanner overlays"
```

---

## Task 5: `StructureChart.tsx` — `'step'` edges + new fitView opts

**Files:**
- Modify: `src/components/structure/StructureChart.tsx`

- [ ] **Step 1: Update edge type**

In `StructureChart.tsx`, find the `<ReactFlow>` JSX. Change:

```tsx
defaultEdgeOptions={{ type: 'smoothstep' }}
```

to:

```tsx
defaultEdgeOptions={{ type: 'step' }}
```

- [ ] **Step 2: Update fitView options**

In the same file, find the `useEffect` that calls `reactFlow.fitView(...)` (the position-signature-based viewport refit). Change the call from:

```tsx
reactFlow.fitView({ padding: 0.15, duration: 250 }),
```

to:

```tsx
reactFlow.fitView({ padding: 0.08, minZoom: 0.4, maxZoom: 1.0, duration: 250 }),
```

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: zero errors, build succeeds.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/StructureChart.tsx
git commit -m "feat(structure): step edges + tighter fitView opts"
```

---

## Task 6: `StructureChartStep.tsx` — switch to sync `tierLayout`, render new components, drop (0,0) gate

The biggest change. Switch `handleAutoLayout` from async ELK to sync `tierLayout`. Drop the `initialLayoutRunFor` (0,0) gate — layout runs on every data change. Render `<TierHeaders>` and `<DisconnectedBanner>` inside the canvas region.

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`

- [ ] **Step 1: Update imports**

Replace the `elkLayout` and `relevance` imports near the top:

```tsx
import { tierLayout, clusterId, type PositionedEntity } from '@/lib/structure/tierLayout';
import { groupNonRelevantSiblings, type Cluster } from '@/lib/structure/relevance';
import { TierHeaders } from './TierHeaders';
import { DisconnectedBanner } from './DisconnectedBanner';
```

(Remove the existing `elkLayout` import line if any.)

Also add these to the existing imports if they're not already there:

```tsx
// useState/useEffect/useCallback/useMemo/useRef are already imported in this file
```

- [ ] **Step 2: Add new state for orphans + ranks**

Inside the component, near the other state hooks:

```tsx
  const [orphans, setOrphans] = useState<StructureEntity[]>([]);
  const [ranksRendered, setRanksRendered] = useState<number[]>([]);
```

- [ ] **Step 3: Replace `handleAutoLayout` with sync version**

Replace the existing async `handleAutoLayout` `useCallback` block with:

```tsx
  const handleAutoLayout = useCallback(() => {
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
    const activeClusters = allClusters.clusters.filter(
      (c) => !expandedClusters.has(clusterId(c)),
    );

    const result = tierLayout({
      entities,
      ownershipEdges: ownership,
      clusters: activeClusters,
    });

    setEntities((prev) =>
      prev.map((e) => {
        const p = result.positions.get(e.id);
        return p ? { ...e, position_x: p.x, position_y: p.y } : e;
      }),
    );
    // We do NOT persist positions to the DB anymore — layout always recomputes from data.

    setClusterLayout(buildClusterLayout(activeClusters, result.clusterPositions, entities));
    setOrphans(result.orphans);
    setRanksRendered(result.ranksRendered);
  }, [chart, entities, edges, expandedClusters]);
```

- [ ] **Step 4: Drop the `(0,0)` gate; always re-layout on data change**

Replace the existing `useEffect` that uses `initialLayoutRunFor` to gate layout-on-stack-detection. Remove the `initialLayoutRunFor` `useRef` declaration entirely. Replace the gate effect with:

```tsx
  // Re-run layout whenever entities or edges change, OR when expanded-clusters
  // change. Sync, deterministic, fast (<5ms for 200 entities).
  useEffect(() => {
    if (!chart) return;
    if (entities.length === 0) return;
    handleAutoLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart?.id, entities.length, edges.length, expandedClusters]);
```

(The exhaustive-deps disable is intentional — `handleAutoLayout` rebinds on each render via its own deps; we only want layout to run when the actually-changed values listed change.)

- [ ] **Step 5: Drop `initialLayoutRunFor` cleanup in `handleReExtract`**

Find the existing `handleReExtract` function. Remove the line `initialLayoutRunFor.current.delete(chart.id);`. Keep the other resets (`setExpandedClusters(new Set())`, `setClusterLayout([])`).

- [ ] **Step 6: Render new components in JSX**

Find the `<main className="relative flex-1 min-h-0">` block. Right after `<StructureChart ... />` (still as a sibling inside `<main>`), add:

```tsx
        <TierHeaders
          ranks={ranksRendered}
          hasUbo={entities.some((e) => e.entity_type === 'individual')}
        />

        <DisconnectedBanner orphans={orphans} />
```

(They're absolute-positioned within `<main>` — `<main>` has `position: relative` already.)

- [ ] **Step 7: Type-check + tests + build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: zero errors, all tests pass, build succeeds.

- [ ] **Step 8: Commit (when user asks)**

```bash
git add src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): sync tierLayout + tier headers + disconnected banner"
```

---

## Task 7: Cleanup — delete `elkLayout` files, remove `elkjs` dep

Now that nothing imports `elkLayout`, we can delete its files and drop the dependency.

**Files:**
- Delete: `src/lib/structure/elkLayout.ts`
- Delete: `src/lib/structure/__tests__/elkLayout.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -r "from '@/lib/structure/elkLayout'" src/ || echo "no imports found"
grep -r "from '../elkLayout'" src/ || echo "no relative imports"
```

Expected: only matches in `src/lib/structure/elkLayout.ts` itself (or none). No references from anywhere else.

- [ ] **Step 2: Delete files**

```bash
rm src/lib/structure/elkLayout.ts
rm src/lib/structure/__tests__/elkLayout.test.ts
```

- [ ] **Step 3: Remove `elkjs` from `package.json`**

```bash
npm uninstall elkjs
```

This updates `package.json` and `package-lock.json`.

- [ ] **Step 4: Type-check + tests + build**

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: zero errors, tests pass (count drops by ~8 since elkLayout tests are gone, but the moved `selectAnchor`/`assignRanks` tests in `tierLayout.test.ts` cover the same logic), build succeeds, `AssessmentStructure` chunk drops by ~370 kB.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/elkLayout.ts src/lib/structure/__tests__/elkLayout.test.ts package.json package-lock.json
git commit -m "chore(structure): drop elkjs — replaced by sync tierLayout"
```

(Note: the `git add` of the deleted files records their deletion in the commit.)

---

## Task 8: Local verification + manual smoke

**Files:** none (verification).

- [ ] **Step 1: Final all-green check**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx tsc --noEmit
npm test
npm run build
```

Expected: zero errors, all tests pass, build succeeds, `AssessmentStructure` chunk noticeably smaller than before.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Manual smoke checklist** (after frontend deploy / locally)

Open the app in a browser, navigate to the existing S4 Energy session's structure-chart step:

1. **Layout is strict-tier**: taxpayer (S4 Energy B.V.) is roughly centered. Direct subsidiaries are in one horizontal row directly below. If there are parents (UPE / holdings), they form a row directly above. Each rank is at a fixed Y; no horizontal drift.
2. **Tier headers**: small uppercase labels at the left margin (`Parents`, `Taxpayer`, `Direct subs`, `Tier +2`, etc.) align with each row.
3. **Aggressive clustering**: many of the operating subsidiaries are folded into a single stacked-card cluster ("N other subsidiaries (NL · X, US · Y)"). The cluster shows a count that's noticeably larger than the previous "8" — likely 20-40 depending on the dataset.
4. **Click cluster**: it expands inline; member entities are promoted to individual nodes; layout re-runs smoothly; cluster card disappears.
5. **Disconnected banner**: bottom-right shows "+ N disconnected ▾" if any extracted entity has no ownership path to the taxpayer. Click opens a small popover listing them.
6. **Step edges**: connections between nodes are crisp 90° bends (not curved).
7. **Individuals**: any UBO renders as a dark-grey box with a small stick figure inside, name + jurisdiction below — same visual rhythm as corp boxes (no more bare floating stick figure).
8. **Viewport fit**: chart sits centered with comfortable whitespace (~8% padding); not zoomed too far in or out.
9. **No `[React Flow]: parent container needs a width and a height` warning** in the console.
10. **Re-extract**: triggers a fresh layout pass; clusters rebuild; orphans recompute.

- [ ] **Step 4: Note any deviations as bugs**

If the chart still looks wrong, capture a screenshot and document specifically what doesn't match the spec — that becomes the next round.

---

## Self-Review

### Spec coverage

| Spec section | Implemented in |
|---|---|
| §3 In MVP-3: drop elkjs | Task 7 |
| §3 In MVP-3: custom tierLayout | Task 2 |
| §3 In MVP-3: layout on every data change | Task 6 (step 4 — drop (0,0) gate) |
| §3 In MVP-3: aggressive clustering | Task 1 |
| §3 In MVP-3: hide orphans + banner | Tasks 4 (banner), 6 (state wiring) |
| §3 In MVP-3: tier headers | Tasks 4 (component), 6 (rendering) |
| §3 In MVP-3: individuals as colored box | Task 3 |
| §3 In MVP-3: 'step' edges | Task 5 |
| §3 In MVP-3: fitView opts (0.08, 0.4, 1.0) | Task 5 |
| §3 Out-of-scope items | Acknowledged, no tasks (correct) |
| §4 Layout algorithm | Task 2 (tierLayout impl + tests) |
| §5 Aggressive clustering rules | Task 1 |
| §6 Visual chrome | Tasks 3, 4, 5 |
| §7 Files | Whole plan structure matches |
| §8 Tests | Tasks 1 (relevance updates), 2 (tierLayout tests) |

### Placeholder scan
- No "TBD", "TODO", "implement later", "fill in details" left.
- Every code step shows actual code.
- Every command step shows the actual command + expected output.

### Type-name consistency
- `Cluster` (from `relevance.ts`), `clusterId` (now in `tierLayout.ts`, moved from `elkLayout`), `PositionedEntity` (in `tierLayout.ts`), `TierLayoutResult` — all consistent across tasks.
- `selectAnchor`, `assignRanks` signatures unchanged (just relocated from `elkLayout.ts` to `tierLayout.ts`).
- `tierLayout()` is sync (`Map`, not `Promise`). Confirmed in Task 2 impl and Task 6 caller.
- Constants `VERT_SEP=160`, `HORIZ_SEP=180` defined in `tierLayout.ts`, imported in `TierHeaders.tsx` (Task 4) for screen-Y projection.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-08-structure-chart-big4-redesign.md`.**

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Good for an 8-task plan where each touches a small, focused area.

**2. Inline Execution** — execute in this session via the executing-plans skill, batched with checkpoints.

Which approach?
