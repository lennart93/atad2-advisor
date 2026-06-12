# ATAD2 Appendix Facts Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Facts & relationships" block (Part A) to the ATAD2 technical appendix — an entity register, a relatedness + acting-together view, a home-vs-source classification matrix, and an intra-group transaction map — that precedes the existing article checklist (Part B) and that the articles reference, without cluttering the annex.

**Architecture:** Part A is one structured `facts` block on `atad2_appendix`. It is produced by a three-phase pipeline in the `generate-appendix` edge function: (1) deterministic builders derive the entity register + relatedness from the structure chart; (2) Claude proposes the classification matrix, transactions and acting-together clusters for advisor review; (3) the existing per-section article generation is grounded on Part A so its reasoning cites the facts. The frontend renders Part A as compact, collapsible exhibits above the existing table, internal-rich and dossier-clean.

**Tech Stack:** React + Vite + TypeScript + Tailwind + shadcn/ui (frontend); Vitest (tests, `src/lib/appendix/__tests__`); self-hosted Supabase Postgres + Deno edge functions (`supabase/functions/generate-appendix`); DB migrations applied to the VM via `az vm run-command` as `supabase_admin`.

---

## Reference: existing shapes (read before starting)

- `src/lib/appendix/types.ts` — `AppendixRow`, `StoredAppendix`, `SkeletonRow`, `Status`, `RowKind`, `RelatedView`.
- `src/lib/appendix/relatedParties.ts` — `buildRelatedParties(entities, edges)` returns `{ taxpayerName, parties: RelatedParty[] }`; `RelatedParty = { id, name, jurisdiction, entityType, relationship: 'Parent'|'Subsidiary'|'Group entity', ownershipPct, meetsRelated, meetsReverse }`.
- `src/lib/structure/client.ts` — `loadChart(sessionId)` returns `{ chart, entities, edges, groupings }`; `StructureEntity`/`StructureEdge` are `atad2_structure_entities`/`_edges` Row types (entity fields: `id, name, entity_type, jurisdiction_iso, is_taxpayer`; edge fields: `from_entity_id, to_entity_id, ownership_pct, kind`).
- `src/lib/appendix/client.ts` — `loadAppendix` maps the DB row to `StoredAppendix`; `saveRowEdit(appendixId, rows, rowId, field, oldValue, newValue, userId)`.
- `supabase/functions/generate-appendix/index.ts` — `runGeneration`, `loadStructureBlock`, `loadSkeletonRows`, swarm per-section generation, `callWithRetry`, zod schema in `schemas.ts`.
- Run tests: `npm run test -- src/lib/appendix/`. Build: `npm run build`.
- VM migration command (PowerShell), `$az = 'C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'`:
  `& $az vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts @<applyscript.sh> --query "value[0].message" -o tsv`. The apply script pipes the migration into `docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1`.

---

# Phase 1 — Data model + deterministic builders

## Task 1: Facts types

**Files:**
- Modify: `src/lib/appendix/types.ts`

- [ ] **Step 1: Add the facts types**

Append to `src/lib/appendix/types.ts`:

```ts
export type FactStatus = 'proposed' | 'confirmed';
export type FactSource = 'chart' | 'ai' | 'edited';

/** One entity in the register; the anchor every other exhibit references by `id`. */
export interface FactEntity {
  id: string;                // stable cross-ref label, e.g. "E1"
  chartEntityId: string;     // atad2_structure_entities.id
  name: string;
  jurisdiction: string | null;
  entityType: string | null;
  role: 'Taxpayer' | 'Parent' | 'Subsidiary' | 'Group entity';
  ownershipPct: number | null; // parent: of the taxpayer; subsidiary: of that entity
  related: boolean;            // meets the >25% related-party test
  nlTaxStatus: string | null;  // AI/advisor filled; null until proposed
}

export interface ActingTogetherCluster {
  id: string;                  // "A1"
  memberEntityIds: string[];   // ["E3","E4"]
  combinedPct: number | null;
  rationale: string;
  status: 'proposed' | 'confirmed' | 'dismissed';
  excludedFromClient: boolean;
  source: 'ai' | 'edited';
}

export interface ClassificationItem {
  entityId: string;            // "E4"
  homeState: string;
  homeClass: string;           // transparent | opaque | disregarded | ...
  sourceState: string | null;
  sourceClass: string | null;
  hybrid: boolean;             // homeClass != sourceClass
  status: FactStatus;
  excludedFromClient: boolean;
  source: 'ai' | 'edited';
}

export interface TransactionItem {
  id: string;                  // "T1"
  fromEntityId: string;
  toEntityId: string;
  kind: string;                // financing | service | royalty | dividend | ...
  instrument: string | null;
  note: string | null;
  articlesTested: string[];    // ["12aa(1)(a)","12ad"]
  status: FactStatus;
  excludedFromClient: boolean;
  source: 'ai' | 'edited';
}

export interface AppendixFacts {
  entities: FactEntity[];
  actingTogether: ActingTogetherCluster[];
  classifications: ClassificationItem[];
  transactions: TransactionItem[];
}
```

> Note: this refines the spec's illustrative storage by folding the `relatedness`
> array into `FactEntity` (role/ownershipPct/related), so relatedness is not stored twice.

- [ ] **Step 2: Add `facts` to `StoredAppendix`**

In `src/lib/appendix/types.ts`, in `interface StoredAppendix`, add after `rows: AppendixRow[];`:

```ts
  facts: AppendixFacts | null;
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: PASS (no consumers yet read `facts`; `loadAppendix` is fixed in Task 7).

- [ ] **Step 4: Commit**

```bash
git add src/lib/appendix/types.ts
git commit -m "feat(appendix): facts layer types"
```

## Task 2: Entity register builder

**Files:**
- Create: `src/lib/appendix/facts/entityRegister.ts`
- Test: `src/lib/appendix/__tests__/entityRegister.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/appendix/__tests__/entityRegister.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildEntityRegister } from '@/lib/appendix/facts/entityRegister';
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';

const ent = (id: string, name: string, taxpayer = false, jur = 'NL'): StructureEntity =>
  ({ id, name, is_taxpayer: taxpayer, jurisdiction_iso: jur, entity_type: 'corp' } as unknown as StructureEntity);
const edge = (from: string, to: string, pct: number | null): StructureEdge =>
  ({ from_entity_id: from, to_entity_id: to, ownership_pct: pct, kind: 'ownership' } as unknown as StructureEdge);

describe('buildEntityRegister', () => {
  it('puts the taxpayer first as E1 and numbers the rest deterministically', () => {
    const entities = [ent('c2', 'Sub Inc', false, 'US'), ent('c1', 'TaxPayer BV', true), ent('c3', 'Parent Coop')];
    const edges = [edge('c3', 'c1', 33), edge('c1', 'c2', 100)];
    const reg = buildEntityRegister(entities, edges);
    expect(reg[0].id).toBe('E1');
    expect(reg[0].role).toBe('Taxpayer');
    expect(reg[0].name).toBe('TaxPayer BV');
    const parent = reg.find((e) => e.name === 'Parent Coop')!;
    expect(parent.role).toBe('Parent');
    expect(parent.ownershipPct).toBe(33);
    expect(parent.related).toBe(true); // > 25%
    const sub = reg.find((e) => e.name === 'Sub Inc')!;
    expect(sub.role).toBe('Subsidiary');
    expect(sub.ownershipPct).toBe(100);
  });

  it('is stable: same input yields the same ids', () => {
    const entities = [ent('c1', 'TaxPayer BV', true), ent('c2', 'Sub', false, 'US')];
    const edges = [edge('c1', 'c2', 60)];
    expect(buildEntityRegister(entities, edges).map((e) => `${e.id}:${e.name}`))
      .toEqual(buildEntityRegister(entities, edges).map((e) => `${e.id}:${e.name}`));
  });

  it('returns empty when there is no taxpayer', () => {
    expect(buildEntityRegister([ent('c1', 'X')], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/entityRegister.test.ts`
Expected: FAIL ("Failed to resolve import" / buildEntityRegister is not a function).

- [ ] **Step 3: Write the implementation**

Create `src/lib/appendix/facts/entityRegister.ts`:

```ts
import type { StructureEntity, StructureEdge } from '@/lib/structure/types';
import type { FactEntity } from '@/lib/appendix/types';

const RELATED_THRESHOLD = 25;

/**
 * Deterministic entity register from the structure chart. The taxpayer is E1;
 * the remaining entities are ordered parents (by descending interest), then
 * subsidiaries (by descending interest), then other group entities (by name),
 * and numbered E2.. in that order. Pure function of (entities, edges).
 */
export function buildEntityRegister(entities: StructureEntity[], edges: StructureEdge[]): FactEntity[] {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  type Pre = { ent: StructureEntity; role: FactEntity['role']; pct: number | null };
  const pre = new Map<string, Pre>();
  pre.set(taxpayer.id, { ent: taxpayer, role: 'Taxpayer', pct: null });

  for (const ed of edges) {
    const pct = (ed.ownership_pct as number | null) ?? null;
    if (ed.to_entity_id === taxpayer.id && ed.from_entity_id !== taxpayer.id) {
      const e = byId.get(ed.from_entity_id as string);
      if (e && !pre.has(e.id)) pre.set(e.id, { ent: e, role: 'Parent', pct });
    } else if (ed.from_entity_id === taxpayer.id && ed.to_entity_id !== taxpayer.id) {
      const e = byId.get(ed.to_entity_id as string);
      if (e && !pre.has(e.id)) pre.set(e.id, { ent: e, role: 'Subsidiary', pct });
    }
  }
  for (const e of entities) if (!pre.has(e.id)) pre.set(e.id, { ent: e, role: 'Group entity', pct: null });

  const order = { Taxpayer: 0, Parent: 1, Subsidiary: 2, 'Group entity': 3 } as const;
  const sorted = [...pre.values()].sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if ((b.pct ?? -1) !== (a.pct ?? -1)) return (b.pct ?? -1) - (a.pct ?? -1);
    return a.ent.name.localeCompare(b.ent.name);
  });

  return sorted.map((p, i) => ({
    id: `E${i + 1}`,
    chartEntityId: p.ent.id,
    name: p.ent.name,
    jurisdiction: (p.ent.jurisdiction_iso as string | null) ?? null,
    entityType: (p.ent.entity_type as string | null) ?? null,
    role: p.role,
    ownershipPct: p.pct,
    related: p.pct != null && p.pct > RELATED_THRESHOLD,
    nlTaxStatus: null,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/entityRegister.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/facts/entityRegister.ts src/lib/appendix/__tests__/entityRegister.test.ts
git commit -m "feat(appendix): deterministic entity register builder"
```

## Task 3: Acting-together combine math

**Files:**
- Create: `src/lib/appendix/facts/actingTogether.ts`
- Test: `src/lib/appendix/__tests__/actingTogether.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/appendix/__tests__/actingTogether.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { combinedInterest, crossesThreshold } from '@/lib/appendix/facts/actingTogether';
import type { FactEntity } from '@/lib/appendix/types';

const fe = (id: string, pct: number | null): FactEntity =>
  ({ id, chartEntityId: id, name: id, jurisdiction: 'NL', entityType: 'fund',
     role: 'Parent', ownershipPct: pct, related: false, nlTaxStatus: null });

describe('acting-together math', () => {
  it('sums member interests, treating unknowns as 0', () => {
    expect(combinedInterest(['E3', 'E4'], [fe('E3', 33.76), fe('E4', 28.86)])).toBeCloseTo(62.62);
    expect(combinedInterest(['E3', 'E5'], [fe('E3', 10), fe('E5', null)])).toBe(10);
  });
  it('flags when the combined interest crosses 25%', () => {
    expect(crossesThreshold(['E5', 'E6'], [fe('E5', 9.18), fe('E6', 9.74)])).toBe(false);
    expect(crossesThreshold(['E3', 'E4'], [fe('E3', 20), fe('E4', 10)])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/actingTogether.test.ts`
Expected: FAIL (import unresolved).

- [ ] **Step 3: Write the implementation**

Create `src/lib/appendix/facts/actingTogether.ts`:

```ts
import type { FactEntity } from '@/lib/appendix/types';

const RELATED_THRESHOLD = 25;

/** Sum the ownership interests of the given member entity ids; unknown counts as 0. */
export function combinedInterest(memberEntityIds: string[], entities: FactEntity[]): number {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return memberEntityIds.reduce((sum, id) => sum + (byId.get(id)?.ownershipPct ?? 0), 0);
}

/** Does the combined interest of these members cross the >25% related-party threshold? */
export function crossesThreshold(memberEntityIds: string[], entities: FactEntity[]): boolean {
  return combinedInterest(memberEntityIds, entities) > RELATED_THRESHOLD;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/actingTogether.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/facts/actingTogether.ts src/lib/appendix/__tests__/actingTogether.test.ts
git commit -m "feat(appendix): acting-together combine math"
```

## Task 4: Empty-facts factory

**Files:**
- Create: `src/lib/appendix/facts/emptyFacts.ts`
- Test: `src/lib/appendix/__tests__/emptyFacts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/appendix/__tests__/emptyFacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyFacts, normalizeFacts } from '@/lib/appendix/facts/emptyFacts';

describe('facts normalization', () => {
  it('emptyFacts has all four arrays', () => {
    expect(emptyFacts()).toEqual({ entities: [], actingTogether: [], classifications: [], transactions: [] });
  });
  it('normalizeFacts fills missing arrays from partial/legacy data', () => {
    expect(normalizeFacts(null)).toEqual(emptyFacts());
    expect(normalizeFacts({ entities: [{ id: 'E1' }] } as never).actingTogether).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/emptyFacts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Create `src/lib/appendix/facts/emptyFacts.ts`:

```ts
import type { AppendixFacts } from '@/lib/appendix/types';

export function emptyFacts(): AppendixFacts {
  return { entities: [], actingTogether: [], classifications: [], transactions: [] };
}

/** Tolerate null/partial facts loaded from older rows: always return all four arrays. */
export function normalizeFacts(facts: Partial<AppendixFacts> | null | undefined): AppendixFacts {
  return {
    entities: Array.isArray(facts?.entities) ? facts!.entities : [],
    actingTogether: Array.isArray(facts?.actingTogether) ? facts!.actingTogether : [],
    classifications: Array.isArray(facts?.classifications) ? facts!.classifications : [],
    transactions: Array.isArray(facts?.transactions) ? facts!.transactions : [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/emptyFacts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/facts/emptyFacts.ts src/lib/appendix/__tests__/emptyFacts.test.ts
git commit -m "feat(appendix): facts normalization helpers"
```

## Task 5: DB migration — `facts` column

**Files:**
- Create: `supabase/migrations/20260608160000_appendix_facts_column.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260608160000_appendix_facts_column.sql`:

```sql
-- Part A facts block on the appendix. Apply on the VM as supabase_admin. Idempotent.
alter table public.atad2_appendix add column if not exists facts jsonb;
```

- [ ] **Step 2: Apply on the VM**

Create `apply_facts_col.sh` at the repo root:

```sh
set -e
DB=$(docker ps --filter name=supabase-db -q)
docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
alter table public.atad2_appendix add column if not exists facts jsonb;
SQL
docker exec -i "$DB" psql -U supabase_admin -d postgres -t -A -c "select 'has_facts='||count(*) from information_schema.columns where table_name='atad2_appendix' and column_name='facts';"
echo FACTS_COL_DONE
```

Run (PowerShell), then delete `apply_facts_col.sh`:

```
& "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "@apply_facts_col.sh" --query "value[0].message" -o tsv
```
Expected output contains: `has_facts=1` and `FACTS_COL_DONE`.

- [ ] **Step 3: Update the hand-maintained Supabase types**

In `src/integrations/supabase/types.ts`, find the `atad2_appendix` table block and add `facts: Json | null` to `Row`, `facts?: Json | null` to `Insert` and `Update`.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260608160000_appendix_facts_column.sql src/integrations/supabase/types.ts
git commit -m "feat(appendix): facts jsonb column on atad2_appendix (applied)"
```

## Task 6: Load facts on the client

**Files:**
- Modify: `src/lib/appendix/client.ts`
- Test: `src/lib/appendix/__tests__/loadFacts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/appendix/__tests__/loadFacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { coerceFacts } from '@/lib/appendix/client';

describe('coerceFacts', () => {
  it('returns null for null and normalizes objects', () => {
    expect(coerceFacts(null)).toBeNull();
    const f = coerceFacts({ entities: [{ id: 'E1' }] });
    expect(f?.transactions).toEqual([]);
    expect(f?.entities.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/loadFacts.test.ts`
Expected: FAIL (`coerceFacts` not exported).

- [ ] **Step 3: Implement**

In `src/lib/appendix/client.ts`: add the import at the top:

```ts
import { normalizeFacts } from './facts/emptyFacts';
import type { AppendixFacts } from './types';
```

Add the exported helper (near the top, after imports):

```ts
export function coerceFacts(raw: unknown): AppendixFacts | null {
  if (raw == null || typeof raw !== 'object') return null;
  return normalizeFacts(raw as Partial<AppendixFacts>);
}
```

In `loadAppendix`, in the returned object, add:

```ts
    facts: coerceFacts((data as { facts?: unknown }).facts),
```

- [ ] **Step 4: Run tests + build**

Run: `npm run test -- src/lib/appendix/__tests__/loadFacts.test.ts`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/client.ts src/lib/appendix/__tests__/loadFacts.test.ts
git commit -m "feat(appendix): load the facts block with loadAppendix"
```

---

# Phase 2 — Read-only Part A rendering (internal view)

## Task 7: Facts panel component (read-only exhibits)

**Files:**
- Create: `src/components/appendix/FactsPanel.tsx`
- Modify: `src/pages/AssessmentAppendix.tsx`

- [ ] **Step 1: Build the FactsPanel**

Create `src/components/appendix/FactsPanel.tsx`. It renders the four exhibits read-only from `facts` + the deterministic entity register (which it builds from the chart if `facts.entities` is empty, so Part A shows even before Phase 2/3 run). Uses shadcn `Collapsible` (`@/components/ui/collapsible`) for the heavier exhibits.

```tsx
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Users, Network, Layers, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppendixFacts, FactEntity } from '@/lib/appendix/types';

interface Props { facts: AppendixFacts; }

function pct(n: number | null): string {
  return n == null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function nameOf(facts: AppendixFacts, id: string): string {
  return facts.entities.find((e) => e.id === id)?.name ?? id;
}

function Exhibit({ tag, icon, title, defaultOpen = true, children }: {
  tag: string; icon: React.ReactNode; title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[hsl(var(--border-subtle))] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left text-sm font-semibold text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-mono text-xs text-sky-700 dark:text-sky-300">{tag}</span>
        {icon}
        {title}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

export function FactsPanel({ facts }: Props) {
  const entities = facts.entities;
  const related = useMemo(() => entities.filter((e) => e.role !== 'Taxpayer'), [entities]);

  if (!entities.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Part A · Facts &amp; relationships</h3>

      <Exhibit tag="E" icon={<Users className="h-4 w-4 text-muted-foreground" />} title="Entity register">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Entity</th><th className="pr-2">Jur</th>
              <th className="pr-2">Type</th><th className="pr-2">NL tax status</th><th>Role</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id} className="border-t border-[hsl(var(--border-subtle))]">
                <td className="py-1 pr-2 font-mono text-sky-700 dark:text-sky-300">{e.id}</td>
                <td className="pr-2 font-medium text-foreground">{e.name}</td>
                <td className="pr-2 text-muted-foreground">{e.jurisdiction ?? '—'}</td>
                <td className="pr-2 text-muted-foreground">{e.entityType ?? '—'}</td>
                <td className="pr-2 text-muted-foreground">{e.nlTaxStatus ?? '—'}</td>
                <td className="text-muted-foreground">{e.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Exhibit>

      <Exhibit tag="REL" icon={<Network className="h-4 w-4 text-muted-foreground" />} title="Relatedness & acting-together">
        <div className="space-y-1 text-xs">
          {related.map((e: FactEntity) => (
            <div key={e.id} className="flex items-center gap-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', e.related ? 'bg-sky-500' : 'bg-muted-foreground/30')} />
              <span className="font-mono text-sky-700 dark:text-sky-300">{e.id}</span>
              <span className={cn(e.related ? 'font-medium text-foreground' : 'text-muted-foreground')}>{e.name}</span>
              <span className="flex-1" />
              <span className="tabular-nums text-muted-foreground">{pct(e.ownershipPct)}</span>
            </div>
          ))}
        </div>
        {facts.actingTogether.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {facts.actingTogether.filter((a) => a.status !== 'dismissed').map((a) => (
              <div key={a.id} className="rounded border-l-2 border-l-amber-500 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <span className="font-medium">Acting-together {a.status === 'confirmed' ? '(confirmed)' : '(proposed)'}:</span>{' '}
                {a.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ')} ≈ {pct(a.combinedPct)}. {a.rationale}
              </div>
            ))}
          </div>
        )}
      </Exhibit>

      <Exhibit tag="CLS" icon={<Layers className="h-4 w-4 text-muted-foreground" />} title="Classification matrix (home vs source)" defaultOpen={false}>
        {facts.classifications.length === 0
          ? <p className="text-xs text-muted-foreground">Not proposed yet.</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1 pr-2">Entity</th><th className="pr-2">Home</th><th className="pr-2">Source</th><th>Hybrid?</th></tr></thead>
            <tbody>
              {facts.classifications.map((c) => (
                <tr key={c.entityId} className="border-t border-[hsl(var(--border-subtle))]">
                  <td className="py-1 pr-2"><span className="font-mono text-sky-700 dark:text-sky-300">{c.entityId}</span> {nameOf(facts, c.entityId)}</td>
                  <td className="pr-2 text-muted-foreground">{c.homeState}: {c.homeClass}</td>
                  <td className="pr-2 text-muted-foreground">{c.sourceState ? `${c.sourceState}: ${c.sourceClass}` : '—'}</td>
                  <td>{c.hybrid ? <span className="rounded bg-rose-100 px-1 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">mismatch</span> : <span className="text-muted-foreground">aligned</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Exhibit>

      <Exhibit tag="T" icon={<ArrowLeftRight className="h-4 w-4 text-muted-foreground" />} title="Transaction map" defaultOpen={false}>
        {facts.transactions.length === 0
          ? <p className="text-xs text-muted-foreground">Not proposed yet.</p>
          : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1 pr-2">#</th><th className="pr-2">Flow</th><th className="pr-2">Type</th><th className="pr-2">Instrument</th><th>Article(s)</th></tr></thead>
            <tbody>
              {facts.transactions.map((t) => (
                <tr key={t.id} className="border-t border-[hsl(var(--border-subtle))]">
                  <td className="py-1 pr-2 font-mono text-sky-700 dark:text-sky-300">{t.id}</td>
                  <td className="pr-2">{nameOf(facts, t.fromEntityId)} → {nameOf(facts, t.toEntityId)}</td>
                  <td className="pr-2 text-muted-foreground">{t.kind}</td>
                  <td className="pr-2 text-muted-foreground">{t.instrument ?? '—'}</td>
                  <td className="text-muted-foreground">{t.articlesTested.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Exhibit>
    </div>
  );
}
```

- [ ] **Step 2: Verify the collapsible import exists**

Run: `ls src/components/ui/collapsible.tsx` — if it does not exist, the component above does not import it (it uses local `useState`), so no action needed. (The component intentionally avoids the shadcn Collapsible to keep zero new deps.)

- [ ] **Step 3: Render it on the appendix page**

In `src/pages/AssessmentAppendix.tsx`:
- Add import: `import { FactsPanel } from '@/components/appendix/FactsPanel';`
- Add a memo that builds a fallback entity register from the chart when facts are empty. Near the other state, add:

```tsx
import { buildEntityRegister } from '@/lib/appendix/facts/entityRegister';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
```

Add state to hold the chart entities/edges already loaded for related parties (the existing effect calls `loadChart`). Extend that effect to also keep the raw chart:

Replace the existing related-parties effect body so it stores the chart:

```tsx
  const [chart, setChart] = useState<{ entities: Parameters<typeof buildEntityRegister>[0]; edges: Parameters<typeof buildEntityRegister>[1] } | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    loadChart(sessionId)
      .then((c) => { if (!cancelled && c) { setRelatedParties(buildRelatedParties(c.entities, c.edges)); setChart({ entities: c.entities, edges: c.edges }); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);
```

Build the facts to render (prefer stored facts; fall back to the deterministic register). In the render body, before the table:

```tsx
  const factsToShow = useMemo(() => {
    const stored = appendix?.facts;
    if (stored && stored.entities.length) return stored;
    if (chart) return { ...emptyFacts(), entities: buildEntityRegister(chart.entities, chart.edges) };
    return emptyFacts();
  }, [appendix?.facts, chart]);
```

Then render `<FactsPanel facts={factsToShow} />` directly above `<AppendixTable ... />` in the JSX.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/appendix/FactsPanel.tsx src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): render read-only Part A facts exhibits"
```

---

# Phase 3 — AI proposals (CLS, T, acting-together) + review

## Task 8: Facts output schema (edge, zod)

**Files:**
- Create: `supabase/functions/generate-appendix/factsSchemas.ts`

- [ ] **Step 1: Write the schema**

Create `supabase/functions/generate-appendix/factsSchemas.ts`:

```ts
import { z } from "zod";

export const FactsModelOutput = z.object({
  classifications: z.array(z.object({
    entityId: z.string().min(1),
    homeState: z.string(),
    homeClass: z.string(),
    sourceState: z.string().nullable(),
    sourceClass: z.string().nullable(),
    hybrid: z.boolean(),
  })),
  transactions: z.array(z.object({
    fromEntityId: z.string().min(1),
    toEntityId: z.string().min(1),
    kind: z.string(),
    instrument: z.string().nullable(),
    note: z.string().nullable(),
    articlesTested: z.array(z.string()),
  })),
  actingTogether: z.array(z.object({
    memberEntityIds: z.array(z.string().min(1)).min(2),
    combinedPct: z.number().nullable(),
    rationale: z.string(),
  })),
  nlTaxStatusByEntityId: z.record(z.string(), z.string()).optional(),
});
export type FactsModelOutputT = z.infer<typeof FactsModelOutput>;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/generate-appendix/factsSchemas.ts
git commit -m "feat(appendix): facts AI output schema"
```

## Task 9: Facts prompt (DB)

**Files:**
- Create: `supabase/migrations/20260608161000_appendix_facts_prompt.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260608161000_appendix_facts_prompt.sql`. It (a) extends the `atad2_prompts_key_check` constraint to allow `appendix_facts_system` (include EVERY existing key — verify first with `select pg_get_constraintdef(oid) from pg_constraint where conname='atad2_prompts_key_check';`), and (b) inserts the prompt. Body:

```sql
alter table public.atad2_prompts drop constraint if exists atad2_prompts_key_check;
alter table public.atad2_prompts add constraint atad2_prompts_key_check
  check (key in (
    'prefill_stage1_system','prefill_stage2_system','prefill_swarm_system',
    'structure_stage1_initial','structure_stage1_refine',
    'structure_stage2_initial','structure_stage2_refine',
    'memo_system','appendix_system','appendix_facts_system'
  ));

insert into public.atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
values ('appendix_facts_system', 1,
$prompt$You are a senior Dutch international tax specialist establishing the facts for an ATAD2 technical appendix for {{TAXPAYER_NAME}}, financial year {{FISCAL_YEAR}}.

You are given the entity register (each entity has a stable id like E1, with name, jurisdiction, type, role and ownership %), the assessment answers and the structure block. From these, propose three things and nothing else, as JSON:

1. classifications: for each entity that matters for hybridity, how it is treated for tax purposes in its home state vs the relevant counterparty/source state (transparent, opaque or disregarded), and whether that is a mismatch (hybrid=true when home and source differ).
2. transactions: the intra-group flows between related entities that the ATAD2 articles test, each with from/to entity id, kind, instrument, a short note, and which article(s) it triggers (e.g. "12aa(1)(a)").
3. actingTogether: any clusters of entities (two or more, by entity id) that may act together (samenwerkende groep) and so cross the 25% related-party threshold together, with the combined percentage and a one-sentence rationale.
Optionally nlTaxStatusByEntityId: a short Dutch CIT status per entity id where you can infer it.

=== HARD RULES ===
- Use ONLY the entity ids given. Never invent an entity, edge, payment, percentage, jurisdiction or classification not supported by the inputs.
- Reference entities by their id (E1, E2 ...). Where a fact is unknown, omit it rather than guessing.
- Measured, advisory tone. No em-dashes.

=== OUTPUT FORMAT (STRICT) ===
Return ONLY a JSON object: {"classifications":[...],"transactions":[...],"actingTogether":[...],"nlTaxStatusByEntityId":{...}}

=== INPUTS ===
ENTITY_REGISTER:
{{ENTITY_REGISTER}}

ANSWERS_BLOCK:
{{ANSWERS_BLOCK}}

STRUCTURE_BLOCK:
{{STRUCTURE_BLOCK}}$prompt$,
  'claude-sonnet-4-6', 0, 6000, true, 'v1: proposes CLS + transactions + acting-together for Part A.')
on conflict (key) do update set system_prompt = excluded.system_prompt, version = excluded.version, model = excluded.model, notes = excluded.notes;
```

> If `atad2_prompts` has no unique constraint on `key`, replace the `on conflict` tail with a guard: `where not exists (select 1 from atad2_prompts where key='appendix_facts_system')` on the insert. Verify with `\d atad2_prompts` first.

- [ ] **Step 2: Apply on the VM** (same mechanism as Task 5; build an apply script that pipes this file into psql, run via az, verify `select key,version from atad2_prompts where key='appendix_facts_system';`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260608161000_appendix_facts_prompt.sql
git commit -m "feat(appendix): facts proposal prompt (applied)"
```

## Task 10: Edge — build + persist Part A (Phases 1 & 2)

**Files:**
- Modify: `supabase/functions/generate-appendix/index.ts`
- Create (mirror of frontend builders, Deno): `supabase/functions/generate-appendix/factsBuild.ts`

- [ ] **Step 1: Port the deterministic builder to Deno**

Create `supabase/functions/generate-appendix/factsBuild.ts` with a `buildEntityRegister(entities, edges)` whose logic is identical to `src/lib/appendix/facts/entityRegister.ts` but typed against the edge's plain row objects (`{ id, name, is_taxpayer, jurisdiction_iso, entity_type }`, `{ from_entity_id, to_entity_id, ownership_pct }`). Copy the algorithm verbatim, returning the same `FactEntity` shape (define a local interface). Also add a `combinedInterest` identical to `actingTogether.ts`.

- [ ] **Step 2: Load the facts prompt + run Phases 1-2 in `runGeneration`**

In `index.ts`, before the article swarm in `runGeneration`:
1. Load chart entities/edges (extend `loadStructureBlock` or add `loadChartRaw(c, sessionId)` returning `{entities, edges}`).
2. `const entities = buildEntityRegister(rawEntities, rawEdges);`
3. Load the `appendix_facts_system` prompt (reuse `loadAppendixPrompt` parameterized by key, or add `loadPrompt(c, key)`).
4. Fill `{{ENTITY_REGISTER}}` with `JSON.stringify(entities.map(e => ({id,name,jurisdiction,entityType,role,ownershipPct,related})))`, `{{ANSWERS_BLOCK}}`, `{{STRUCTURE_BLOCK}}`.
5. `const proposed = FactsModelOutput.parse(JSON.parse(extractJson((await callWithRetry(() => callClaude({ user }))).text)));` — wrap in try/catch; on failure use empty arrays.
6. Assemble `facts`: entities (with `nlTaxStatus` filled from `proposed.nlTaxStatusByEntityId`), `classifications`/`transactions` mapped with generated ids (`T1..`), `status:'proposed'`, `excludedFromClient:false`, `source:'ai'`; `actingTogether` mapped with ids `A1..`, `status:'proposed'`.
7. Merge with any existing `facts` to preserve advisor confirmations/edits/exclusions: for classifications keyed by `entityId`, transactions/actingTogether keyed by a stable signature (from+to+kind / sorted members) — if the existing item is `confirmed` or `edited`, keep it; else take the fresh proposal. Entities (deterministic) always refreshed but keep any advisor-edited `nlTaxStatus`.
8. Persist: include `facts` in the existing `update(...).eq('id', appendixId)` call that already writes `rows`.

- [ ] **Step 3: Deploy the edge function**

Deploy the changed files to the VM volume `/root/supabase-docker/volumes/functions/generate-appendix/` (base64 method), restart `supabase-edge-functions`, md5-verify host vs container (see the deploy pattern used previously in this repo).

- [ ] **Step 4: Manual verification**

Trigger a Regenerate on a test session; confirm `select facts is not null from atad2_appendix where session_id='<id>';` is true and the panel shows proposed CLS/T.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-appendix/index.ts supabase/functions/generate-appendix/factsBuild.ts
git commit -m "feat(appendix): edge builds + proposes Part A facts (applied)"
```

## Task 11: Review Part A — confirm / edit / exclude

**Files:**
- Modify: `src/lib/appendix/client.ts` (add `saveFacts`)
- Modify: `src/components/appendix/FactsPanel.tsx` (add confirm/edit/exclude controls)
- Modify: `src/pages/AssessmentAppendix.tsx` (handlers)

- [ ] **Step 1: Add `saveFacts` to the client**

In `client.ts`:

```ts
export async function saveFacts(appendixId: string, facts: AppendixFacts): Promise<void> {
  const { error } = await supabase
    .from('atad2_appendix')
    .update({ facts: facts as unknown as never, updated_at: new Date().toISOString() })
    .eq('id', appendixId);
  if (error) throw error;
}
```

- [ ] **Step 2: Add handlers in AssessmentAppendix**

Add `handleFactsChange(next: AppendixFacts)` that sets `appendix` optimistically and calls `saveFacts(appendix.id, next)`. Pass `facts={appendix?.facts ?? factsToShow}` and `onChange={handleFactsChange}` to `FactsPanel` (only when `appendix.facts` exists; the deterministic fallback is read-only).

- [ ] **Step 3: Add minimal controls to FactsPanel**

Make `onChange` optional. For each `classification`/`transaction`/`actingTogether` item, when `onChange` is provided and the item `status !== 'confirmed'`, render a small "Confirm" button (sets `status:'confirmed'`) and an exclude eye toggle (sets `excludedFromClient`). Editing of free-text fields can reuse a small inline input; for the first pass, confirm + exclude + the acting-together accept/dismiss are sufficient (full field editing is a follow-up, noted in §10 of the spec is out of scope for v1 — keep it to confirm/exclude/dismiss).

- [ ] **Step 4: Build + commit**

Run: `npm run build` → PASS.

```bash
git add src/lib/appendix/client.ts src/components/appendix/FactsPanel.tsx src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): review Part A facts (confirm/exclude/dismiss)"
```

---

# Phase 4 — Ground the articles on Part A

## Task 12: Feed Part A into the article generation

**Files:**
- Modify: `supabase/functions/generate-appendix/index.ts`
- Create: `supabase/migrations/20260608162000_appendix_prompt_v5_facts_grounding.sql`

- [ ] **Step 1: Build a facts grounding block in the edge**

In `index.ts`, after Part A is assembled, build `factsBlock` — a compact text summary: the entity register (E#, name, jur, role, %), confirmed/proposed classifications (E#, home vs source, hybrid), transactions (T#, from→to, kind, articles), and acting-together clusters. Add `.replace("{{FACTS_BLOCK}}", factsBlock)` to the per-section `baseFilled` for the article swarm.

- [ ] **Step 2: Add `{{FACTS_BLOCK}}` to the article prompt (v5)**

Migration `20260608162000_appendix_prompt_v5_facts_grounding.sql`: `update ... set version=5, system_prompt = replace(system_prompt, '=== INPUTS ===', '=== ESTABLISHED FACTS (Part A) ===\nReference these by entity name; the ids E#/T# are internal. Do not re-derive them.\n{{FACTS_BLOCK}}\n\n=== INPUTS ===') where key='appendix_system' and system_prompt not like '%ESTABLISHED FACTS%';`

- [ ] **Step 3: Apply migration + deploy edge** (az + base64 deploy + md5 verify).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-appendix/index.ts supabase/migrations/20260608162000_appendix_prompt_v5_facts_grounding.sql
git commit -m "feat(appendix): ground article reasoning on Part A facts (applied)"
```

---

# Phase 5 — Dossier export of Part A

## Task 13: Client export of Part A

**Files:**
- Create: `src/lib/appendix/factsExport.ts`
- Test: `src/lib/appendix/__tests__/factsExport.test.ts`
- Modify: `src/lib/appendix/printAppendix.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/appendix/__tests__/factsExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { factsForClient } from '@/lib/appendix/factsExport';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';

describe('factsForClient', () => {
  it('drops proposed and excluded items', () => {
    const f = { ...emptyFacts(),
      transactions: [
        { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai' },
        { id: 'T2', fromEntityId: 'E1', toEntityId: 'E3', kind: 'fee', instrument: null, note: null, articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai' },
        { id: 'T3', fromEntityId: 'E1', toEntityId: 'E4', kind: 'div', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: true, source: 'ai' },
      ] } as never;
    const out = factsForClient(f);
    expect(out.transactions.map((t) => t.id)).toEqual(['T1']);
  });
});
```

- [ ] **Step 2: Run test (fails), implement, run (passes)**

Create `src/lib/appendix/factsExport.ts`:

```ts
import type { AppendixFacts } from './types';

const keep = <T extends { status?: string; excludedFromClient?: boolean }>(xs: T[]) =>
  xs.filter((x) => x.status !== 'proposed' && !x.excludedFromClient);

/** The clean, client-facing facts: confirmed and non-excluded items only. */
export function factsForClient(facts: AppendixFacts): AppendixFacts {
  return {
    entities: facts.entities,
    actingTogether: facts.actingTogether.filter((a) => a.status === 'confirmed' && !a.excludedFromClient),
    classifications: keep(facts.classifications),
    transactions: keep(facts.transactions),
  };
}
```

Run: `npm run test -- src/lib/appendix/__tests__/factsExport.test.ts` → PASS.

- [ ] **Step 3: Render Part A in the dossier/working-copy print**

In `printAppendix.ts`, add a `facts: AppendixFacts | null` parameter (default null). When present, prepend a "Part A · Facts & relationships" block of HTML tables before the article sections; for `mode==='dossier'` use `factsForClient(facts)` and drop the E#/T# code columns; for `mode==='internal'` show everything. Update the caller in `AssessmentAppendix.tsx` (`handlePrint`) to pass `appendix.facts`.

- [ ] **Step 4: Build + commit**

Run: `npm run build` → PASS.

```bash
git add src/lib/appendix/factsExport.ts src/lib/appendix/__tests__/factsExport.test.ts src/lib/appendix/printAppendix.ts src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): Part A in the dossier and working-copy export"
```

## Task 14: Part A in the memo grounding block + DOCX

**Files:**
- Modify: `src/lib/appendix/buildAppendixBlock.ts`
- Modify: `src/components/DownloadMemoButton.tsx`

- [ ] **Step 1: Extend the memo grounding block**

Add an optional `facts?: AppendixFacts` parameter to `buildAppendixBlock`; when present, prepend a `<facts>` section listing confirmed entities, classifications (hybrids first), transactions and acting-together clusters, using `factsForClient`. Keep the existing `<confirmed_appendix>` rows.

- [ ] **Step 2: Pass facts from DownloadMemoButton**

Where `DownloadMemoButton.tsx` calls `loadAppendix` + builds the appendix for the DOCX, pass `appendix.facts` into the DOCX section builder and (if the DOCX template gains facts tables later) `toAppendixSections`. For v1, include the facts only in the grounding block; the native DOCX facts tables are a follow-up.

- [ ] **Step 3: Build + commit**

Run: `npm run build` → PASS.

```bash
git add src/lib/appendix/buildAppendixBlock.ts src/components/DownloadMemoButton.tsx
git commit -m "feat(appendix): feed Part A facts into the memo grounding block"
```

## Task 15: Full regression

- [ ] **Step 1: Run the whole appendix suite**

Run: `npm run test -- src/lib/appendix/`
Expected: PASS (all existing + new tests).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit any fixes, then stop.**

---

## Notes for the implementer

- **Migrations are applied to the live VM**, not a local DB. Use the az + psql pattern. Each migration file is idempotent. After applying, delete the temporary `apply_*.sh` script (do not commit it).
- **Edge deploys** go to the DASH path `/root/supabase-docker/volumes/functions/generate-appendix/`, then restart the container and md5-verify host vs container. The edge reads facts/prompts from the DB at runtime.
- **Keep the two builder copies in sync** (`src/lib/appendix/facts/entityRegister.ts` and `supabase/functions/generate-appendix/factsBuild.ts`) — the algorithm must match so the frontend fallback and the stored facts agree.
- **Do not push to main** (it is live production). Work stays on `feat/technical-appendix` unless the user asks to deploy the frontend.
