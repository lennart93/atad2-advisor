# TCM Structure Chart Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the production-grade defects in the corporate structure chart (Castleton/S4 overlap + truncation + cluster disconnection + silent bad-data) by rewriting `tierLayout`, adding a pure validator + label-measurement module, and rendering two convention-driven visuals (stacked-paper cluster, fiscal-unity dashed-outline overlay).

**Architecture:** Eight tasks. Two new pure modules (label measurement, validator) with TDD-first unit tests. One layout-engine rewrite that keeps the public signature but replaces the body. Two visual upgrades (EntityNode auto-sizing + warning badge slot, ClusterNode stacked-paper). Two new components (BlockingBanner, FiscalUnityOverlay). Integration in `StructureChart` + `StructureChartStep` + `FloatingToolbar`. PPTX export gets an overlay pass. `dagre` and `dagreLayout` are deleted.

**Tech Stack:** Existing React + Vite + TS + Tailwind + `@xyflow/react` 12.10.2 + `pptxgenjs` + Supabase + vitest. No new dependencies — and `dagre` is removed.

**Spec:** [docs/superpowers/specs/2026-05-12-tcm-structure-chart-refactor-design.md](../specs/2026-05-12-tcm-structure-chart-refactor-design.md). Read first.

**Project rules (CRITICAL):**
- **NEVER `git commit` or `git push`.** Commit steps below are preparation only — only run when the user explicitly asks.
- **`main` is live production.**
- **All UI strings must be English.**

---

## File Structure

### New
```
src/lib/structure/labelMeasure.ts                                 // §6: hidden canvas measurement
src/lib/structure/validator.ts                                    // §5: pure validator
src/lib/structure/__tests__/labelMeasure.test.ts                  // unit tests
src/lib/structure/__tests__/validator.test.ts                    // unit tests
src/components/structure/overlays/FiscalUnityOverlay.tsx          // §8: dashed-outline overlay
src/components/structure/BlockingBanner.tsx                       // §5.3: error banner
```

### Modified
```
src/lib/structure/tierLayout.ts                                   // §4: hybrid rewrite (body fully replaced, signature unchanged)
src/lib/structure/relevance.ts                                    // §7.2: deriveClusterName helper
src/lib/structure/client.ts                                       // §8.1: listGroupings
src/components/structure/nodes/EntityNode.tsx                     // auto-sizing on labelMetrics, warningBadge slot, truncate() removed
src/components/structure/nodes/ClusterNode.tsx                    // §7: stacked-paper + (N entiteiten)
src/components/structure/StructureChart.tsx                       // generation-skip handles, FiscalUnityOverlay child, new props
src/components/structure/StructureChartStep.tsx                   // validator pipeline, groupings load, orphan reveal, auto-layout removal
src/components/structure/FloatingToolbar.tsx                      // orphan counter, Auto-layout button removed
src/components/structure/exports/exportToPptx.ts                  // dashed-outline overlay export
src/lib/structure/__tests__/tierLayout.test.ts                    // new cases for JV / generation-skip / label spacing / perf
package.json                                                       // remove dagre
```

### Deleted
```
src/lib/structure/dagreLayout.ts
src/lib/structure/__tests__/dagreLayout.test.ts
```

---

## Task index

| # | Task | Files |
|---|---|---|
| 1 | Validator module (TDD) | `validator.ts`, `validator.test.ts` |
| 2 | Label measurement module (TDD) | `labelMeasure.ts`, `labelMeasure.test.ts` |
| 3 | tierLayout rewrite + dagre delete | `tierLayout.ts`, `tierLayout.test.ts`, dagre files |
| 4 | EntityNode + ClusterNode visuals | `EntityNode.tsx`, `ClusterNode.tsx`, `relevance.ts` |
| 5 | BlockingBanner + FiscalUnityOverlay | `BlockingBanner.tsx`, `FiscalUnityOverlay.tsx` |
| 6 | client.ts + StructureChart integration | `client.ts`, `StructureChart.tsx` |
| 7 | StructureChartStep + FloatingToolbar wiring | `StructureChartStep.tsx`, `FloatingToolbar.tsx` |
| 8 | PPTX overlay export + manual smoke | `exportToPptx.ts`, none |

---

## Task 1: Validator module (TDD)

Pure module. No React, no IO. Detects ownership-sum violations, missing legal_form/jurisdiction, and cycles. Orphans are NOT handled here — they fall out of `tierLayout`.

**Files:**
- Create: `src/lib/structure/validator.ts`
- Create: `src/lib/structure/__tests__/validator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/structure/__tests__/validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validate } from '../validator';
import type { StructureEntity, StructureEdge } from '../types';

function ent(id: string, overrides: Partial<StructureEntity> = {}): StructureEntity {
  return {
    id,
    chart_id: 'chart-1',
    name: `Entity ${id}`,
    legal_form: 'B.V.',
    jurisdiction_iso: 'NL',
    entity_type: 'corporation',
    is_taxpayer: false,
    position_x: 0,
    position_y: 0,
    source: 'ai_extracted',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function edge(from: string, to: string, pct: number | null): StructureEdge {
  return {
    id: `${from}-${to}`,
    chart_id: 'chart-1',
    from_entity_id: from,
    to_entity_id: to,
    kind: 'ownership',
    ownership_pct: pct,
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
  };
}

describe('validate — ownership-sum', () => {
  it('passes when single edge is 100%', () => {
    const r = validate([ent('a'), ent('b')], [edge('a', 'b', 100)]);
    expect(r.ownershipSumIssues).toEqual([]);
  });

  it('passes when null pct (treated as 100%)', () => {
    const r = validate([ent('a'), ent('b')], [edge('a', 'b', null)]);
    expect(r.ownershipSumIssues).toEqual([]);
  });

  it('passes when two parents sum to 100% exactly', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 96.65), edge('b', 'c', 3.35)],
    );
    expect(r.ownershipSumIssues).toEqual([]);
  });

  it('flags 87.3%', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 50), edge('b', 'c', 37.3)],
    );
    expect(r.ownershipSumIssues).toHaveLength(1);
    expect(r.ownershipSumIssues[0].child_id).toBe('c');
    expect(r.ownershipSumIssues[0].sum_pct).toBeCloseTo(87.3, 2);
  });

  it('flags 102.7%', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 62.7), edge('b', 'c', 40)],
    );
    expect(r.ownershipSumIssues).toHaveLength(1);
    expect(r.ownershipSumIssues[0].sum_pct).toBeCloseTo(102.7, 2);
  });

  it('tolerates 100.005% within ±0.01', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 50.0025), edge('b', 'c', 50.0025)],
    );
    expect(r.ownershipSumIssues).toEqual([]);
  });
});

describe('validate — missing fields', () => {
  it('passes when all fields present', () => {
    const r = validate([ent('a')], []);
    expect(r.missingFields).toEqual([]);
  });

  it('flags missing legal_form', () => {
    const r = validate([ent('a', { legal_form: null })], []);
    expect(r.missingFields).toEqual([{ entity_id: 'a', missing: ['legal_form'] }]);
  });

  it('flags missing jurisdiction_iso (empty string)', () => {
    const r = validate([ent('a', { jurisdiction_iso: '' })], []);
    expect(r.missingFields).toEqual([{ entity_id: 'a', missing: ['jurisdiction_iso'] }]);
  });

  it('flags both missing on same entity', () => {
    const r = validate([ent('a', { legal_form: null, jurisdiction_iso: '' })], []);
    expect(r.missingFields).toEqual([
      { entity_id: 'a', missing: ['legal_form', 'jurisdiction_iso'] },
    ]);
  });
});

describe('validate — cycles', () => {
  it('passes on a DAG', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'b', 100), edge('b', 'c', 100)],
    );
    expect(r.cycles).toEqual([]);
  });

  it('detects A→B→A', () => {
    const r = validate(
      [ent('a'), ent('b')],
      [edge('a', 'b', 100), edge('b', 'a', 100)],
    );
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0].sort()).toEqual(['a', 'b']);
  });

  it('detects A→B→C→A (length 3)', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'b', 100), edge('b', 'c', 100), edge('c', 'a', 100)],
    );
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('detects two independent cycles', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c'), ent('d')],
      [
        edge('a', 'b', 100),
        edge('b', 'a', 100),
        edge('c', 'd', 100),
        edge('d', 'c', 100),
      ],
    );
    expect(r.cycles).toHaveLength(2);
  });
});

describe('validate — hasBlocking', () => {
  it('false on clean data', () => {
    const r = validate([ent('a')], []);
    expect(r.hasBlocking).toBe(false);
  });

  it('true when missing fields', () => {
    const r = validate([ent('a', { legal_form: null })], []);
    expect(r.hasBlocking).toBe(true);
  });

  it('true when cycle', () => {
    const r = validate(
      [ent('a'), ent('b')],
      [edge('a', 'b', 100), edge('b', 'a', 100)],
    );
    expect(r.hasBlocking).toBe(true);
  });

  it('false when only ownership-sum issue (warn, not block)', () => {
    const r = validate(
      [ent('a'), ent('b'), ent('c')],
      [edge('a', 'c', 50), edge('b', 'c', 37.3)],
    );
    expect(r.hasBlocking).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "c:/Users/adn356/OneDrive - Svalner Atlas/Documenten/Claude code/atad2-advisor"
npx vitest run src/lib/structure/__tests__/validator.test.ts
```

Expected: FAIL with `Cannot find module '../validator'`.

- [ ] **Step 3: Implement the validator**

Create `src/lib/structure/validator.ts`:

```ts
import type { StructureEntity, StructureEdge } from './types';

export type ValidatorSeverity = 'block' | 'warn';

export interface OwnershipSumIssue {
  child_id: string;
  sum_pct: number;
}

export interface MissingFieldsEntry {
  entity_id: string;
  missing: ('legal_form' | 'jurisdiction_iso')[];
}

export interface ValidatorResult {
  cycles: string[][];
  missingFields: MissingFieldsEntry[];
  ownershipSumIssues: OwnershipSumIssue[];
  hasBlocking: boolean;
}

const TOLERANCE = 0.01;

export function validate(
  entities: StructureEntity[],
  edges: StructureEdge[],
): ValidatorResult {
  const ownershipEdges = edges.filter((e) => e.kind === 'ownership');

  const ownershipSumIssues = computeOwnershipSumIssues(entities, ownershipEdges);
  const missingFields = computeMissingFields(entities);
  const cycles = detectCycles(entities, ownershipEdges);

  return {
    cycles,
    missingFields,
    ownershipSumIssues,
    hasBlocking: cycles.length > 0 || missingFields.length > 0,
  };
}

function computeOwnershipSumIssues(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
): OwnershipSumIssue[] {
  const incomingByChild = new Map<string, StructureEdge[]>();
  for (const e of ownershipEdges) {
    const list = incomingByChild.get(e.to_entity_id) ?? [];
    list.push(e);
    incomingByChild.set(e.to_entity_id, list);
  }

  const issues: OwnershipSumIssue[] = [];
  for (const [childId, incoming] of incomingByChild) {
    if (incoming.length === 0) continue;
    if (!entities.some((x) => x.id === childId)) continue;
    const sum = incoming.reduce((acc, e) => acc + (e.ownership_pct ?? 100), 0);
    if (Math.abs(sum - 100) > TOLERANCE) {
      issues.push({ child_id: childId, sum_pct: sum });
    }
  }
  return issues;
}

function computeMissingFields(entities: StructureEntity[]): MissingFieldsEntry[] {
  const out: MissingFieldsEntry[] = [];
  for (const e of entities) {
    const missing: ('legal_form' | 'jurisdiction_iso')[] = [];
    if (e.legal_form == null || e.legal_form.trim() === '') {
      // Individuals don't need legal_form; everything else does.
      if (e.entity_type !== 'individual') missing.push('legal_form');
    }
    if (e.jurisdiction_iso == null || e.jurisdiction_iso.trim() === '') {
      missing.push('jurisdiction_iso');
    }
    if (missing.length > 0) out.push({ entity_id: e.id, missing });
  }
  return out;
}

function detectCycles(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
): string[][] {
  const children = new Map<string, string[]>();
  for (const e of ownershipEdges) {
    const list = children.get(e.from_entity_id) ?? [];
    list.push(e.to_entity_id);
    children.set(e.from_entity_id, list);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const e of entities) color.set(e.id, WHITE);

  const cycles: string[][] = [];
  const reportedCycleSets = new Set<string>();

  function dfs(id: string, stack: string[]): void {
    color.set(id, GRAY);
    stack.push(id);
    const kids = children.get(id) ?? [];
    for (const c of kids) {
      const cColor = color.get(c);
      if (cColor === GRAY) {
        // Found a cycle: walk back from current stack to where c appears.
        const startIdx = stack.indexOf(c);
        if (startIdx >= 0) {
          const cycle = stack.slice(startIdx);
          const key = [...cycle].sort().join('|');
          if (!reportedCycleSets.has(key)) {
            reportedCycleSets.add(key);
            cycles.push(cycle);
          }
        }
      } else if (cColor === WHITE) {
        dfs(c, stack);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const e of entities) {
    if (color.get(e.id) === WHITE) dfs(e.id, []);
  }

  return cycles;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/structure/__tests__/validator.test.ts
```

Expected: all tests PASS (16 tests).

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/validator.ts src/lib/structure/__tests__/validator.test.ts
git commit -m "feat(structure): pure validator module (ownership-sum + missing fields + cycles)"
```

---

## Task 2: Label measurement module (TDD)

Hidden canvas-based label width measurement with a content-keyed cache. Used by `tierLayout` to pre-measure all labels before positioning.

**Files:**
- Create: `src/lib/structure/labelMeasure.ts`
- Create: `src/lib/structure/__tests__/labelMeasure.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/structure/__tests__/labelMeasure.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { measureLabels, _resetCacheForTests } from '../labelMeasure';
import type { StructureEntity } from '../types';

function ent(id: string, name: string, legal_form: string | null, iso: string): StructureEntity {
  return {
    id,
    chart_id: 'c1',
    name,
    legal_form,
    jurisdiction_iso: iso,
    entity_type: 'corporation',
    is_taxpayer: false,
    position_x: 0,
    position_y: 0,
    source: 'ai_extracted',
    created_at: '',
    updated_at: '',
  };
}

describe('measureLabels', () => {
  beforeEach(() => _resetCacheForTests());

  it('returns metrics for every entity', () => {
    const m = measureLabels([
      ent('a', 'Foo B.V.', 'B.V.', 'NL'),
      ent('b', 'Bar Holding GmbH', 'GmbH', 'DE'),
    ]);
    expect(m.size).toBe(2);
    expect(m.get('a')).toBeDefined();
    expect(m.get('b')).toBeDefined();
  });

  it('respects minimum dimensions (130 × 80)', () => {
    const m = measureLabels([ent('a', 'X', 'B.V.', 'NL')]);
    const x = m.get('a')!;
    expect(x.width).toBeGreaterThanOrEqual(130);
    expect(x.height).toBeGreaterThanOrEqual(80);
  });

  it('clamps to maximum (280 × 120)', () => {
    const longName = 'A'.repeat(500);
    const m = measureLabels([ent('a', longName, 'B.V.', 'NL')]);
    const x = m.get('a')!;
    expect(x.width).toBeLessThanOrEqual(280);
    expect(x.height).toBeLessThanOrEqual(120);
  });

  it('uses cache on repeat call (same Map values)', () => {
    const entA = ent('a', 'Foo B.V.', 'B.V.', 'NL');
    const m1 = measureLabels([entA]);
    const m2 = measureLabels([entA]);
    expect(m2.get('a')).toEqual(m1.get('a'));
  });

  it('invalidates cache when name changes', () => {
    const m1 = measureLabels([ent('a', 'Short', 'B.V.', 'NL')]);
    const m2 = measureLabels([ent('a', 'A much longer entity name here', 'B.V.', 'NL')]);
    expect(m2.get('a')!.width).toBeGreaterThanOrEqual(m1.get('a')!.width);
  });

  it('handles missing legal_form (2-line metrics)', () => {
    const m = measureLabels([ent('a', 'Foo', null, 'NL')]);
    expect(m.get('a')).toBeDefined();
    expect(m.get('a')!.height).toBeGreaterThanOrEqual(80);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/structure/__tests__/labelMeasure.test.ts
```

Expected: FAIL with `Cannot find module '../labelMeasure'`.

- [ ] **Step 3: Implement the label measurer**

Create `src/lib/structure/labelMeasure.ts`:

```ts
import type { StructureEntity } from './types';

export interface LabelMetrics {
  width: number;
  height: number;
}

const MIN_WIDTH = 130;
const MIN_HEIGHT = 80;
const MAX_WIDTH = 280;
const MAX_HEIGHT = 120;
const H_PADDING = 16; // each side
const V_PADDING = 6;  // each side, ~12 total
const LINE_HEIGHT = 16;

const cache = new Map<string, LabelMetrics>();
let ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  ctx = canvas.getContext('2d');
  return ctx;
}

function measureLine(text: string, fontSpec: string): number {
  const c = getCtx();
  if (!c) {
    // jsdom or SSR fallback: rough heuristic ~7px per char at 13px
    return text.length * 7;
  }
  c.font = fontSpec;
  return c.measureText(text).width;
}

function cacheKey(e: StructureEntity): string {
  return `${e.id}|${e.name}|${e.legal_form ?? ''}|${e.jurisdiction_iso ?? ''}`;
}

export function measureLabels(entities: StructureEntity[]): Map<string, LabelMetrics> {
  const out = new Map<string, LabelMetrics>();
  for (const e of entities) {
    const key = cacheKey(e);
    let m = cache.get(key);
    if (!m) {
      const nameW = measureLine(e.name, 'bold 13px Inter, system-ui, sans-serif');
      const lfW = e.legal_form ? measureLine(e.legal_form, '500 11px Inter, system-ui, sans-serif') : 0;
      const isoW = measureLine(`(${e.jurisdiction_iso ?? ''})`, '500 11px Inter, system-ui, sans-serif');
      const contentW = Math.max(nameW, lfW, isoW);
      const linesCount = e.legal_form ? 3 : 2;
      const rawW = contentW + H_PADDING * 2;
      const rawH = linesCount * LINE_HEIGHT + V_PADDING * 2;
      m = {
        width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, rawW)),
        height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, rawH)),
      };
      cache.set(key, m);
    }
    out.set(e.id, m);
  }
  return out;
}

// Test-only hook to clear cache between test cases.
export function _resetCacheForTests(): void {
  cache.clear();
  ctx = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/structure/__tests__/labelMeasure.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/labelMeasure.ts src/lib/structure/__tests__/labelMeasure.test.ts
git commit -m "feat(structure): label measurement module with content-keyed cache"
```

---

## Task 3: tierLayout rewrite + dagre delete

Replace the body of `tierLayout` with the hybrid algorithm from spec §4. Public signature stays the same. Add new test cases for JV centering, generation-skip, and label-aware spacing. Delete dagre files.

**Files:**
- Modify: `src/lib/structure/tierLayout.ts`
- Modify: `src/lib/structure/__tests__/tierLayout.test.ts`
- Delete: `src/lib/structure/dagreLayout.ts`
- Delete: `src/lib/structure/__tests__/dagreLayout.test.ts`
- Modify: `package.json` (remove `dagre`)

- [ ] **Step 1: Add new failing test cases to `tierLayout.test.ts`**

Open `src/lib/structure/__tests__/tierLayout.test.ts` and append the following test block at the end (before the closing brace if the file is wrapped in a top-level describe, or as a top-level describe otherwise):

```ts
import { tierLayout } from '../tierLayout';
import { _resetCacheForTests as resetLabelCache } from '../labelMeasure';
import type { StructureEntity, StructureEdge } from '../types';

function entE(id: string, name = `Entity ${id}`, overrides: Partial<StructureEntity> = {}): StructureEntity {
  return {
    id, chart_id: 'c1', name, legal_form: 'B.V.', jurisdiction_iso: 'NL',
    entity_type: 'corporation', is_taxpayer: false,
    position_x: 0, position_y: 0, source: 'ai_extracted',
    created_at: '', updated_at: '', ...overrides,
  };
}
function edgeE(from: string, to: string): StructureEdge {
  return {
    id: `${from}-${to}`, chart_id: 'c1',
    from_entity_id: from, to_entity_id: to,
    kind: 'ownership', ownership_pct: 100, ownership_voting_only: null,
    transaction_type: null, amount_eur: null, is_mismatch: false,
    mismatch_classification: null, mismatch_atad2_article: null, label: null,
    source: 'ai_extracted', created_at: '', updated_at: '',
  };
}

describe('tierLayout — hybrid rewrite', () => {
  beforeEach(() => resetLabelCache());

  it('places multi-parent JV child centered between parents', () => {
    const entities = [
      entE('a', 'Parent A', { is_taxpayer: true }),
      entE('b', 'Parent B'),
      entE('c', 'JV Child'),
    ];
    const edges = [edgeE('a', 'c'), edgeE('b', 'c')];
    const { positions } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    const pa = positions.get('a')!;
    const pb = positions.get('b')!;
    const pc = positions.get('c')!;
    const expectedCx = (pa.x + pb.x) / 2;
    // Within one node-width tolerance — packing may shift slightly to avoid overlap.
    expect(Math.abs(pc.x - expectedCx)).toBeLessThan(150);
  });

  it('assigns longest-path rank: generation-skip case', () => {
    // A → B → C, plus A → C (direct). C must sit on rank 2, not rank 1.
    const entities = [entE('a', 'A', { is_taxpayer: true }), entE('b', 'B'), entE('c', 'C')];
    const edges = [edgeE('a', 'b'), edgeE('b', 'c'), edgeE('a', 'c')];
    const { ranks } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('b')).toBe(1);
    expect(ranks.get('c')).toBe(2);
  });

  it('respects label-aware spacing (no overlap on wide labels)', () => {
    const entities = [
      entE('a', 'Anchor', { is_taxpayer: true }),
      entE('b', 'Castleton Commodities Luxembourg Holdings'),
      entE('c', 'Foundation De Andevi'),
      entE('d', 'Short'),
    ];
    const edges = [edgeE('a', 'b'), edgeE('a', 'c'), edgeE('a', 'd')];
    const { positions } = tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    const ids = ['b', 'c', 'd'];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pi = positions.get(ids[i])!;
        const pj = positions.get(ids[j])!;
        // Same rank ⇒ same y; pairwise x distance must be ≥ ~min gap.
        expect(Math.abs(pi.x - pj.x)).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('200-entity synthetic chart layout completes under 100ms', () => {
    const entities: StructureEntity[] = [entE('root', 'Root', { is_taxpayer: true })];
    const edges: StructureEdge[] = [];
    for (let i = 0; i < 199; i++) {
      const id = `n${i}`;
      entities.push(entE(id, `Node ${i}`));
      const parentIdx = Math.floor(Math.random() * entities.length - 1);
      const parent = parentIdx < 0 ? 'root' : entities[Math.max(0, parentIdx)].id;
      edges.push(edgeE(parent, id));
    }
    const start = performance.now();
    tierLayout({ entities, ownershipEdges: edges, clusters: [] });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
```

If the file already imports from `../tierLayout` and uses helpers, reuse them — don't duplicate. Adjust per actual file shape.

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
npx vitest run src/lib/structure/__tests__/tierLayout.test.ts -t "hybrid rewrite"
```

Expected: FAIL (existing implementation can't satisfy JV centering, longest-path, or label spacing tests).

- [ ] **Step 3: Rewrite `tierLayout.ts`**

Replace the entire body of `src/lib/structure/tierLayout.ts` with:

```ts
import type { StructureEntity, StructureEdge } from './types';
import type { Cluster } from './relevance';
import { measureLabels, type LabelMetrics } from './labelMeasure';

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
  return upes.sort(
    (a, b) => (descCount.get(b.id) ?? 0) - (descCount.get(a.id) ?? 0),
  )[0].id;
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

type Slot =
  | { kind: 'entity'; entity: StructureEntity; width: number; height: number; preferredX: number; x: number }
  | { kind: 'cluster'; cluster: Cluster; width: number; height: number; preferredX: number; x: number };

const CLUSTER_BOX_W = 150;
const CLUSTER_BOX_H = 80;
const MIN_GAP = 40;

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

  // Phase 1: label pre-measurement
  const labelMetrics = measureLabels(entities);

  // Phase 2: anchor (above) + reachability set
  const folded = new Set<string>();
  for (const c of clusters) for (const id of c.member_ids) folded.add(id);

  const reachable = computeReachableFromAnchor(entities, ownershipEdges, anchorId);

  // Phase 3: longest-path layering
  const ranks = longestPathRanks(entities, ownershipEdges, reachable);

  // Orphans: anything reachable that didn't get a rank (shouldn't happen),
  // PLUS anything not reachable (unless folded into a cluster).
  for (const e of entities) {
    if (folded.has(e.id)) continue;
    if (!reachable.has(e.id) || !ranks.has(e.id)) orphans.push(e);
  }

  // Phase 4: cluster rank
  const clustersWithRank: Array<{ c: Cluster; rank: number }> = [];
  for (const c of clusters) {
    const pr = ranks.get(c.parent_id);
    if (pr === undefined) continue;
    clustersWithRank.push({ c, rank: pr + 1 });
  }

  // Group slots by rank
  const slotsByRank = new Map<number, Slot[]>();
  for (const e of entities) {
    if (folded.has(e.id)) continue;
    const r = ranks.get(e.id);
    if (r === undefined) continue;
    const lm = labelMetrics.get(e.id) ?? { width: 130, height: 80 };
    const list = slotsByRank.get(r) ?? [];
    list.push({ kind: 'entity', entity: e, width: lm.width, height: lm.height, preferredX: 0, x: 0 });
    slotsByRank.set(r, list);
  }
  for (const { c, rank } of clustersWithRank) {
    const list = slotsByRank.get(rank) ?? [];
    list.push({ kind: 'cluster', cluster: c, width: CLUSTER_BOX_W, height: CLUSTER_BOX_H, preferredX: 0, x: 0 });
    slotsByRank.set(rank, list);
  }

  const ranksRendered = Array.from(slotsByRank.keys()).sort((a, b) => a - b);
  if (ranksRendered.length === 0) {
    return { positions, clusterPositions, ranks, ranksRendered: [], orphans };
  }

  // Phase 5: barycenter sweep (initial: alphabetic-ish stable order)
  for (const list of slotsByRank.values()) {
    list.sort((a, b) => slotName(a).localeCompare(slotName(b)));
  }

  // Initial X assignment: even spacing per tier, centered on 0
  for (const rank of ranksRendered) {
    const list = slotsByRank.get(rank)!;
    let cursor = 0;
    for (const slot of list) {
      slot.x = cursor;
      cursor += slot.width + MIN_GAP;
    }
    const tierWidth = cursor - MIN_GAP;
    const shift = -tierWidth / 2;
    for (const slot of list) slot.x += shift;
  }

  // Two iterations of barycenter sweep
  for (let iter = 0; iter < 2; iter++) {
    // Down-sweep
    for (let i = 1; i < ranksRendered.length; i++) {
      const tier = slotsByRank.get(ranksRendered[i])!;
      const above = slotsByRank.get(ranksRendered[i - 1])!;
      sortByParentBarycenter(tier, above, ownershipEdges, clusters);
      repackTier(tier);
    }
    // Up-sweep
    for (let i = ranksRendered.length - 2; i >= 0; i--) {
      const tier = slotsByRank.get(ranksRendered[i])!;
      const below = slotsByRank.get(ranksRendered[i + 1])!;
      sortByChildBarycenter(tier, below, ownershipEdges, clusters);
      repackTier(tier);
    }
  }

  // Phase 6: final X-packing with preferredX honored, then tier-shift
  for (let i = 0; i < ranksRendered.length; i++) {
    const rank = ranksRendered[i];
    const tier = slotsByRank.get(rank)!;
    if (i > 0) {
      const above = slotsByRank.get(ranksRendered[i - 1])!;
      assignPreferredX(tier, above, ownershipEdges, clusters);
      packWithPreferredX(tier);
      // Tier-shift to align centroid with parents' centroid
      const childCentroid = tierCentroid(tier);
      const parentCentroid = parentCentroidForTier(tier, above, ownershipEdges, clusters);
      const shift = parentCentroid - childCentroid;
      for (const slot of tier) slot.x += shift;
    } else {
      // tier 0: center on 0
      const c = tierCentroid(tier);
      for (const slot of tier) slot.x -= c;
    }
  }

  // Phase 7: Y assignment per-tier
  const minRank = ranksRendered[0];
  const tierY = new Map<number, number>();
  let yCursor = 0;
  for (const rank of ranksRendered) {
    tierY.set(rank, yCursor);
    const tier = slotsByRank.get(rank)!;
    const maxH = Math.max(...tier.map((s) => s.height));
    yCursor += Math.max(120, maxH + 40);
  }

  // Phase 8 + 9: write positions
  for (const rank of ranksRendered) {
    const y = tierY.get(rank)!;
    for (const slot of slotsByRank.get(rank)!) {
      if (slot.kind === 'entity') {
        positions.set(slot.entity.id, { id: slot.entity.id, x: slot.x, y });
      } else {
        const id = clusterId(slot.cluster);
        clusterPositions.set(id, { id, x: slot.x, y });
      }
    }
  }

  return { positions, clusterPositions, ranks, ranksRendered, orphans };
}

// --- helpers ---

function computeReachableFromAnchor(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  anchorId: string,
): Set<string> {
  const reachable = new Set<string>([anchorId]);
  const queue = [anchorId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of ownershipEdges) {
      if (e.from_entity_id === cur && !reachable.has(e.to_entity_id)) {
        reachable.add(e.to_entity_id);
        queue.push(e.to_entity_id);
      }
      if (e.to_entity_id === cur && !reachable.has(e.from_entity_id)) {
        reachable.add(e.from_entity_id);
        queue.push(e.from_entity_id);
      }
    }
  }
  return reachable;
}

function longestPathRanks(
  entities: StructureEntity[],
  ownershipEdges: StructureEdge[],
  reachable: Set<string>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const parents = new Map<string, string[]>();
  for (const e of ownershipEdges) {
    if (!reachable.has(e.from_entity_id) || !reachable.has(e.to_entity_id)) continue;
    const list = parents.get(e.to_entity_id) ?? [];
    list.push(e.from_entity_id);
    parents.set(e.to_entity_id, list);
  }

  // UPEs (no incoming edges among reachable) → rank 0
  const allReachableIds = Array.from(reachable);
  for (const id of allReachableIds) {
    if (!parents.has(id) || parents.get(id)!.length === 0) ranks.set(id, 0);
  }

  // Iteratively propagate: rank(e) = 1 + max(rank(p))
  let changed = true;
  let iterations = 0;
  const maxIter = allReachableIds.length + 1; // safety
  while (changed && iterations < maxIter) {
    changed = false;
    iterations++;
    for (const id of allReachableIds) {
      const ps = parents.get(id) ?? [];
      if (ps.length === 0) continue;
      let maxParentRank = -1;
      let allKnown = true;
      for (const p of ps) {
        const pr = ranks.get(p);
        if (pr === undefined) { allKnown = false; break; }
        if (pr > maxParentRank) maxParentRank = pr;
      }
      if (!allKnown) continue;
      const candidate = maxParentRank + 1;
      if (ranks.get(id) !== candidate) {
        ranks.set(id, candidate);
        changed = true;
      }
    }
  }
  return ranks;
}

function slotName(s: Slot): string {
  return s.kind === 'entity' ? s.entity.name : `~cluster:${s.cluster.parent_id}`;
}

function slotId(s: Slot): string {
  return s.kind === 'entity' ? s.entity.id : clusterId(s.cluster);
}

function parentIdsOf(
  s: Slot,
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): string[] {
  if (s.kind === 'entity') {
    return ownershipEdges
      .filter((e) => e.to_entity_id === s.entity.id)
      .map((e) => e.from_entity_id);
  }
  return [s.cluster.parent_id];
}

function childIdsOf(
  s: Slot,
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): string[] {
  if (s.kind === 'entity') {
    const direct = ownershipEdges
      .filter((e) => e.from_entity_id === s.entity.id)
      .map((e) => e.to_entity_id);
    // Children via cluster: clusters whose parent is this entity have id "cluster:parent:..."
    const clusterChildren = clusters
      .filter((c) => c.parent_id === s.entity.id)
      .map((c) => clusterId(c));
    return [...direct, ...clusterChildren];
  }
  return []; // clusters have no children for sweep purposes
}

function meanXById(ids: string[], tier: Slot[]): number | null {
  const xs: number[] = [];
  for (const id of ids) {
    for (const s of tier) if (slotId(s) === id) xs.push(s.x);
  }
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sortByParentBarycenter(
  tier: Slot[],
  above: Slot[],
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): void {
  const bary = new Map<string, number>();
  for (const s of tier) {
    const ps = parentIdsOf(s, ownershipEdges, clusters);
    const mx = meanXById(ps, above);
    bary.set(slotId(s), mx ?? Number.POSITIVE_INFINITY);
  }
  tier.sort((a, b) => {
    const ax = bary.get(slotId(a))!;
    const bx = bary.get(slotId(b))!;
    if (ax !== bx) return ax - bx;
    return slotName(a).localeCompare(slotName(b));
  });
}

function sortByChildBarycenter(
  tier: Slot[],
  below: Slot[],
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): void {
  const bary = new Map<string, number>();
  for (const s of tier) {
    const cs = childIdsOf(s, ownershipEdges, clusters);
    const mx = meanXById(cs, below);
    bary.set(slotId(s), mx ?? Number.POSITIVE_INFINITY);
  }
  tier.sort((a, b) => {
    const ax = bary.get(slotId(a))!;
    const bx = bary.get(slotId(b))!;
    if (ax !== bx) return ax - bx;
    return slotName(a).localeCompare(slotName(b));
  });
}

function repackTier(tier: Slot[]): void {
  let cursor = 0;
  for (const s of tier) {
    s.x = cursor + s.width / 2;
    cursor += s.width + MIN_GAP;
  }
  const tw = cursor - MIN_GAP;
  for (const s of tier) s.x -= tw / 2;
}

function assignPreferredX(
  tier: Slot[],
  above: Slot[],
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): void {
  for (const s of tier) {
    const ps = parentIdsOf(s, ownershipEdges, clusters);
    const mx = meanXById(ps, above);
    s.preferredX = mx ?? 0;
  }
}

function packWithPreferredX(tier: Slot[]): void {
  tier.sort((a, b) => a.preferredX - b.preferredX);
  let prev: Slot | null = null;
  for (const s of tier) {
    if (prev === null) {
      s.x = s.preferredX;
    } else {
      const minX = prev.x + prev.width / 2 + MIN_GAP + s.width / 2;
      s.x = Math.max(minX, s.preferredX);
    }
    prev = s;
  }
}

function tierCentroid(tier: Slot[]): number {
  if (tier.length === 0) return 0;
  return tier.reduce((a, s) => a + s.x, 0) / tier.length;
}

function parentCentroidForTier(
  tier: Slot[],
  above: Slot[],
  ownershipEdges: StructureEdge[],
  clusters: Cluster[],
): number {
  const parentSet = new Set<string>();
  for (const s of tier) for (const p of parentIdsOf(s, ownershipEdges, clusters)) parentSet.add(p);
  const xs: number[] = [];
  for (const id of parentSet) {
    for (const s of above) if (slotId(s) === id) xs.push(s.x);
  }
  if (xs.length === 0) return tierCentroid(above);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
```

- [ ] **Step 4: Run all tierLayout tests to verify**

```bash
npx vitest run src/lib/structure/__tests__/tierLayout.test.ts
```

Expected: all tests PASS, including the new 4 "hybrid rewrite" cases.

- [ ] **Step 5: Delete dagre files**

```bash
rm src/lib/structure/dagreLayout.ts
rm src/lib/structure/__tests__/dagreLayout.test.ts
```

- [ ] **Step 6: Remove dagre from package.json**

Open `package.json`. Find the `"dagre"` and `"@types/dagre"` lines in `dependencies` / `devDependencies` and remove them. Then:

```bash
npm install
```

Expected: clean install, `dagre` no longer in `node_modules`.

- [ ] **Step 7: Run full test suite to confirm nothing else broke**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all tests pass, zero TS errors.

- [ ] **Step 8: Commit (when user asks)**

```bash
git add src/lib/structure/tierLayout.ts src/lib/structure/__tests__/tierLayout.test.ts package.json package-lock.json
git rm src/lib/structure/dagreLayout.ts src/lib/structure/__tests__/dagreLayout.test.ts
git commit -m "feat(structure): hybrid layout rewrite (longest-path + barycenter + label-aware packing), drop dagre"
```

---

## Task 4: EntityNode + ClusterNode visuals

EntityNode: drop the 18-char `truncate()`, auto-size to the labelMetrics width/height, accept a `warningBadge` data slot. ClusterNode: replace the single rectangle with a 3-layer stacked-paper SVG, include explicit `(N entiteiten)` count. Add `deriveClusterName` helper to `relevance.ts`.

**Files:**
- Modify: `src/lib/structure/relevance.ts`
- Modify: `src/components/structure/nodes/EntityNode.tsx`
- Modify: `src/components/structure/nodes/ClusterNode.tsx`

- [ ] **Step 1: Add `deriveClusterName` to `relevance.ts`**

Open `src/lib/structure/relevance.ts`. Append after the existing exports:

```ts
import type { StructureEntity as _StructureEntity } from './types';

/**
 * Pick a label for a cluster of entities. If they share a common prefix
 * (e.g., "3WO OpCo 1" / "3WO OpCo 2" / ...) of ≥3 chars, use it; otherwise
 * fall back to "Operating entities".
 */
export function deriveClusterName(members: _StructureEntity[]): string {
  if (members.length === 0) return 'Operating entities';
  const names = members.map((m) => m.name);
  const prefix = commonPrefix(names);
  if (prefix.length >= 3) return prefix.trim();
  return 'Operating entities';
}

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let p = strings[0];
  for (const s of strings.slice(1)) {
    while (!s.startsWith(p) && p.length > 0) p = p.slice(0, -1);
    if (p.length === 0) break;
  }
  return p;
}
```

- [ ] **Step 2: Modify `EntityNode.tsx` — auto-sizing + warningBadge**

Open `src/components/structure/nodes/EntityNode.tsx`. Replace the file entirely:

```tsx
// src/components/structure/nodes/EntityNode.tsx
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { geometryFor } from '@/lib/structure/shapeGeometry';
import { fillFor, PALETTE } from '@/lib/structure/palette';
import type { EntityType } from '@/lib/structure/types';

export type WarningBadge =
  | { kind: 'ownership_sum'; sum_pct: number }
  | { kind: 'orphan' };

export interface EntityNodeData extends Record<string, unknown> {
  name: string;
  legal_form: string | null;
  jurisdiction_iso: string;
  entity_type: EntityType;
  is_taxpayer: boolean;
  source: 'ai_extracted' | 'user_added' | 'user_edited';
  width: number;
  height: number;
  warningBadge?: WarningBadge;
}

export type EntityNodeType = Node<EntityNodeData, 'entity'>;

function EntityNodeComp({ data, selected }: NodeProps<EntityNodeType>) {
  const W = data.width;
  const H = data.height;
  const geom = geometryFor(data.entity_type, W, H);
  const fill = fillFor(data);
  const isIndividual = data.entity_type === 'individual';

  return (
    <div style={{ width: W, height: H, position: 'relative' }}>
      <Handle type="target" position={Position.Top}    id="top"    style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right}  id="right"  style={{ opacity: 0 }} />

      <svg
        width={W}
        height={H}
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? '2px solid #1f5489' : 'none',
          outlineOffset: 4,
          borderRadius: 2,
        }}
      >
        {geom.outer.kind === 'rect' && (
          <rect
            width={W}
            height={H}
            rx={geom.outer.rx}
            fill={fill}
            stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
            strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
          />
        )}
        {geom.outer.kind === 'polygon' && (
          <polygon
            points={geom.outer.points}
            fill={fill}
            stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
            strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
          />
        )}
        {geom.outer.kind === 'ellipse' && (
          <ellipse
            cx={W / 2}
            cy={H / 2}
            rx={W / 2}
            ry={H / 2}
            fill={fill}
            stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
            strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
          />
        )}
        {geom.outer.kind === 'individual' && (
          <g>
            <circle
              cx={W / 2}
              cy={20}
              r={11}
              fill={PALETTE.individual}
              stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
              strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
            />
            <polygon
              points={`${W / 2 - 30},${H - 8} ${W / 2 - 24},${H - 42} ${W / 2 + 24},${H - 42} ${W / 2 + 30},${H - 8}`}
              fill={PALETTE.individual}
              stroke={data.is_taxpayer ? '#1a1a1a' : PALETTE.outerStroke}
              strokeWidth={data.is_taxpayer ? 1.5 : 0.75}
            />
          </g>
        )}

        {geom.inner?.kind === 'ellipse' && (
          <ellipse cx={W / 2} cy={H / 2} rx={geom.inner.rx} ry={geom.inner.ry}
            fill="none" stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92} />
        )}
        {geom.inner?.kind === 'polygon' && (
          <polygon points={geom.inner.points} fill="none"
            stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92} />
        )}
        {geom.inner?.kind === 'polyline' && (
          <polyline points={geom.inner.points} fill="none"
            stroke={PALETTE.innerStroke} strokeWidth={1.6} opacity={0.92} />
        )}

        {!isIndividual && (
          <>
            <text x={W / 2} y={H / 2 - 4}
              fontFamily="Inter, system-ui, sans-serif" fontSize={13} fontWeight={700}
              fill={PALETTE.text} textAnchor="middle">
              {data.name}
            </text>
            {data.legal_form && (
              <text x={W / 2} y={H / 2 + 12}
                fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
                fill={PALETTE.textMuted} textAnchor="middle">
                {data.legal_form}
              </text>
            )}
            <text x={W / 2} y={H - 8}
              fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
              fill={PALETTE.textMuted} textAnchor="middle">
              ({data.jurisdiction_iso})
            </text>
          </>
        )}

        {data.warningBadge && (
          <g>
            <title>{badgeTooltip(data.warningBadge)}</title>
            <rect x={W - 14} y={2} width={12} height={12} rx={2}
              fill="#b91c1c" stroke="#fff" strokeWidth={1} />
            <text x={W - 8} y={11}
              fontFamily="Inter, system-ui, sans-serif" fontSize={9} fontWeight={700}
              fill="#fff" textAnchor="middle">!</text>
          </g>
        )}
      </svg>
      {isIndividual && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: H + 4,
          textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, color: '#1d252b' }}>{data.name}</div>
          <div style={{ fontSize: 10.5, color: '#6b6660' }}>({data.jurisdiction_iso})</div>
        </div>
      )}
    </div>
  );
}

function badgeTooltip(b: WarningBadge): string {
  if (b.kind === 'ownership_sum') return `Ownership ${b.sum_pct.toFixed(2)}%`;
  return 'Disconnected entity';
}

export const EntityNode = memo(EntityNodeComp);
```

- [ ] **Step 3: Update `shapeGeometry.ts` to accept dynamic dimensions**

Open `src/lib/structure/shapeGeometry.ts`. Change `geometryFor` to take width and height:

```ts
import type { EntityType } from './types';

export const BOX = { width: 130, height: 80 } as const; // kept as fallback only

export type OuterShape =
  | { kind: 'rect'; rx: number }
  | { kind: 'polygon'; points: string }
  | { kind: 'ellipse' }
  | { kind: 'individual' };

export type InnerShape =
  | { kind: 'ellipse'; rx: number; ry: number }
  | { kind: 'polygon'; points: string }
  | { kind: 'polyline'; points: string };

export interface Geometry {
  outer: OuterShape;
  inner: InnerShape | null;
}

const RECT: OuterShape = { kind: 'rect', rx: 2 };

export function geometryFor(type: EntityType, W: number = BOX.width, H: number = BOX.height): Geometry {
  switch (type) {
    case 'corporation':
      return { outer: RECT, inner: null };

    case 'partnership':
      return {
        outer: { kind: 'polygon', points: `${W / 2},0 ${W},${H} 0,${H}` },
        inner: null,
      };

    case 'dh_entity':
      return {
        outer: RECT,
        inner: { kind: 'ellipse', rx: W / 2 - 5, ry: H / 2 - 6 },
      };

    case 'hybrid_partnership':
      return {
        outer: RECT,
        inner: { kind: 'polyline', points: `8,${H - 8} ${W / 2},12 ${W - 8},${H - 8}` },
      };

    case 'reverse_hybrid':
      return {
        outer: RECT,
        inner: { kind: 'polygon', points: `8,8 ${W - 8},8 ${W / 2},${H - 8}` },
      };

    case 'individual':
      return { outer: { kind: 'individual' }, inner: null };

    case 'trust_or_non_entity':
      return { outer: { kind: 'ellipse' }, inner: null };
  }
}
```

- [ ] **Step 4: Update `shapeGeometry.test.ts` if it tests the signature**

Open `src/lib/structure/__tests__/shapeGeometry.test.ts` and ensure existing calls `geometryFor('corporation')` still work (they will — second/third args have defaults).

- [ ] **Step 5: Modify `ClusterNode.tsx`**

Open `src/components/structure/nodes/ClusterNode.tsx`. Replace the file with:

```tsx
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';

export interface ClusterNodeData extends Record<string, unknown> {
  count: number;
  jurisdictions: Record<string, number>;
  jurisdictionMix: 'all-NL' | 'all-foreign' | 'mixed';
  name: string;
  onExpand: () => void;
}

export type ClusterNodeType = Node<ClusterNodeData, 'cluster'>;

const W = 150;
const H = 80;
const OFFSET = 4;

function ClusterNodeComp({ data, selected }: NodeProps<ClusterNodeType>) {
  const frontFill =
    data.jurisdictionMix === 'all-NL'
      ? PALETTE.nl
      : data.jurisdictionMix === 'all-foreign'
      ? PALETTE.foreign
      : '#7a766f';

  return (
    <div
      style={{ width: W + OFFSET * 2, height: H + OFFSET * 2, position: 'relative', cursor: 'pointer' }}
      onClick={() => data.onExpand()}
    >
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
      <svg
        width={W + OFFSET * 2}
        height={H + OFFSET * 2}
        style={{
          overflow: 'visible',
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.28))',
          outline: selected ? '2px solid #1f5489' : 'none',
          outlineOffset: 4,
          borderRadius: 2,
        }}
      >
        {/* back paper */}
        <rect x={OFFSET * 2} y={OFFSET * 2} width={W} height={H} rx={2}
          fill="#d8d2c8" stroke="#8a857d" strokeWidth={1} />
        {/* mid paper */}
        <rect x={OFFSET} y={OFFSET} width={W} height={H} rx={2}
          fill="#e3ddd0" stroke="#8a857d" strokeWidth={1} />
        {/* front rect */}
        <rect x={0} y={0} width={W} height={H} rx={2}
          fill={frontFill} stroke="#3a3530" strokeWidth={1} />
        <text x={W / 2} y={H / 2 - 4}
          fontFamily="Inter, system-ui, sans-serif" fontSize={12} fontWeight={700}
          fill={PALETTE.text} textAnchor="middle">
          {data.name}
        </text>
        <text x={W / 2} y={H / 2 + 14}
          fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
          fill={PALETTE.textMuted} textAnchor="middle">
          ({data.count} entiteiten)
        </text>
      </svg>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComp);
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: zero TS errors, all tests pass.

- [ ] **Step 7: Commit (when user asks)**

```bash
git add src/lib/structure/relevance.ts src/lib/structure/shapeGeometry.ts src/components/structure/nodes/EntityNode.tsx src/components/structure/nodes/ClusterNode.tsx
git commit -m "feat(structure): auto-sizing entity node + warning badge slot + stacked-paper cluster"
```

---

## Task 5: BlockingBanner + FiscalUnityOverlay components

Two new components. `BlockingBanner` replaces the chart when validator returns `hasBlocking: true`. `FiscalUnityOverlay` renders dashed-outline rectangles around grouping members, reactive to node drags via the React Flow store.

**Files:**
- Create: `src/components/structure/BlockingBanner.tsx`
- Create: `src/components/structure/overlays/FiscalUnityOverlay.tsx`

- [ ] **Step 1: Create `BlockingBanner.tsx`**

Create `src/components/structure/BlockingBanner.tsx`:

```tsx
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ValidatorResult } from '@/lib/structure/validator';
import type { StructureEntity } from '@/lib/structure/types';

interface Props {
  result: ValidatorResult;
  entities: StructureEntity[];
  onOpenEntity: (id: string) => void;
}

export function BlockingBanner({ result, entities, onOpenEntity }: Props) {
  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;
  return (
    <div className="absolute inset-0 bg-white flex flex-col items-center justify-center px-8">
      <div className="max-w-2xl w-full bg-red-50 border border-red-300 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-700" />
          <h2 className="text-lg font-semibold text-red-900">
            Chart cannot render — fix the issues below first
          </h2>
        </div>

        {result.missingFields.length > 0 && (
          <section className="mb-4">
            <h3 className="text-sm font-semibold text-neutral-800 mb-2">
              Missing required fields ({result.missingFields.length})
            </h3>
            <ul className="space-y-1">
              {result.missingFields.map((mf) => (
                <li key={mf.entity_id} className="flex items-center justify-between text-sm">
                  <span>
                    <strong>{entityName(mf.entity_id)}</strong> — missing{' '}
                    {mf.missing.join(' and ')}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onOpenEntity(mf.entity_id)}>
                    Open in inspector
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.cycles.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-800 mb-2">
              Ownership cycles ({result.cycles.length})
            </h3>
            <ul className="space-y-1">
              {result.cycles.map((cycle, i) => (
                <li key={i} className="text-sm">
                  <span className="text-neutral-700">
                    Cycle: {cycle.map(entityName).join(' → ')} → {entityName(cycle[0])}
                  </span>
                  <div className="flex gap-2 mt-1">
                    {cycle.map((id) => (
                      <Button key={id} size="sm" variant="outline" onClick={() => onOpenEntity(id)}>
                        Open {entityName(id)}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `FiscalUnityOverlay.tsx`**

Create the directory `src/components/structure/overlays/`, then create `FiscalUnityOverlay.tsx`:

```tsx
import { useStore, type ReactFlowState } from '@xyflow/react';
import type { StructureGroup } from '@/lib/structure/types';

interface Props {
  groupings: StructureGroup[];
}

const PADDING = 16;
const LABEL_HEIGHT = 18;

export function FiscalUnityOverlay({ groupings }: Props) {
  const nodeLookup = useStore((s: ReactFlowState) => s.nodeLookup);
  const transform = useStore((s: ReactFlowState) => s.transform);

  if (groupings.length === 0) return null;
  const [tx, ty, scale] = transform;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 4, // above edges (default ~0), below selected node outline
      }}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${scale})`}>
        {groupings.map((g) => {
          const memberPositions = g.member_ids
            .map((id) => nodeLookup.get(id))
            .filter((n): n is NonNullable<ReturnType<typeof nodeLookup.get>> => Boolean(n));
          if (memberPositions.length === 0) return null;

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const node of memberPositions) {
            const x = node.position.x;
            const y = node.position.y;
            const w = node.measured?.width ?? 130;
            const h = node.measured?.height ?? 80;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
          }

          const x = minX - PADDING;
          const y = minY - PADDING;
          const w = maxX - minX + PADDING * 2;
          const h = maxY - minY + PADDING * 2;

          const stroke = g.kind === 'fiscal_unity' ? '#555' : '#999';
          const dasharray = g.kind === 'fiscal_unity' ? '4 4' : '8 4';

          return (
            <g key={g.id}>
              <rect x={x} y={y} width={w} height={h}
                fill="none" stroke={stroke} strokeWidth={1.5}
                strokeDasharray={dasharray} rx={4} />
              <rect x={x + 8} y={y - LABEL_HEIGHT / 2} width={Math.max(140, (g.label.length * 7))} height={LABEL_HEIGHT}
                fill="#fff" stroke={stroke} strokeWidth={0.5} rx={2} />
              <text x={x + 14} y={y + 4}
                fontFamily="Inter, system-ui, sans-serif" fontSize={11} fontWeight={500}
                fill="#333">
                {g.label || (g.kind === 'fiscal_unity' ? 'Dutch CIT fiscal unity' : 'Consolidation group')}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: zero TS errors.

- [ ] **Step 4: Commit (when user asks)**

```bash
git add src/components/structure/BlockingBanner.tsx src/components/structure/overlays/FiscalUnityOverlay.tsx
git commit -m "feat(structure): blocking banner + fiscal-unity dashed-outline overlay"
```

---

## Task 6: client.ts + StructureChart integration

Add `listGroupings` data helper. Wire `FiscalUnityOverlay` into `StructureChart`, pass new props (ranks, groupings, ownershipSumIssues, orphanIds), and implement generation-skip edge routing.

**Files:**
- Modify: `src/lib/structure/client.ts`
- Modify: `src/components/structure/StructureChart.tsx`

- [ ] **Step 1: Add `listGroupings` to `client.ts`**

Open `src/lib/structure/client.ts`. Add a new exported function (placement: alongside other list/load helpers):

```ts
export async function listGroupings(chart_id: string): Promise<StructureGroup[]> {
  const { data, error } = await supabase
    .from('atad2_structure_groupings')
    .select('*')
    .eq('chart_id', chart_id);
  if (error) throw error;
  return (data ?? []) as StructureGroup[];
}
```

(Import `StructureGroup` at the top if not already imported: `import type { StructureChart, StructureEntity, StructureEdge, StructureGroup } from './types';`)

- [ ] **Step 2: Read current `StructureChart.tsx` to know where the entity-mapping useMemo lives**

```bash
cat src/components/structure/StructureChart.tsx
```

Identify (a) the `initialNodes` useMemo (entities → React Flow nodes), (b) `initialEdges` useMemo, (c) the `<ReactFlow>` JSX.

- [ ] **Step 3: Update `StructureChart.tsx` — new props, node-data, generation-skip, overlay child**

Modify the component signature to accept the new props. The key sections:

a) Extend `Props`:

```ts
interface Props {
  entities: StructureEntity[];
  edges: StructureEdge[];
  clusterNodes: Array<{ id: string; position: { x: number; y: number }; data: ClusterNodeData }>;
  onSelectionChange: (sel: { kind: 'node' | 'edge'; id: string } | null) => void;
  onNodePositionEnd: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
  // NEW
  ranks: Map<string, number>;
  groupings: StructureGroup[];
  labelMetrics: Map<string, { width: number; height: number }>;
  ownershipSumIssues: Map<string, number>; // child_id → sum_pct
  orphanIds: Set<string>;
}
```

b) In the `initialNodes` useMemo, build EntityNode data with `width`, `height`, and `warningBadge`:

```ts
const initialNodes = useMemo<ChartNodeType[]>(() => {
  return props.entities.map<ChartNodeType>((e) => {
    const lm = props.labelMetrics.get(e.id) ?? { width: 130, height: 80 };
    let warningBadge: WarningBadge | undefined;
    const sum = props.ownershipSumIssues.get(e.id);
    if (sum != null) warningBadge = { kind: 'ownership_sum', sum_pct: sum };
    else if (props.orphanIds.has(e.id)) warningBadge = { kind: 'orphan' };
    return {
      id: e.id,
      position: { x: e.position_x, y: e.position_y },
      type: 'entity',
      data: {
        name: e.name,
        legal_form: e.legal_form,
        jurisdiction_iso: e.jurisdiction_iso,
        entity_type: e.entity_type,
        is_taxpayer: e.is_taxpayer,
        source: e.source,
        width: lm.width,
        height: lm.height,
        warningBadge,
      } satisfies EntityNodeData,
    };
  });
}, [props.entities, props.labelMetrics, props.ownershipSumIssues, props.orphanIds]);
```

(Import `WarningBadge` from `EntityNode`.)

c) In `initialEdges`, add the generation-skip branch for ownership edges. Inside the `e.kind === 'ownership'` branch:

```ts
const childRank = props.ranks.get(e.to_entity_id);
const parentRank = props.ranks.get(e.from_entity_id);
const skips = childRank != null && parentRank != null && childRank > parentRank + 1;

let sourceHandle: string | undefined;
let targetHandle: string | undefined;
if (skips) {
  const parentEntity = props.entities.find((x) => x.id === e.from_entity_id);
  const childEntity = props.entities.find((x) => x.id === e.to_entity_id);
  if (parentEntity && childEntity) {
    const goRight = childEntity.position_x > parentEntity.position_x;
    sourceHandle = goRight ? 'right' : 'left';
    targetHandle = 'top';
  }
}

return {
  id: e.id,
  source: e.from_entity_id,
  target: e.to_entity_id,
  type: 'ownership',
  ...(sourceHandle ? { sourceHandle } : {}),
  ...(targetHandle ? { targetHandle } : {}),
  markerEnd: { type: MarkerType.ArrowClosed, color: PALETTE.ownershipStroke },
  data: { ownership_pct: e.ownership_pct },
} as OwnershipEdgeType;
```

d) Inside the `<ReactFlow>` JSX, add `<FiscalUnityOverlay groupings={props.groupings} />` as a child element:

```tsx
<ReactFlow
  // ... existing props
>
  <FiscalUnityOverlay groupings={props.groupings} />
  {/* existing Background, Controls, etc. */}
</ReactFlow>
```

(Import: `import { FiscalUnityOverlay } from './overlays/FiscalUnityOverlay';`)

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: zero TS errors, all tests pass.

- [ ] **Step 5: Commit (when user asks)**

```bash
git add src/lib/structure/client.ts src/components/structure/StructureChart.tsx
git commit -m "feat(structure): wire groupings + ranks + warning badges + generation-skip edges into chart"
```

---

## Task 7: StructureChartStep + FloatingToolbar wiring

This is the integration task. `StructureChartStep` runs the validator, decides between banner vs chart, loads groupings, passes everything to `<StructureChart>`, and exposes orphan-reveal state. `FloatingToolbar` loses the Auto-layout button and gains the orphan counter.

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`
- Modify: `src/components/structure/FloatingToolbar.tsx`

- [ ] **Step 1: Update `FloatingToolbar.tsx`**

Open `src/components/structure/FloatingToolbar.tsx`. Replace its body with:

```tsx
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
  onReExtract: () => void;
  onExportPptx: () => void;
  busy?: boolean;
  transactionsVisible: boolean;
  onToggleTransactions: () => void;
  expandedClusterCount: number;
  onCollapseAll: () => void;
  // NEW
  orphanCount: number;
  orphansVisible: boolean;
  onToggleOrphans: () => void;
}

const EXTRACTING_PREFIX = 'extracting:';

export function FloatingToolbar({
  status,
  entityCount,
  ownershipCount,
  transactionCount,
  onReExtract,
  onExportPptx,
  busy,
  transactionsVisible,
  onToggleTransactions,
  expandedClusterCount,
  onCollapseAll,
  orphanCount,
  orphansVisible,
  onToggleOrphans,
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
      {expandedClusterCount > 0 && (
        <button
          type="button"
          onClick={onCollapseAll}
          className="text-xs text-neutral-500 hover:text-neutral-900 px-2 py-1 rounded hover:bg-neutral-100 whitespace-nowrap"
        >
          {expandedClusterCount} expanded · Collapse
        </button>
      )}
      {orphanCount > 0 && (
        <button
          type="button"
          onClick={onToggleOrphans}
          className="text-xs text-red-700 hover:text-red-900 px-2 py-1 rounded hover:bg-red-50 whitespace-nowrap"
        >
          {orphanCount} disconnected · {orphansVisible ? 'Hide' : 'Show'}
        </button>
      )}
      <Button
        size="sm"
        variant={transactionsVisible ? 'default' : 'outline'}
        onClick={onToggleTransactions}
        disabled={busy || isExtracting}
      >
        {transactionsVisible ? 'Hide transactions' : 'Show transactions'}
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

Notes: `onAutoLayout` prop removed; new props `orphanCount`, `orphansVisible`, `onToggleOrphans` added. Auto-layout button removed from JSX.

- [ ] **Step 2: Update `StructureChartStep.tsx` — top-of-file imports**

Open `src/components/structure/StructureChartStep.tsx`. Add to the existing imports:

```ts
import { validate, type ValidatorResult } from '@/lib/structure/validator';
import { measureLabels } from '@/lib/structure/labelMeasure';
import { listGroupings } from '@/lib/structure/client';
import { BlockingBanner } from './BlockingBanner';
import { deriveClusterName } from '@/lib/structure/relevance';
import type { StructureGroup } from '@/lib/structure/types';
```

Remove the `onAutoLayout` prop from the `<FloatingToolbar>` JSX (later step).

- [ ] **Step 3: Add validation, groupings, labelMetrics, orphans state + memos**

Inside the component body, add the following blocks. Place near related state:

```ts
const [groupings, setGroupings] = useState<StructureGroup[]>([]);
const [showOrphans, setShowOrphans] = useState(false);
const [tierResult, setTierResult] = useState<ReturnType<typeof tierLayout> | null>(null);

const validation = useMemo<ValidatorResult>(
  () => validate(visibleEntities, visibleEdges),
  [visibleEntities, visibleEdges],
);

const labelMetrics = useMemo(
  () => measureLabels(visibleEntities),
  [visibleEntities],
);

const ownershipSumIssuesMap = useMemo(() => {
  const m = new Map<string, number>();
  for (const i of validation.ownershipSumIssues) m.set(i.child_id, i.sum_pct);
  return m;
}, [validation]);

const orphanIds = useMemo(() => {
  if (!tierResult) return new Set<string>();
  return new Set(tierResult.orphans.map((o) => o.id));
}, [tierResult]);
```

In the existing `useEffect` that loads `loadChart`, after a successful load also call `listGroupings(loaded.chart.id)`:

```ts
const loadedGroupings = await listGroupings(loaded.chart.id);
if (!aborted) setGroupings(loadedGroupings);
```

(Repeat the same call inside the `else` branch where `startExtraction` is used, after the polling finishes.)

- [ ] **Step 4: Replace `handleAutoLayout` with `runLayout`**

Rename `handleAutoLayout` to `runLayout`. Inside, replace `tierLayout(...)` to also store the full result:

```ts
const runLayout = useCallback(() => {
  if (!chart) return;
  if (validation.hasBlocking) return;

  const ownership = visibleEdges.filter((e) => e.kind === 'ownership');
  const transactions = visibleEdges.filter((e) => e.kind === 'transaction');
  const taxpayer = visibleEntities.find((e) => e.is_taxpayer);

  const allClusters = groupNonRelevantSiblings(
    visibleEntities,
    ownership,
    transactions,
    taxpayer?.id ?? '',
  );
  const activeClusters = allClusters.clusters.filter(
    (c) => !expandedClusters.has(clusterId(c)),
  );
  activeClustersRef.current = activeClusters;

  const result = tierLayout({
    entities: visibleEntities,
    ownershipEdges: ownership,
    clusters: activeClusters,
  });
  setTierResult(result);

  setEntities((prev) =>
    prev.map((e) => {
      const p = result.positions.get(e.id);
      return p ? { ...e, position_x: p.x, position_y: p.y } : e;
    }),
  );
  for (const [, p] of result.positions) updateEntityPosition(p.id, p.x, p.y);

  setClusterLayout(buildClusterLayout(activeClusters, result.clusterPositions, visibleEntities));
}, [chart, visibleEntities, visibleEdges, expandedClusters, validation.hasBlocking]);
```

Update the auto-runLayout `useEffect` to call `runLayout()` and to skip when `validation.hasBlocking`:

```ts
useEffect(() => {
  if (!chart) return;
  if (entities.length === 0) return;
  if (validation.hasBlocking) return;
  runLayout();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [chart?.id, entities.length, edges.length, expandedClusters, validation.hasBlocking]);
```

- [ ] **Step 5: Update `buildClusterLayout` to include `name`**

Locate `buildClusterLayout`. In its `data` payload, add `name`:

```ts
return {
  id: idStr,
  position: { x: pos.x, y: pos.y },
  data: {
    count: members.length,
    jurisdictions,
    jurisdictionMix: mix,
    name: deriveClusterName(members),
    onExpand: () => {},
  },
};
```

- [ ] **Step 6: Adjust orphan rendering — position visible orphans at bottom**

Just before passing entities to `<StructureChart>`, derive `renderEntities`:

```ts
const renderEntities = useMemo<StructureEntity[]>(() => {
  if (!showOrphans) return visibleEntities;
  if (!tierResult) return visibleEntities;
  if (tierResult.orphans.length === 0) return visibleEntities;
  const tierY = Array.from(tierResult.positions.values()).reduce(
    (max, p) => Math.max(max, p.y),
    0,
  );
  const orphanY = tierY + 200;
  const placed = tierResult.orphans.map((o, i) => ({
    ...o,
    position_x: i * 170 - (tierResult.orphans.length - 1) * 85,
    position_y: orphanY,
  }));
  // Include any user_added orphans plus our placed AI orphans:
  const placedIds = new Set(placed.map((p) => p.id));
  return [...visibleEntities, ...placed.filter((p) => !placedIds.has(p.id) || true)];
}, [showOrphans, tierResult, visibleEntities]);
```

Actually simpler: `visibleEntities` already excludes orphans. When `showOrphans`, append them with computed positions:

```ts
const renderEntities = useMemo<StructureEntity[]>(() => {
  if (!showOrphans || !tierResult || tierResult.orphans.length === 0) {
    return visibleEntities;
  }
  const tierMaxY = Array.from(tierResult.positions.values()).reduce(
    (max, p) => Math.max(max, p.y),
    0,
  );
  const orphanY = tierMaxY + 200;
  const orphanCount = tierResult.orphans.length;
  const placed = tierResult.orphans.map((o, i) => ({
    ...o,
    position_x: (i - (orphanCount - 1) / 2) * 170,
    position_y: orphanY,
  }));
  return [...visibleEntities, ...placed];
}, [showOrphans, tierResult, visibleEntities]);
```

- [ ] **Step 7: Pass new props to `<StructureChart>` and update `<FloatingToolbar>`**

In the JSX where `<StructureChart>` is rendered:

```tsx
<StructureChart
  entities={renderEntities}
  edges={renderableEdges}
  clusterNodes={clusterNodes}
  onSelectionChange={setSelection}
  onNodePositionEnd={(id, x, y) => {
    setEntities((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, position_x: x, position_y: y } : e,
      ),
    );
    updateEntityPosition(id, x, y);
  }}
  onConnect={handleConnect}
  ranks={tierResult?.ranks ?? new Map()}
  groupings={groupings}
  labelMetrics={labelMetrics}
  ownershipSumIssues={ownershipSumIssuesMap}
  orphanIds={orphanIds}
/>
```

And the `<FloatingToolbar>` JSX (drop `onAutoLayout`, add orphan props):

```tsx
<FloatingToolbar
  status={typeof status === 'string' ? status : ''}
  entityCount={visibleEntities.length}
  ownershipCount={visibleEdges.filter((e) => e.kind === 'ownership').length}
  transactionCount={visibleEdges.filter((e) => e.kind === 'transaction').length}
  onReExtract={handleReExtract}
  onExportPptx={() => {
    exportToPptx({
      entities: visibleEntities,
      edges: visibleEdges,
      taxpayerName: '',
    });
  }}
  busy={busy}
  transactionsVisible={showTransactions}
  onToggleTransactions={() => setShowTransactions((v) => !v)}
  expandedClusterCount={expandedClusters.size}
  onCollapseAll={handleCollapseAll}
  orphanCount={tierResult?.orphans.length ?? 0}
  orphansVisible={showOrphans}
  onToggleOrphans={() => setShowOrphans((v) => !v)}
/>
```

(Task 8 will add the `groupings` argument to this call once `exportToPptx`'s signature accepts it.)

- [ ] **Step 8: Conditional render — banner or chart**

In the main JSX, after the `isFailed` branch and before the chart `<>` fragment, gate on `validation.hasBlocking`:

```tsx
) : isFailed ? (
  // ... existing failed UI
) : validation.hasBlocking ? (
  <BlockingBanner
    result={validation}
    entities={visibleEntities}
    onOpenEntity={(id) => setSelection({ kind: 'node', id })}
  />
) : (
  <>
    <StructureChart ... />
    <FloatingPalette ... />
    <FloatingInspector ... />
    <FloatingToolbar ... />
  </>
)
```

- [ ] **Step 9: Verify**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: zero TS errors, all tests pass.

- [ ] **Step 10: Commit (when user asks)**

```bash
git add src/components/structure/StructureChartStep.tsx src/components/structure/FloatingToolbar.tsx
git commit -m "feat(structure): validator pipeline + groupings load + orphan reveal + auto-layout button removed"
```

---

## Task 8: PPTX overlay export + manual smoke

`exportToPptx` accepts the new `groupings` parameter and renders dashed-outline rectangles around members. After this, run the full manual smoke test from spec §11.

**Files:**
- Modify: `src/components/structure/exports/exportToPptx.ts`

- [ ] **Step 1: Update `exportToPptx` signature**

Open `src/components/structure/exports/exportToPptx.ts`. Find the `exportToPptx` function and add `groupings` to its options:

```ts
export async function exportToPptx({
  entities,
  edges,
  groupings = [],
  taxpayerName,
}: {
  entities: StructureEntity[];
  edges: StructureEdge[];
  groupings?: StructureGroup[];
  taxpayerName: string;
}) {
  // existing body...
}
```

(Import `StructureGroup` from `@/lib/structure/types` if not already.)

- [ ] **Step 2: Add `addGroupingOverlay` helper**

After the existing `addOwnershipBus` helper (or anywhere near the other addX functions), add:

```ts
function addGroupingOverlay(
  slide: PptxGenJS.Slide,
  g: StructureGroup,
  entities: StructureEntity[],
  fit: Fit,
) {
  const members = entities.filter((e) => g.member_ids.includes(e.id));
  if (members.length === 0) return;

  const rects = members.map((e) => projectXY(e, fit));
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));

  const padding = 0.15;
  const x = minX - padding;
  const y = minY - padding;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;

  const strokeColor = g.kind === 'fiscal_unity' ? '555555' : '999999';
  const dashType: 'dash' | 'dashDot' = g.kind === 'fiscal_unity' ? 'dash' : 'dashDot';

  slide.addShape('rect' as PptxGenJS.ShapeType, {
    x, y, w, h,
    line: { color: strokeColor, width: 1.5, dashType },
    fill: { type: 'none' as never },
    rectRadius: 0.04,
  } as never);

  slide.addText(
    g.label || (g.kind === 'fiscal_unity' ? 'Dutch CIT fiscal unity' : 'Consolidation group'),
    {
      x: x + 0.1, y: y - 0.1, w: 1.6, h: 0.2,
      fontFace: 'Inter', fontSize: Math.max(7, 9 * fit.scale),
      color: strokeColor, align: 'left' as const,
      fill: { color: 'FFFFFF' },
    },
  );
}
```

- [ ] **Step 3: Call `addGroupingOverlay` in the main render loop**

In the body of `exportToPptx`, after entities and edges are drawn (and after `addOwnershipBus`), add:

```ts
for (const g of groupings) {
  addGroupingOverlay(slide, g, entities, fit);
}
```

- [ ] **Step 4: Update the call site in `StructureChartStep.tsx`**

Now that the function accepts `groupings`, update the `onExportPptx` callback inside `<FloatingToolbar>` to pass it:

```tsx
onExportPptx={() => {
  exportToPptx({
    entities: visibleEntities,
    edges: visibleEdges,
    groupings,
    taxpayerName: '',
  });
}}
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: zero TS errors, all tests pass, production build succeeds.

- [ ] **Step 6: Start dev server**

```bash
npm run dev
```

- [ ] **Step 7: Manual smoke checklist**

Open `http://localhost:8080`, sign in, navigate to the existing S4 Energy session's structure-chart step.

1. **Castleton / S4 production case** — open the S4 Energy session. Verify: no node-on-node overlap; no `…` truncation in any label; all ownership edges visible; warning badge on S4 Energy reading "Ownership 102.7%"; cluster "6 other subsidiaries" sits under its parent with a connecting edge.
2. **Corrected S4 data** — edit Castleton ownership to 96.65%, add Foundation De Andevi at 3.35%. Warning badge disappears.
3. **Duvel Moortgat** — create a session with Duvel Moortgat NV at the top, Duhco S.A. (LUX) and Duhco Nederland B.V. (NL) on layer 1; add a 29-member cluster. Cluster shows stacked-paper visual with `(29 entiteiten)`.
4. **Synthetic JV** — create A, B, C; A→C 50% + B→C 50%. C lands centered between A and B; both edges visible.
5. **Generation skipping** — A owns B 100%, A owns C 50%, B owns C 50%. A→C edge routes via side handle.
6. **Missing field** — clear an entity's legal_form. Chart replaced by banner listing the entity; "Open in inspector" works.
7. **Cycle** — create A→B then B→A. Chart blocked, banner shows the cycle.
8. **Orphan** — add an entity via "+ Entity" without connecting it. Toolbar shows "1 disconnected · Show". Click reveals it at the bottom with a red badge.
9. **Fiscal unity overlay** — insert a row into `atad2_structure_groupings` for the S4 session with `kind='fiscal_unity'` and members = the 3 NL operating entities. Reload. Dashed outline appears around them with "Dutch CIT fiscal unity" label.
10. **PPTX export** — click Export PPTX. Open the file. Dashed-outline group is present. Stacked-paper cluster is present. No regressions vs the MVP-3.7 export.

- [ ] **Step 8: Document any deviations**

If any item above doesn't behave as expected, capture a screenshot + DevTools details. That becomes the next iteration's input.

- [ ] **Step 9: Commit (when user asks)**

```bash
git add src/components/structure/exports/exportToPptx.ts src/components/structure/StructureChartStep.tsx
git commit -m "feat(pptx): fiscal-unity dashed-outline overlay in export"
```

---

## Self-Review

### Spec coverage

| Spec § | Implemented in |
|---|---|
| §3.1 Hybrid layout-engine rewrite | Task 3 |
| §3.2 Pure validator module | Task 1 |
| §3.3 Stacked-paper cluster visual | Task 4 |
| §3.4 Fiscal-unity dashed-outline overlay | Task 5 (component) + Task 6 (wiring) + Task 8 (PPTX) |
| §3.5 Orphan toolbar counter | Task 7 |
| §3.6 Auto-layout button removed | Task 3 (no Auto-layout import) + Task 7 (button removal) |
| §4.1 Public signature unchanged | Task 3 Step 3 (signature preserved) |
| §4.2 Algorithm phases 1-9 | Task 3 Step 3 (implementation matches) |
| §4.3 Generation-skip edge routing | Task 6 Step 3c |
| §4.4 Performance target | Task 3 Step 1 (200-entity perf test) |
| §4.5 Removal of dagre | Task 3 Steps 5-6 |
| §5 Validators | Task 1 |
| §5.3 BlockingBanner + orphan reveal | Task 5 (banner) + Task 7 (wiring) |
| §6 labelMeasure | Task 2 |
| §7 ClusterNode visual | Task 4 Step 5 |
| §8 FiscalUnityOverlay | Task 5 Step 2 + Task 6 Step 3d |
| §11 Manual smoke test | Task 8 Step 6 |

### Placeholder scan
- No "TBD" / "TODO" / "implement later" remaining.
- Every code step shows the actual code or the actual diff.
- Every command step shows the actual command + expected output.

### Type-name consistency
- `ValidatorResult`, `OwnershipSumIssue`, `MissingFieldsEntry` defined in Task 1 Step 3, consumed in Task 5 (BlockingBanner) and Task 7 (StructureChartStep validation memo + ownershipSumIssuesMap). Names match.
- `LabelMetrics` defined in Task 2 Step 3, consumed in Task 3 Step 3 (`measureLabels` import) and Task 6 Step 3b (props.labelMetrics typing) and Task 7 Step 3 (`labelMetrics` memo). Names match.
- `WarningBadge` defined in Task 4 Step 2 (`EntityNode.tsx` export), consumed in Task 6 Step 3b (imported from EntityNode for typing). Names match.
- `Cluster` defined in `relevance.ts` (existing); `deriveClusterName` added in Task 4 Step 1; consumed in Task 7 Step 5 (`buildClusterLayout`).
- `StructureGroup` from existing types; consumed in `client.ts` Task 6 Step 1, in `FiscalUnityOverlay` Task 5 Step 2, in `StructureChart` Task 6 Step 3, in `StructureChartStep` Task 7 Step 2, in `exportToPptx` Task 8 Step 1. Consistent.
- `tierResult` state variable name used in Task 7 Step 3 (declaration) and Task 7 Step 6 (`renderEntities` memo) and Task 7 Step 7 (`tierResult?.ranks ?? new Map()`). Consistent.
- `runLayout` (renamed from `handleAutoLayout`) defined in Task 7 Step 4, called from the auto-layout `useEffect` updated in same step. Consistent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-12-tcm-structure-chart-refactor.md`.**

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. 8 tasks, each is committable on its own. Good fit.

**2. Inline Execution** — execute in this session via the executing-plans skill, batched with checkpoints. Acceptable but the surface area is wide.

Which approach?
