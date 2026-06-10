# Appendix Part A Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the appendix "Part A · Facts & relationships" page into a funnel: summary strip with deterministic conclusion flags, slimmed register with a distinct taxpayer block, related parties + acting-together, AI-marked relevant flows with accounted summaries, and NL + local classification of only the relevant entities, with one editable AI sentence per section.

**Architecture:** Pure-function helpers in `src/lib/appendix/facts/` (relevance, conclusions, narratives) drive both the FactsPanel UI and the print/memo exports, so app and export always agree. The Deno edge function (`generate-appendix`) gains tolerant schema fields (`relevant`, `relevanceReason`, `narratives`) and a v8 prompt; `mergeFacts` preserves advisor flips and edited sentences. Conclusion flags are computed, never stored.

**Tech Stack:** React + Vite + TS, Tailwind, shadcn/ui, Vitest (`npm run test -- src/lib/ --run`), Deno edge function on self-hosted Supabase, SQL migrations applied on the VM.

**Working directory: `C:\Users\adn356\worktrees\atad2-appendix` (branch `feat/technical-appendix`).** Do NOT touch the main folder (it has a different branch checked out). Build gate is `npm run build` + the Vitest suite; there is no tsc gate. Do not push. The controller deploys the edge function + migration (Tasks 9-10) after the user re-activates PIM.

**Spec:** `docs/superpowers/specs/2026-06-09-appendix-facts-funnel-design.md` (approved).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/appendix/types.ts` (modify) | `TransactionItem.relevant/relevanceReason`, `Narrative`, `NarrativeKey`, `AppendixFacts.narratives` |
| `src/lib/appendix/facts/relevance.ts` (create) | relevant/accounted split + advisor flip |
| `src/lib/appendix/facts/conclusions.ts` (create) | deterministic conclusion flags + section-4 entity scope |
| `src/lib/appendix/facts/narratives.ts` (create) | narrative setter + key labels |
| `src/lib/appendix/facts/emptyFacts.ts` (modify) | `normalizeFacts` carries `narratives` |
| `src/lib/appendix/factsExport.ts` (modify) | client export keeps only likely+ acting-together clusters |
| `src/components/appendix/FactsPanel.tsx` (modify) | funnel layout: strip + 4 sections, quiet-edit cells, accounted lines, narrative lines |
| `src/lib/appendix/printAppendix.ts` (modify) | Part A export mirrors the funnel |
| `src/lib/appendix/buildAppendixBlock.ts` (modify) | memo facts summary: relevant flows + accounted counts + conclusions |
| `supabase/functions/generate-appendix/factsSchemas.ts` (modify) | tolerant `relevant`/`relevanceReason`/`narratives` |
| `supabase/functions/generate-appendix/factsBuild.ts` (modify) | mirror types |
| `supabase/functions/generate-appendix/index.ts` (modify) | buildFacts mapping, mergeFacts preservation |
| `supabase/migrations/20260610090000_appendix_facts_prompt_v8_funnel.sql` (create) | prompt v8 |

---

### Task 1: Types + narratives helper

**Files:**
- Modify: `src/lib/appendix/types.ts`
- Modify: `src/lib/appendix/facts/emptyFacts.ts`
- Create: `src/lib/appendix/facts/narratives.ts`
- Test: `src/lib/appendix/__tests__/narratives.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/appendix/__tests__/narratives.test.ts
import { describe, it, expect } from 'vitest';
import { withNarrative, NARRATIVE_KEYS } from '@/lib/appendix/facts/narratives';
import { normalizeFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts } from '@/lib/appendix/types';

const base = (): AppendixFacts => ({
  entities: [], actingTogether: [], classifications: [], transactions: [],
  narratives: { register: { text: 'AI intro.', source: 'ai' } },
});

describe('narratives', () => {
  it('has the four funnel keys in order', () => {
    expect(NARRATIVE_KEYS).toEqual(['register', 'related', 'flows', 'classification']);
  });

  it('withNarrative sets text and marks the key edited, leaving others alone', () => {
    const next = withNarrative(base(), 'register', 'My text.');
    expect(next.narratives?.register).toEqual({ text: 'My text.', source: 'edited' });
    const other = withNarrative(base(), 'flows', 'Flows intro.');
    expect(other.narratives?.flows).toEqual({ text: 'Flows intro.', source: 'edited' });
    expect(other.narratives?.register).toEqual({ text: 'AI intro.', source: 'ai' });
  });

  it('normalizeFacts carries narratives and tolerates their absence', () => {
    expect(normalizeFacts(base()).narratives?.register?.text).toBe('AI intro.');
    expect(normalizeFacts({ entities: [] }).narratives).toBeUndefined();
    expect(normalizeFacts(null).narratives).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/narratives.test.ts --run`
Expected: FAIL (cannot resolve `facts/narratives`, `narratives` missing on types).

- [ ] **Step 3: Implement**

In `src/lib/appendix/types.ts`, extend `TransactionItem` (after `articlesTested`):

```ts
  /** AI-proposed funnel relevance; advisor can flip it. Missing = relevant. */
  relevant?: boolean;
  /** Short AI reason why this flow is (not) relevant for ATAD2. */
  relevanceReason?: string | null;
```

After `AppendixSectionKey`, add:

```ts
/** One connective sentence per funnel section; AI-drafted, advisor-editable. */
export interface Narrative {
  text: string;
  source: 'ai' | 'edited';
}

export type NarrativeKey = 'register' | 'related' | 'flows' | 'classification';
```

Extend `AppendixFacts` (after `excludedSections`):

```ts
  /** Per-section connective sentences (max ~2 sentences each). */
  narratives?: Partial<Record<NarrativeKey, Narrative>>;
```

Create `src/lib/appendix/facts/narratives.ts`:

```ts
import type { AppendixFacts, NarrativeKey } from '@/lib/appendix/types';

/** Funnel section order; matches the FactsPanel and export layout. */
export const NARRATIVE_KEYS: readonly NarrativeKey[] = ['register', 'related', 'flows', 'classification'];

/** Hand-edit a section sentence; an edited sentence survives regeneration. */
export function withNarrative(facts: AppendixFacts, key: NarrativeKey, text: string): AppendixFacts {
  return { ...facts, narratives: { ...facts.narratives, [key]: { text, source: 'edited' } } };
}
```

In `src/lib/appendix/facts/emptyFacts.ts`, extend `normalizeFacts`'s returned object (after the `excludedSections` spread):

```ts
    ...(facts?.narratives && typeof facts.narratives === 'object' ? { narratives: facts.narratives } : {}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/narratives.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/types.ts src/lib/appendix/facts/narratives.ts src/lib/appendix/facts/emptyFacts.ts src/lib/appendix/__tests__/narratives.test.ts
git commit -m "feat(appendix): narrative + transaction-relevance types"
```

---

### Task 2: Relevance helpers

**Files:**
- Create: `src/lib/appendix/facts/relevance.ts`
- Test: `src/lib/appendix/__tests__/relevance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/appendix/__tests__/relevance.test.ts
import { describe, it, expect } from 'vitest';
import {
  isTransactionRelevant, relevantTransactions, accountedTransactionGroups, withTransactionRelevance,
} from '@/lib/appendix/facts/relevance';
import type { AppendixFacts, TransactionItem } from '@/lib/appendix/types';

const tx = (id: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id, fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});

const facts = (transactions: TransactionItem[]): AppendixFacts => ({
  entities: [], actingTogether: [], classifications: [], transactions,
});

describe('relevance', () => {
  it('treats a missing relevant flag as relevant (old sessions)', () => {
    expect(isTransactionRelevant(tx('T1'))).toBe(true);
    expect(isTransactionRelevant(tx('T2', { relevant: false }))).toBe(false);
  });

  it('splits relevant vs accounted, grouping accounted by reason', () => {
    const f = facts([
      tx('T1', { relevant: true, relevanceReason: 'Cross-border to a related party' }),
      tx('T2', { relevant: false, relevanceReason: 'Within the fiscal unity' }),
      tx('T3', { relevant: false, relevanceReason: 'Within the fiscal unity' }),
      tx('T4', { relevant: false, relevanceReason: null }),
    ]);
    expect(relevantTransactions(f).map((t) => t.id)).toEqual(['T1']);
    const groups = accountedTransactionGroups(f);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ reason: 'Within the fiscal unity' });
    expect(groups[0].transactions.map((t) => t.id)).toEqual(['T2', 'T3']);
    expect(groups[1].reason).toBe('Assessed as not relevant');
  });

  it('withTransactionRelevance flips the flag and marks the item edited', () => {
    const f = facts([tx('T1', { relevant: true })]);
    const next = withTransactionRelevance(f, 'T1', false);
    expect(next.transactions[0]).toMatchObject({ relevant: false, source: 'edited' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/relevance.test.ts --run`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/appendix/facts/relevance.ts`**

```ts
import type { AppendixFacts, TransactionItem } from '@/lib/appendix/types';

/** Missing flag = relevant: the safe default for old sessions and partial AI output. */
export function isTransactionRelevant(t: TransactionItem): boolean {
  return t.relevant !== false;
}

export function relevantTransactions(facts: AppendixFacts): TransactionItem[] {
  return facts.transactions.filter(isTransactionRelevant);
}

export interface AccountedGroup {
  reason: string;
  transactions: TransactionItem[];
}

const FALLBACK_REASON = 'Assessed as not relevant';

/** Non-relevant transactions grouped by reason, insertion-ordered, for the accounted summary lines. */
export function accountedTransactionGroups(facts: AppendixFacts): AccountedGroup[] {
  const groups = new Map<string, TransactionItem[]>();
  for (const t of facts.transactions) {
    if (isTransactionRelevant(t)) continue;
    const reason = t.relevanceReason?.trim() || FALLBACK_REASON;
    const arr = groups.get(reason) ?? [];
    arr.push(t);
    groups.set(reason, arr);
  }
  return [...groups.entries()].map(([reason, transactions]) => ({ reason, transactions }));
}

/** Advisor flips a relevance marking; the flip survives regeneration via mergeFacts. */
export function withTransactionRelevance(facts: AppendixFacts, id: string, relevant: boolean): AppendixFacts {
  return {
    ...facts,
    transactions: facts.transactions.map((t) =>
      t.id === id ? { ...t, relevant, source: 'edited' } : t,
    ),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/relevance.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/facts/relevance.ts src/lib/appendix/__tests__/relevance.test.ts
git commit -m "feat(appendix): transaction relevance split + advisor flip"
```

---

### Task 3: Conclusion flags + section-4 scope

**Files:**
- Create: `src/lib/appendix/facts/conclusions.ts`
- Test: `src/lib/appendix/__tests__/conclusions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/appendix/__tests__/conclusions.test.ts
import { describe, it, expect } from 'vitest';
import { deriveConclusions, inScopeEntityIds, localQualification } from '@/lib/appendix/facts/conclusions';
import type { AppendixFacts, FactEntity, TransactionItem, ClassificationItem } from '@/lib/appendix/types';

const ent = (id: string, patch: Partial<FactEntity> = {}): FactEntity => ({
  id, chartEntityId: `c-${id}`, name: id, jurisdiction: 'NL', entityType: 'corporation',
  role: 'Group entity', ownershipPct: null, related: true, nlTaxStatus: 'resident', ...patch,
});
const tx = (id: string, from: string, to: string, patch: Partial<TransactionItem> = {}): TransactionItem => ({
  id, fromEntityId: from, toEntityId: to, kind: 'loan', instrument: null, note: null,
  articlesTested: [], status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});
const cls = (entityId: string, patch: Partial<ClassificationItem> = {}): ClassificationItem => ({
  entityId, homeState: 'US', homeClass: 'opaque', sourceState: 'NL', sourceClass: 'opaque',
  hybrid: false, status: 'proposed', excludedFromClient: false, source: 'ai', ...patch,
});
const facts = (p: Partial<AppendixFacts>): AppendixFacts => ({
  entities: [], actingTogether: [], classifications: [], transactions: [], ...p,
});

describe('deriveConclusions', () => {
  it('counts cross-border relevant flows only (both jurisdictions known and different)', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { jurisdiction: 'US' }), ent('E3'), ent('E4', { jurisdiction: null })],
      transactions: [
        tx('T1', 'E1', 'E2'),                      // NL -> US, relevant by default: counts
        tx('T2', 'E1', 'E3'),                      // NL -> NL: no
        tx('T3', 'E1', 'E2', { relevant: false }), // cross-border but not relevant: no
        tx('T4', 'E1', 'E4'),                      // unknown jurisdiction: no
      ],
    });
    expect(deriveConclusions(f).crossBorderRelatedFlows).toBe(1);
  });

  it('counts hybrid differences from the hybrid flag and from NL-vs-local divergence, deduped per entity', () => {
    const f = facts({
      entities: [
        ent('E1', { role: 'Taxpayer' }),
        ent('E2', { nlTaxStatus: 'transparent' }), // NL: transparent; local opaque -> divergence
        ent('E3'),                                 // NL: non-transparent; local opaque -> no divergence
      ],
      classifications: [
        cls('E2', { homeClass: 'opaque' }),
        cls('E2', { hybrid: true }),               // same entity: still 1
        cls('E3'),
      ],
    });
    expect(deriveConclusions(f).hybridDifferences).toBe(1);
  });

  it('counts likely+ acting-together clusters that are not excluded', () => {
    const f = facts({
      actingTogether: [
        { id: 'A1', memberEntityIds: ['E1', 'E2'], combinedPct: 30, likelihood: 'likely', reasoning: '', excludedFromClient: false, source: 'ai' },
        { id: 'A2', memberEntityIds: ['E1', 'E3'], combinedPct: 30, likelihood: 'highly_likely', reasoning: '', excludedFromClient: true, source: 'ai' },
        { id: 'A3', memberEntityIds: ['E2', 'E3'], combinedPct: 30, likelihood: 'unlikely', reasoning: '', excludedFromClient: false, source: 'ai' },
      ],
    });
    expect(deriveConclusions(f).likelyActingTogether).toBe(1);
  });
});

describe('inScopeEntityIds', () => {
  it('includes the taxpayer, parties to relevant flows, and hybrid-flagged entities; nothing else', () => {
    const f = facts({
      entities: [ent('E1', { role: 'Taxpayer' }), ent('E2', { jurisdiction: 'US' }), ent('E3'), ent('E4')],
      transactions: [tx('T1', 'E1', 'E2'), tx('T2', 'E1', 'E3', { relevant: false })],
      classifications: [cls('E4', { hybrid: true })],
    });
    expect([...inScopeEntityIds(f)].sort()).toEqual(['E1', 'E2', 'E4']);
  });
});

describe('localQualification', () => {
  it('maps the free-form homeClass to a qualification', () => {
    expect(localQualification('transparent')).toBe('transparent');
    expect(localQualification('Opaque')).toBe('non-transparent');
    expect(localQualification('disregarded')).toBe('undetermined');
    expect(localQualification(null)).toBe('undetermined');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/conclusions.test.ts --run`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/appendix/facts/conclusions.ts`**

```ts
import type { AppendixFacts } from '@/lib/appendix/types';
import { visibleFacts } from './visibleFacts';
import { effJurisdiction, effNlTaxStatus } from './entityFields';
import { nlQualification, type NlQualification } from './nlTaxStatus';
import { relevantTransactions } from './relevance';

/**
 * The deterministic summary-strip flags. Computed from the facts, never stored
 * and never written by the model: the wording around them may be AI, the
 * numbers may not.
 */
export interface ConclusionFlags {
  crossBorderRelatedFlows: number;
  hybridDifferences: number;
  likelyActingTogether: number;
}

/** Map the model's free-form local classification to the NL qualification vocabulary. */
export function localQualification(homeClass: string | null | undefined): NlQualification {
  const c = (homeClass ?? '').trim().toLowerCase();
  if (c === 'transparent') return 'transparent';
  if (c === 'opaque' || c === 'non-transparent') return 'non-transparent';
  return 'undetermined';
}

export function deriveConclusions(facts: AppendixFacts): ConclusionFlags {
  const f = visibleFacts(facts);
  const byId = new Map(f.entities.map((e) => [e.id, e]));

  const crossBorderRelatedFlows = relevantTransactions(f).filter((t) => {
    const from = byId.get(t.fromEntityId);
    const to = byId.get(t.toEntityId);
    const a = from ? effJurisdiction(from) : null;
    const b = to ? effJurisdiction(to) : null;
    return !!a && !!b && a !== b;
  }).length;

  // One count per entity: flagged hybrid by the model, or NL view vs local view
  // both determined and different.
  const hybridIds = new Set<string>();
  for (const c of f.classifications) {
    if (c.excludedFromClient) continue;
    if (c.hybrid) { hybridIds.add(c.entityId); continue; }
    const e = byId.get(c.entityId);
    if (!e) continue;
    const nl = nlQualification(effNlTaxStatus(e));
    const local = localQualification(c.homeClass);
    if (nl !== 'undetermined' && local !== 'undetermined' && nl !== local) hybridIds.add(c.entityId);
  }

  const likelyActingTogether = f.actingTogether.filter(
    (a) => !a.excludedFromClient && (a.likelihood === 'likely' || a.likelihood === 'highly_likely'),
  ).length;

  return { crossBorderRelatedFlows, hybridDifferences: hybridIds.size, likelyActingTogether };
}

/**
 * Section 4 scope: the taxpayer (and a fiscal-unity head), every party to a
 * relevant transaction, and every entity with a hybrid-flagged classification.
 */
export function inScopeEntityIds(facts: AppendixFacts): Set<string> {
  const f = visibleFacts(facts);
  const ids = new Set<string>();
  for (const e of f.entities) {
    if (e.role === 'Taxpayer' || e.isFiscalUnity) ids.add(e.id);
  }
  for (const t of relevantTransactions(f)) {
    ids.add(t.fromEntityId);
    ids.add(t.toEntityId);
  }
  for (const c of f.classifications) {
    if (!c.excludedFromClient && c.hybrid) ids.add(c.entityId);
  }
  // Only ids that still exist in the register.
  const known = new Set(f.entities.map((e) => e.id));
  return new Set([...ids].filter((id) => known.has(id)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/conclusions.test.ts --run`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/facts/conclusions.ts src/lib/appendix/__tests__/conclusions.test.ts
git commit -m "feat(appendix): deterministic conclusion flags + section-4 scope"
```

---

### Task 4: Client export keeps only likely+ acting-together

**Files:**
- Modify: `src/lib/appendix/factsExport.ts`
- Test: `src/lib/appendix/__tests__/factsExport.test.ts` (extend)

- [ ] **Step 1: Add the failing test** (append a new `describe` to the existing file; keep existing tests untouched)

```ts
describe('acting-together export rule', () => {
  const cluster = (id: string, likelihood: string, excluded = false) => ({
    id, memberEntityIds: ['E1', 'E2'], combinedPct: 30, likelihood, reasoning: 'r',
    excludedFromClient: excluded, source: 'ai',
  });
  it('keeps only likely and highly_likely clusters for the client', () => {
    const facts = {
      entities: [], classifications: [], transactions: [],
      actingTogether: [
        cluster('A1', 'highly_unlikely'), cluster('A2', 'unlikely'), cluster('A3', 'unclear'),
        cluster('A4', 'likely'), cluster('A5', 'highly_likely'), cluster('A6', 'likely', true),
      ],
    } as never;
    expect(factsForClient(facts).actingTogether.map((a) => a.id)).toEqual(['A4', 'A5']);
  });
});
```

(Import `describe/it/expect` and `factsForClient` are already imported at the top of the existing test file; reuse them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/factsExport.test.ts --run`
Expected: the new test FAILS (A1-A3 still included).

- [ ] **Step 3: Implement** in `src/lib/appendix/factsExport.ts`, replace the `actingTogether` line in `factsForClient`:

```ts
    // Only clusters the advisor left at likely or higher reach the client; the
    // rest is summarized in the accounted line (spec: funnel design, section C).
    actingTogether: f.actingTogether.filter(
      (a) => !a.excludedFromClient && (a.likelihood === 'likely' || a.likelihood === 'highly_likely'),
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/factsExport.test.ts --run`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/factsExport.ts src/lib/appendix/__tests__/factsExport.test.ts
git commit -m "feat(appendix): client export keeps only likely+ acting-together clusters"
```

---

### Task 5: Edge function - tolerant schema + mapping + merge preservation

**Files:**
- Modify: `supabase/functions/generate-appendix/factsSchemas.ts`
- Modify: `supabase/functions/generate-appendix/factsBuild.ts`
- Modify: `supabase/functions/generate-appendix/index.ts`

No Deno test runner is configured in this repo; the gate is `npm run build` (the edge files are excluded from Vite, so the real verification is Task 10's deploy smoke test). Be precise.

- [ ] **Step 1: factsSchemas.ts** - extend the `transactions` item object with:

```ts
    relevant: z.boolean().nullish(),
    relevanceReason: z.string().nullish(),
```

and add to the top-level `FactsModelOutput` object (after `fiscalUnityMemberEntityIds`):

```ts
  // One connective sentence per funnel section (register, related, flows,
  // classification). All optional: a missing sentence renders as table-only.
  narratives: z.object({
    register: z.string().nullish(),
    related: z.string().nullish(),
    flows: z.string().nullish(),
    classification: z.string().nullish(),
  }).partial().nullish(),
```

- [ ] **Step 2: factsBuild.ts** - mirror the frontend types. In the `TransactionItem` interface add:

```ts
  relevant?: boolean;
  relevanceReason?: string | null;
```

Add next to the other interfaces:

```ts
export interface Narrative { text: string; source: "ai" | "edited"; }
export type NarrativeKey = "register" | "related" | "flows" | "classification";
```

In the `AppendixFacts` interface add:

```ts
  narratives?: Partial<Record<NarrativeKey, Narrative>>;
```

- [ ] **Step 3: index.ts - buildFacts mapping.** In the success-path `facts` object inside `buildFacts`:

In the `transactions:` map callback, add to the returned object (after `articlesTested`):

```ts
        relevant: t.relevant ?? true,
        relevanceReason: t.relevanceReason ?? null,
```

After the `actingTogether:` array in the same object literal, add:

```ts
      narratives: (() => {
        const src = proposed.narratives ?? {};
        const out: Partial<Record<NarrativeKey, Narrative>> = {};
        for (const k of ["register", "related", "flows", "classification"] as const) {
          const text = src[k];
          if (typeof text === "string" && text.trim()) out[k] = { text: text.trim(), source: "ai" };
        }
        return Object.keys(out).length ? out : undefined;
      })(),
```

Import `Narrative` and `NarrativeKey` from `./factsBuild.ts` in the existing import block.

- [ ] **Step 4: index.ts - mergeFacts preservation.** The existing transaction merge (keyed `from|to|kind`, returns `prev` whole when edited/confirmed) already preserves a flipped `relevant`/`relevanceReason` because the whole `prev` object is kept. Two additions are required:

(a) Narratives: before the final `return renumberFacts(...)` in `mergeFacts`, add:

```ts
  // An edited sentence survives; the rest refreshes from the new AI output.
  const exNarr = existing.narratives ?? {};
  const narratives: typeof fresh.narratives = { ...fresh.narratives };
  for (const k of ["register", "related", "flows", "classification"] as const) {
    const prev = exNarr[k];
    if (prev?.source === "edited") narratives[k] = prev;
  }
```

(b) Carry-through: make the merged result keep `excludedSections` and the merged narratives. Update the final return of `mergeFacts` to:

```ts
  return renumberFacts({
    entities, classifications, transactions, actingTogether,
    excludedSections: existing.excludedSections,
    narratives: Object.keys(narratives ?? {}).length ? narratives : undefined,
  });
```

Then check `renumberFacts`: it must spread unknown top-level fields through (it renumbers ids only). If it builds a fresh object field-by-field, change it to start from `{ ...facts }` and overwrite the four arrays, so `excludedSections`/`narratives` pass through unchanged. Also verify the `if (!existing) return renumberFacts(fresh)` early path needs no change (fresh already carries its own narratives).

- [ ] **Step 5: Build still green (frontend untouched but catches accidental imports)**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-appendix/factsSchemas.ts supabase/functions/generate-appendix/factsBuild.ts supabase/functions/generate-appendix/index.ts
git commit -m "feat(appendix-edge): relevance + narratives in facts schema, mapping and merge"
```

---

### Task 6: Prompt v8 migration

**Files:**
- Create: `supabase/migrations/20260610090000_appendix_facts_prompt_v8_funnel.sql`

- [ ] **Step 1: Write the migration.** Copy the FULL v7 prompt text from `supabase/migrations/20260609200300_appendix_facts_prompt_v7_no_answers.sql` and apply exactly these edits (everything else stays identical):

1. Header comment + `version = 8` + notes string.
2. In numbered item **4. transactions**, replace the whole item with:

```
4. transactions: the intra-group flows between related entities that the ATAD2 articles test, each with from/to entity id, kind, instrument, a short note, and which article(s) it triggers (e.g. "12aa(1)(a)"). For EACH transaction also return:
   - relevant (boolean): whether this flow matters for the ATAD2 assessment. A flow is relevant when it runs between the taxpayer (the fiscal unity as a whole) and a related party or a likely acting-together group, and cross-border character weighs heavily. A flow strictly inside the Dutch fiscal unity (between E1 and its fiscal-unity members, or between two members) is NOT relevant: it occurs within the same taxpayer. A purely domestic flow between two Dutch non-transparent entities is normally not relevant either.
   - relevanceReason: ONE short sentence stating why the flow is or is not relevant (e.g. "Within the fiscal unity, same taxpayer." or "Cross-border interest payment to a related party."). Keep reasons consistent so equal cases share the same wording.
```

3. After numbered item **5. classifications**, add:

```
6. narratives: an object with one SHORT connective sentence (maximum two) for each of the four sections of the facts annex, keys "register", "related", "flows", "classification". Each sentence introduces what the section shows for THIS group, in measured advisory prose (e.g. "The group consists of twelve entities in four jurisdictions; the taxpayer is the Dutch fiscal unity headed by X."). State facts only; never draw the legal conclusion in these sentences. No em-dashes.
```

4. In `=== OUTPUT FORMAT (STRICT) ===`, replace the JSON shape line with:

```
Return ONLY a JSON object: {"nlTaxStatusByEntityId":{...},"fiscalUnityMemberEntityIds":[...],"actingTogether":[{"memberEntityIds":[...],"combinedPct":..,"likelihood":"..","rationales":{...}}],"transactions":[{"fromEntityId":"..","toEntityId":"..","kind":"..","instrument":"..","note":"..","articlesTested":[...],"relevant":true,"relevanceReason":".."}],"classifications":[...],"narratives":{"register":"..","related":"..","flows":"..","classification":".."}}
```

(Note: if the v7 OUTPUT FORMAT line does not mention `rationales`, keep the v7 acting-together shape as-is and only add the transactions fields + narratives. Follow the actual v7 file.)

Use the same non-destructive UPDATE pattern:

```sql
update public.atad2_prompts set
  version = 8,
  system_prompt = $prompt$ ... full v8 text ... $prompt$,
  notes = 'v8: per-transaction funnel relevance (relevant + relevanceReason) and per-section narrative sentences. Otherwise identical to v7.'
where key = 'appendix_facts_system' and is_active = true;
```

- [ ] **Step 2: Sanity-check the file** - confirm the prompt body contains `relevanceReason` and `narratives`, contains no em-dashes and no `{{ANSWERS_BLOCK}}`:

Run: `grep -c "relevanceReason\|narratives" supabase/migrations/20260610090000_appendix_facts_prompt_v8_funnel.sql` (expect >= 2) and `grep -c "ANSWERS_BLOCK" supabase/migrations/20260610090000_appendix_facts_prompt_v8_funnel.sql` (expect 0, header comment excepted).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610090000_appendix_facts_prompt_v8_funnel.sql
git commit -m "feat(appendix-edge): facts prompt v8 (relevance + narratives)"
```

---

### Task 7: FactsPanel funnel restructure

**Files:**
- Modify: `src/components/appendix/FactsPanel.tsx`

This is a UI task; the suite gate is `npm run build` + all existing `src/lib` tests staying green (FactsPanel has no unit tests). Keep every existing capability: hide entity, restore hidden, section exclude, per-item exclude/confirm, jurisdiction/type/NL-status editing, acting-together likelihood + text editing.

- [ ] **Step 1: New imports and helpers.** Add to the imports:

```ts
import { deriveConclusions, inScopeEntityIds, localQualification } from '@/lib/appendix/facts/conclusions';
import { relevantTransactions, accountedTransactionGroups, withTransactionRelevance, isTransactionRelevant } from '@/lib/appendix/facts/relevance';
import { withNarrative } from '@/lib/appendix/facts/narratives';
import type { NarrativeKey, Narrative } from '@/lib/appendix/types';
```

- [ ] **Step 2: Add three small components** (place them next to `ExcludeBtn`):

```tsx
/** One connective AI sentence under a section title; click to edit. */
function NarrativeLine({ narrative, onSave }: { narrative?: Narrative; onSave?: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (!narrative?.text && !editing) return null;
  if (editing && onSave) {
    return (
      <textarea
        autoFocus
        defaultValue={narrative?.text ?? ''}
        rows={2}
        onBlur={(e) => { setEditing(false); onSave(e.target.value.trim()); }}
        className="mb-2 w-full resize-y rounded border border-[hsl(var(--border-subtle))] bg-white/70 px-2 py-1 text-[11.5px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400"
      />
    );
  }
  return (
    <p
      className={cn('mb-2 text-[11.5px] leading-relaxed text-muted-foreground', onSave && 'cursor-text hover:text-foreground')}
      title={onSave ? 'Click to edit' : undefined}
      onClick={onSave ? () => setEditing(true) : undefined}
    >
      {narrative?.text}
    </p>
  );
}

/** "N items fell out of the funnel, because X" - expandable accounting line. */
function AccountedLine({ summary, children }: { summary: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-md border border-dashed border-[hsl(var(--border-subtle))] px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <button type="button" className="flex w-full items-center gap-1.5 text-left" onClick={() => setOpen((o) => !o)} disabled={!children}>
        {children ? (open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />) : null}
        <span>{summary}</span>
      </button>
      {open && children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

/** Quiet display text that swaps to its editor on click (register cells). */
function QuietCell({ display, editing, onStartEdit, children }: {
  display: ReactNode; editing: boolean; onStartEdit?: () => void; children: ReactNode;
}) {
  if (editing) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onStartEdit}
      disabled={!onStartEdit}
      className={cn('inline-flex max-w-full items-center gap-1.5 truncate text-left', onStartEdit && 'hover:underline decoration-dotted underline-offset-2')}
      title={onStartEdit ? 'Click to edit' : undefined}
    >
      {display}
    </button>
  );
}
```

- [ ] **Step 3: Summary strip.** Inside `FactsPanel`, after `sectionProps`, compute:

```ts
  const flags = useMemo(() => deriveConclusions(facts), [facts]);
  const inScope = useMemo(() => inScopeEntityIds(facts), [facts]);
  const narrative = (key: NarrativeKey) => facts.narratives?.[key];
  const saveNarrative = editable ? (key: NarrativeKey) => (text: string) => onChange!(withNarrative(facts, key, text)) : undefined;
```

Replace the `<h3>Part A · Facts & relationships</h3>` heading block with the heading plus strip:

```tsx
      <h3 className="text-sm font-semibold text-foreground">Part A · Facts &amp; relationships</h3>

      <div className="rounded-lg border border-[hsl(var(--border-subtle))] px-3 py-2.5">
        <table className="w-full text-xs">
          <tbody>
            <tr>
              <td className="py-0.5 pr-2 text-muted-foreground">Cross-border flows with related parties</td>
              <td className="py-0.5 text-right font-medium text-foreground">
                {flags.crossBorderRelatedFlows > 0 ? `${flags.crossBorderRelatedFlows} identified` : 'None identified'}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 text-muted-foreground">Hybrid qualification differences (NL vs local)</td>
              <td className="py-0.5 text-right font-medium text-foreground">
                {flags.hybridDifferences > 0 ? `${flags.hybridDifferences} identified` : 'None identified'}
              </td>
            </tr>
            <tr>
              <td className="py-0.5 pr-2 text-muted-foreground">Acting-together group considered likely</td>
              <td className="py-0.5 text-right font-medium text-foreground">
                {flags.likelyActingTogether > 0 ? `${flags.likelyActingTogether} ${flags.likelyActingTogether === 1 ? 'cluster' : 'clusters'}` : 'None'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
```

- [ ] **Step 4: Section 1 - register.** Keep the existing `Exhibit tag="E"` but: title becomes `"1 · The group and the taxpayer"`; directly inside it render `<NarrativeLine narrative={narrative('register')} onSave={saveNarrative?.('register')} />`. Sort the rows so the taxpayer block comes first and tint it. Replace `shown.entities.map(...)` with a two-group render:

```tsx
        {(() => {
          const isTaxGroup = (e: FactEntity) => e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
          const groups: Array<{ label: string | null; rows: FactEntity[]; tint: boolean }> = [
            { label: 'The taxpayer', rows: shown.entities.filter(isTaxGroup), tint: true },
            { label: 'Other group entities', rows: shown.entities.filter((e) => !isTaxGroup(e)), tint: false },
          ];
          return groups.filter((g) => g.rows.length).map((g) => (
            <tbody key={g.label}>
              <tr><td colSpan={editable ? 7 : 6} className="pt-2 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{g.label}</td></tr>
              {g.rows.map((e) => ( /* existing row JSX, with the changes in Step 5, plus on the <tr>: */
                /* className={cn('border-t border-[hsl(var(--border-subtle))] align-middle', g.tint && 'bg-sky-50/50 dark:bg-sky-950/20')} */
                null
              ))}
            </tbody>
          ));
        })()}
```

(The row JSX itself is the existing one; only the wrapper/two-group split and the tint class are new. Keep one `<table>`; the groups are sibling `<tbody>` elements.)

- [ ] **Step 5: Quiet-edit register cells.** Add state `const [editCell, setEditCell] = useState<{ id: string; field: 'jurisdiction' | 'entityType' | 'nlTaxStatus' } | null>(null);`. For each of the three cells, wrap the existing control in `QuietCell` so the dropdown only renders for the cell being edited:

Jurisdiction cell becomes:

```tsx
                  <td className="pr-2 py-0.5">
                    <QuietCell
                      editing={editable && editCell?.id === e.id && editCell.field === 'jurisdiction'}
                      onStartEdit={editable ? () => setEditCell({ id: e.id, field: 'jurisdiction' }) : undefined}
                      display={<span className={cn('flex items-center gap-1.5', muted)}>{jur ? <><CountryFlag iso={jur} /> {countryName(jur) || jur}</> : 'Set…'}</span>}
                    >
                      <JurisdictionPicker
                        value={jur ?? ''}
                        onChange={(iso) => { setEditCell(null); onChange!(withEntityEdit(facts, e.id, 'jurisdiction', iso || null)); }}
                        className={COMPACT_CONTROL}
                        placeholder="Set…"
                      />
                    </QuietCell>
                  </td>
```

Apply the same pattern to Type and NL tax status (the `Select` moves inside `QuietCell`, its `onValueChange` first calls `setEditCell(null)`; the quiet display is the existing text span). The fiscal-unity Type cell (non-editable) keeps its plain span.

- [ ] **Step 6: Section 2 - related parties + acting together.** Replace the `Exhibit tag="REL"` content: title `"2 · Related parties"`, `<NarrativeLine narrative={narrative('related')} onSave={saveNarrative?.('related')} />` first. Keep the existing related list (it already shows only non-taxpayer, non-FE entities; tighten it to related-only plus an accounted line):

```tsx
        {(() => {
          const relatedOnly = related.filter((e) => e.related);
          const notRelated = related.filter((e) => !e.related);
          return (
            <>
              {relatedOnly.length === 0
                ? <p className="text-xs text-muted-foreground">No related parties outside the taxpayer.</p>
                : <div className="space-y-1 text-xs">{relatedOnly.map((e) => ( /* existing row JSX unchanged */ null ))}</div>}
              {notRelated.length > 0 && (
                <AccountedLine summary={`${notRelated.length} further group ${notRelated.length === 1 ? 'entity does' : 'entities do'} not meet the 25% relatedness test.`}>
                  <div className="space-y-1">{notRelated.map((e) => ( /* same row JSX */ null ))}</div>
                </AccountedLine>
              )}
            </>
          );
        })()}
```

Move the whole acting-together block (the current `Exhibit tag="AT"` content, unchanged: cluster cards, likelihood buttons, textarea, ExcludeBtn) INSIDE this section, under a sub-heading row that keeps its own section-exclude toggle:

```tsx
        <div className="mt-3 border-t border-[hsl(var(--border-subtle))] pt-2.5">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
            <Handshake className="h-3.5 w-3.5 text-muted-foreground" />
            Acting together (on top of direct relatedness)
            <span className="flex-1" />
            {editable && (
              <ExcludeBtn
                excluded={isSectionExcluded(facts, 'actingTogether')}
                onClick={() => onChange!(withSectionExcluded(facts, 'actingTogether', !isSectionExcluded(facts, 'actingTogether')))}
              />
            )}
          </div>
          {/* existing acting-together cards / empty state verbatim */}
          {(() => {
            const downgraded = shown.actingTogether.filter((a) => !(a.likelihood === 'likely' || a.likelihood === 'highly_likely'));
            return downgraded.length > 0
              ? <AccountedLine summary={`${downgraded.length} candidate ${downgraded.length === 1 ? 'grouping was' : 'groupings were'} considered and assessed as not likely; ${downgraded.length === 1 ? 'it is' : 'they are'} left out of the client annex.`} />
              : null;
          })()}
        </div>
```

Delete the standalone `Exhibit tag="AT"` block.

- [ ] **Step 7: Section 3 - relevant flows.** Replace the `Exhibit tag="T"` block (move it BEFORE the classification exhibit; new order is E, REL, T, CLS): title `"3 · Relevant flows"`, `defaultOpen` (remove `defaultOpen={false}`), narrative line `flows` first. Table rows come from `relevantTransactions(shown)`; add a `Why relevant` column after `Instrument`; in the editable controls add a "not relevant" flip next to ExcludeBtn:

```tsx
        {(() => {
          const rel = relevantTransactions(shown);
          const accounted = accountedTransactionGroups(shown);
          return (
            <>
              <NarrativeLine narrative={narrative('flows')} onSave={saveNarrative?.('flows')} />
              {rel.length === 0
                ? <p className="text-xs text-muted-foreground">{generated ? 'No relevant intra-group flows identified.' : 'Not generated yet.'}</p>
                : (
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 pr-2">#</th><th className="pr-2">Flow</th><th className="pr-2">Type</th>
                      <th className="pr-2">Instrument</th><th className="pr-2">Why relevant</th><th>Article(s)</th>
                      {editable && <th className="w-14" aria-label="Controls" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rel.map((t) => ( /* existing row JSX with one extra cell before Article(s): */
                      /* <td className="pr-2 text-muted-foreground">{t.relevanceReason ?? '-'}</td> */
                      /* and in the editable controls, an extra flip button: */
                      /* <button type="button" title="Mark as not relevant" aria-label="Mark as not relevant"
                           onClick={() => onChange!(withTransactionRelevance(facts, t.id, false))}
                           className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                           <X className="h-3 w-3" />
                         </button> */
                      null
                    ))}
                  </tbody>
                </table>
              )}
              {accounted.map((g) => (
                <AccountedLine key={g.reason} summary={`${g.transactions.length} ${g.transactions.length === 1 ? 'flow' : 'flows'} not relevant: ${g.reason}`}>
                  <div className="space-y-1">
                    {g.transactions.map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <span className="font-mono text-sky-700 dark:text-sky-300">{t.id}</span>
                        <span>{nameOf(facts, t.fromEntityId)} → {nameOf(facts, t.toEntityId)}</span>
                        <span className="text-muted-foreground">{t.kind}</span>
                        <span className="flex-1" />
                        {editable && (
                          <button type="button" className="underline underline-offset-2 hover:text-foreground"
                            onClick={() => onChange!(withTransactionRelevance(facts, t.id, true))}>
                            mark relevant
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </AccountedLine>
              ))}
            </>
          );
        })()}
```

- [ ] **Step 8: Section 4 - classification of relevant entities.** The `Exhibit tag="CLS"` becomes title `"4 · Classification of the relevant entities"` with narrative `classification` first. Rows: only `shown.entities.filter((e) => inScope.has(e.id))`. Columns become `Entity | NL qualification | Local qualification | Mismatch?`:

```tsx
        {(() => {
          const inScopeEnts = shown.entities.filter((e) => inScope.has(e.id));
          const outCount = shown.entities.length - inScopeEnts.length;
          const clsByEntity = new Map(shown.classifications.map((c) => [c.entityId, c]));
          return (
            <>
              <NarrativeLine narrative={narrative('classification')} onSave={saveNarrative?.('classification')} />
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-2">Entity</th><th className="pr-2">NL qualification</th>
                    <th className="pr-2">Local qualification</th><th>Mismatch?</th>
                  </tr>
                </thead>
                <tbody>
                  {inScopeEnts.map((e) => {
                    const c = clsByEntity.get(e.id);
                    const nl = nlQualification(effNlTaxStatus(e));
                    const local = c ? localQualification(c.homeClass) : 'undetermined';
                    const mismatch = !!c?.hybrid || (nl !== 'undetermined' && local !== 'undetermined' && nl !== local);
                    return (
                      <tr key={e.id} className="border-t border-[hsl(var(--border-subtle))]">
                        <td className="py-1 pr-2">
                          <span className="font-mono text-sky-700 dark:text-sky-300">{e.id}</span>{' '}
                          <span>{e.name}</span>
                        </td>
                        <td className="pr-2"><QualBadge status={effNlTaxStatus(e)} /></td>
                        <td className="pr-2 text-muted-foreground">
                          {c ? `${nlQualificationLabel(local)}${c.homeState ? ` (${c.homeState})` : ''}` : 'To be determined'}
                        </td>
                        <td className={cn(mismatch ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                          {mismatch ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {outCount > 0 && (
                <AccountedLine summary={`The remaining ${outCount} group ${outCount === 1 ? 'entity is' : 'entities are'} not party to a relevant flow and ${outCount === 1 ? 'carries' : 'carry'} no qualification difference.`} />
              )}
            </>
          );
        })()}
```

Remove the old all-entity classification table and its footnote.

- [ ] **Step 9: Build + tests**

Run: `npm run build` then `npm run test -- src/lib/ --run`
Expected: build exit 0; all src/lib tests pass except the pre-existing `autoAdvanceWiring.test.ts` failures (3), which are out of scope - do not fix.

- [ ] **Step 10: Commit**

```bash
git add src/components/appendix/FactsPanel.tsx
git commit -m "feat(appendix): FactsPanel funnel layout (strip, taxpayer block, quiet edits, relevant flows, in-scope classification)"
```

---

### Task 8: Print export mirrors the funnel

**Files:**
- Modify: `src/lib/appendix/printAppendix.ts`
- Test: `src/lib/appendix/__tests__/printAppendix.test.ts` (extend)

- [ ] **Step 1: Add failing tests** (append to the existing file, reusing its existing fixtures/imports style):

```ts
describe('part A funnel export', () => {
  const ent = (id: string, name: string, jur: string, role = 'Group entity', extra = {}) => ({
    id, chartEntityId: `c-${id}`, name, jurisdiction: jur, entityType: 'corporation', role,
    ownershipPct: null, related: true, nlTaxStatus: 'resident', ...extra,
  });
  const facts = {
    entities: [ent('E1', 'Tax BV', 'NL', 'Taxpayer'), ent('E2', 'US Inc', 'US')],
    transactions: [
      { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null,
        articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai',
        relevant: true, relevanceReason: 'Cross-border to a related party' },
      { id: 'T2', fromEntityId: 'E1', toEntityId: 'E2', kind: 'service', instrument: null, note: null,
        articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai',
        relevant: false, relevanceReason: 'Within the fiscal unity' },
    ],
    classifications: [], actingTogether: [],
    narratives: { register: { text: 'The group narrative.', source: 'ai' } },
  } as never;

  it('renders the summary strip, the narrative and the accounted line', () => {
    const html = buildAppendixPrintHtml([], 'dossier', undefined, facts);
    expect(html).toContain('Cross-border flows with related parties');
    expect(html).toContain('The group narrative.');
    expect(html).toContain('1 flow not relevant: Within the fiscal unity');
    expect(html).not.toContain('T2'); // accounted flow not in the relevant table
  });

  it('drops sub-likely acting-together clusters from the dossier', () => {
    const f = { ...facts, actingTogether: [
      { id: 'A1', memberEntityIds: ['E1', 'E2'], combinedPct: 30, likelihood: 'unlikely', reasoning: 'no', excludedFromClient: false, source: 'ai' },
    ] } as never;
    const html = buildAppendixPrintHtml([], 'dossier', undefined, f);
    expect(html).not.toContain('Unlikely');
    expect(html).toContain('1 candidate grouping was considered and assessed as not likely');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -- src/lib/appendix/__tests__/printAppendix.test.ts --run`
Expected: the two new tests FAIL.

- [ ] **Step 3: Rewrite the Part A IIFE** in `buildAppendixPrintHtml` to the funnel order. Import at the top:

```ts
import { deriveConclusions, inScopeEntityIds, localQualification } from './facts/conclusions';
import { relevantTransactions, accountedTransactionGroups } from './facts/relevance';
```

Replace the body of the `partA` IIFE with:

```ts
    if (!facts || facts.entities.length === 0) return '';
    const f = internal ? facts : factsForClient(facts);
    const drop = (key: AppendixSectionKey) => !internal && isSectionExcluded(f, key);
    const entityById = new Map(f.entities.map((e) => [e.id, e]));
    const entityName = (id: string) => entityById.get(id)?.name ?? id;
    const narrative = (key: 'register' | 'related' | 'flows' | 'classification') => {
      const n = facts.narratives?.[key];
      return n?.text ? `<p class="narrative">${esc(n.text)}</p>` : '';
    };

    // Summary strip (always derived from the FULL facts, advisor edits included).
    const flags = deriveConclusions(facts);
    const strip =
      `<table><tr><td>Cross-border flows with related parties</td><td>${flags.crossBorderRelatedFlows > 0 ? `${flags.crossBorderRelatedFlows} identified` : 'None identified'}</td></tr>` +
      `<tr><td>Hybrid qualification differences (NL vs local)</td><td>${flags.hybridDifferences > 0 ? `${flags.hybridDifferences} identified` : 'None identified'}</td></tr>` +
      `<tr><td>Acting-together group considered likely</td><td>${flags.likelyActingTogether > 0 ? `${flags.likelyActingTogether}` : 'None'}</td></tr></table>`;

    // 1. The group and the taxpayer (taxpayer/fiscal-unity rows first).
    const isTaxGroup = (e: (typeof f.entities)[number]) => e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
    const orderedEnts = [...f.entities.filter(isTaxGroup), ...f.entities.filter((e) => !isTaxGroup(e))];
    const entityRows = orderedEnts.map((e) => {
      const idCol = internal ? `<td class="c-num">${esc(e.id)}</td>` : '';
      const roleText = e.role + (e.inTaxpayerFiscalUnity ? ' (fiscal unity)' : '');
      return `<tr${isTaxGroup(e) ? ' class="taxpayer"' : ''}>${idCol}<td>${esc(e.name)}</td>` +
        `<td>${esc(jurLabel(effJurisdiction(e)))}</td>` +
        `<td>${esc(roleText)}</td>` +
        `<td>${esc(e.isFiscalUnity ? 'Fiscal unity' : typeLabel(effEntityType(e)))}</td>` +
        `<td>${esc(nlTaxStatusLabel(effNlTaxStatus(e)))}</td></tr>`;
    }).join('');
    const idHeader = internal ? `<th class="c-num">Ref</th>` : '';
    const registerBlock = (!drop('entityRegister') && entityRows)
      ? `<h2>A.1 · The group and the taxpayer</h2>${narrative('register')}` +
        `<table><tr>${idHeader}<th>Entity</th><th>Jurisdiction</th><th>Role</th><th>Type</th><th>NL tax status</th></tr>${entityRows}</table>`
      : '';

    // 2. Related parties + acting together.
    const relatedEnts = f.entities.filter((e) => e.related && e.role !== 'Taxpayer' && !e.memberOfUnityId && !e.inTaxpayerFiscalUnity);
    const relRows = relatedEnts.map((e) => {
      const own = e.ownershipPct != null ? `${e.ownershipPct}%`
        : (e.relatedVia && e.relatedViaPct != null) ? `via ${esc(entityName(e.relatedVia))} (${e.relatedViaPct}%)` : '';
      return `<tr><td>${esc(e.name)}</td><td>${esc(e.role)}</td><td>${own}</td></tr>`;
    }).join('');
    const atItems = f.actingTogether.map((a) => {
      const members = a.memberEntityIds.map((mid) => entityName(mid)).join(', ');
      const pctTxt = a.combinedPct != null ? ` (≈ ${a.combinedPct}%)` : '';
      return `<li>${esc(members)}${pctTxt} - <strong>${esc(actingLikelihoodLabel(a.likelihood))}</strong>: ${esc(a.reasoning)}</li>`;
    }).join('');
    const allAt = visibleAt(facts);
    const downgradedAt = allAt.length - f.actingTogether.length;
    const atAccounted = (!internal && downgradedAt > 0)
      ? `<p class="accounted">${downgradedAt} candidate ${downgradedAt === 1 ? 'grouping was' : 'groupings were'} considered and assessed as not likely.</p>`
      : '';
    const relatedBlock = (!drop('relatedness') && (relRows || atItems || atAccounted))
      ? `<h2>A.2 · Related parties</h2>${narrative('related')}` +
        (relRows ? `<table><tr><th>Entity</th><th>Role</th><th>Interest</th></tr>${relRows}</table>` : `<p class="accounted">No related parties outside the taxpayer.</p>`) +
        (!drop('actingTogether') ? ((atItems ? `<h3>Acting together</h3><ul>${atItems}</ul>` : '') + atAccounted) : '')
      : '';

    // 3. Relevant flows + accounted groups.
    const relTx = relevantTransactions(f);
    const txRows = relTx.map((t) => {
      const idCol = internal ? `<td class="c-num">${esc(t.id)}</td>` : '';
      return `<tr>${idCol}<td>${esc(entityName(t.fromEntityId))} &rarr; ${esc(entityName(t.toEntityId))}</td>` +
        `<td>${esc(t.kind)}</td><td>${esc(t.instrument)}</td><td>${esc(t.relevanceReason ?? '')}</td>` +
        `<td>${t.articlesTested.map(esc).join(', ')}</td></tr>`;
    }).join('');
    const accounted = accountedTransactionGroups(f)
      .map((g) => `<p class="accounted">${g.transactions.length} ${g.transactions.length === 1 ? 'flow' : 'flows'} not relevant: ${esc(g.reason)}</p>`)
      .join('');
    const txIdHeader = internal ? `<th class="c-num">Ref</th>` : '';
    const flowsBlock = (!drop('transactions') && (txRows || accounted))
      ? `<h2>A.3 · Relevant flows</h2>${narrative('flows')}` +
        (txRows
          ? `<table><tr>${txIdHeader}<th>Flow</th><th>Type</th><th>Instrument</th><th>Why relevant</th><th>Article(s)</th></tr>${txRows}</table>`
          : `<p class="accounted">No relevant intra-group flows identified.</p>`) + accounted
      : '';

    // 4. Classification of the relevant entities (NL vs local).
    const scope = inScopeEntityIds(facts);
    const clsByEntity = new Map(f.classifications.map((c) => [c.entityId, c]));
    const inScopeEnts = f.entities.filter((e) => scope.has(e.id));
    const clsRows = inScopeEnts.map((e) => {
      const c = clsByEntity.get(e.id);
      const nl = nlQualification(effNlTaxStatus(e));
      const local = c ? localQualification(c.homeClass) : 'undetermined';
      const mismatch = !!c?.hybrid || (nl !== 'undetermined' && local !== 'undetermined' && nl !== local);
      return `<tr><td>${esc(e.name)}</td><td>${esc(nlQualificationLabel(nl))}</td>` +
        `<td>${esc(c ? `${nlQualificationLabel(local)}${c.homeState ? ` (${c.homeState})` : ''}` : 'To be determined')}</td>` +
        `<td>${mismatch ? '<strong>Yes</strong>' : 'No'}</td></tr>`;
    }).join('');
    const outCount = f.entities.length - inScopeEnts.length;
    const clsAccounted = outCount > 0
      ? `<p class="accounted">The remaining ${outCount} group ${outCount === 1 ? 'entity is' : 'entities are'} not party to a relevant flow and ${outCount === 1 ? 'carries' : 'carry'} no qualification difference.</p>`
      : '';
    const clsBlock = (!drop('classification') && (clsRows || clsAccounted))
      ? `<h2>A.4 · Classification of the relevant entities</h2>${narrative('classification')}` +
        (clsRows ? `<table><tr><th>Entity</th><th>NL qualification</th><th>Local qualification</th><th>Mismatch?</th></tr>${clsRows}</table>` : '') + clsAccounted
      : '';

    if (!registerBlock && !relatedBlock && !flowsBlock && !clsBlock) return '';
    return `<h2 style="font-size:13px;margin-top:0;">Part A &middot; Facts &amp; relationships</h2>${strip}${registerBlock}${relatedBlock}${flowsBlock}${clsBlock}<hr style="margin:14px 0;border:none;border-top:1px solid #ccc;">`;
```

Add a tiny helper above `buildAppendixPrintHtml` (the dossier needs the pre-filter cluster count):

```ts
import { visibleFacts } from './facts/visibleFacts';
const visibleAt = (facts: AppendixFacts) => visibleFacts(facts).actingTogether.filter((a) => !a.excludedFromClient);
```

And extend the `<style>` block with:

```
  .narrative { color: #444; font-style: italic; margin: 2px 0 6px; }
  .accounted { color: #666; font-size: 10px; margin: 2px 0 8px; }
  tr.taxpayer td { background: #eef6fb; }
  h3 { font-size: 11px; margin: 8px 0 3px; }
```

- [ ] **Step 4: Run the tests**

Run: `npm run test -- src/lib/appendix/__tests__/printAppendix.test.ts --run`
Expected: PASS (new and pre-existing; update any pre-existing Part A assertions that referenced the old "Part A.1 · Entity register" headings to the new "A.1 · The group and the taxpayer" etc. - changing those assertions is in scope, weakening them is not).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/printAppendix.ts src/lib/appendix/__tests__/printAppendix.test.ts
git commit -m "feat(appendix): print export mirrors the Part A funnel"
```

---

### Task 9: Memo block alignment

**Files:**
- Modify: `src/lib/appendix/buildAppendixBlock.ts`
- Test: `src/lib/appendix/__tests__/buildAppendixBlock.test.ts` (extend)

- [ ] **Step 1: Add failing test**

```ts
it('feeds the memo only relevant flows plus an accounted count, and the conclusion flags', () => {
  const facts = {
    entities: [
      { id: 'E1', chartEntityId: 'c1', name: 'Tax BV', jurisdiction: 'NL', entityType: 'corporation', role: 'Taxpayer', ownershipPct: null, related: false, nlTaxStatus: 'resident' },
      { id: 'E2', chartEntityId: 'c2', name: 'US Inc', jurisdiction: 'US', entityType: 'corporation', role: 'Group entity', ownershipPct: null, related: true, nlTaxStatus: 'outside_cit' },
    ],
    classifications: [], actingTogether: [],
    transactions: [
      { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai', relevant: true, relevanceReason: 'Cross-border related' },
      { id: 'T2', fromEntityId: 'E1', toEntityId: 'E2', kind: 'service', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai', relevant: false, relevanceReason: 'Within the fiscal unity' },
    ],
  } as never;
  const block = buildAppendixBlock([], undefined, facts);
  expect(block).toContain('loan');
  expect(block).not.toContain('service');
  expect(block).toContain('1 flow assessed as not relevant (Within the fiscal unity)');
  expect(block).toContain('Cross-border flows with related parties: 1');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/buildAppendixBlock.test.ts --run`

- [ ] **Step 3: Implement** in `buildFactsSummary`:

Add imports:

```ts
import { deriveConclusions } from './facts/conclusions';
import { relevantTransactions, accountedTransactionGroups } from './facts/relevance';
```

Replace the `tx` constant with:

```ts
  const relTx = ex('transactions') ? [] : relevantTransactions(f);
  const tx = relTx
    .map((t) => `- ${esc(nameOf(t.fromEntityId))} -> ${esc(nameOf(t.toEntityId))}: ${esc(t.kind)}${t.instrument ? ` (${esc(t.instrument)})` : ''}${t.relevanceReason ? ` [why: ${esc(t.relevanceReason)}]` : ''}${t.articlesTested.length ? ` [${t.articlesTested.map(esc).join(', ')}]` : ''}`)
    .join('\n');
  const txAccounted = ex('transactions') ? '' : accountedTransactionGroups(f)
    .map((g) => `- ${g.transactions.length} ${g.transactions.length === 1 ? 'flow' : 'flows'} assessed as not relevant (${esc(g.reason)})`)
    .join('\n');
```

Before `const parts = [`, add:

```ts
  const flags = deriveConclusions(facts);
  const conclusions = [
    `- Cross-border flows with related parties: ${flags.crossBorderRelatedFlows}`,
    `- Hybrid qualification differences (NL vs local): ${flags.hybridDifferences}`,
    `- Acting-together clusters considered likely: ${flags.likelyActingTogether}`,
  ].join('\n');
```

And extend `parts`:

```ts
  const parts = [
    `Conclusion flags (computed):\n${conclusions}`,
    ents ? `Entities (with NL classification):\n${ents}` : '',
    cls ? `Cross-border classification (home vs source):\n${cls}` : '',
    tx ? `Relevant intra-group transactions:\n${tx}` : '',
    txAccounted ? `Flows accounted for and set aside:\n${txAccounted}` : '',
    at ? `Acting-together groups:\n${at}` : '',
  ].filter(Boolean).join('\n');
```

(The `at` list already passes through `factsForClient`, so the likely+ rule from Task 4 applies automatically.)

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/lib/appendix/__tests__/buildAppendixBlock.test.ts --run`
Expected: PASS (new + pre-existing; if a pre-existing assertion counts the old `Intra-group transactions:` heading, update it to `Relevant intra-group transactions:`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/buildAppendixBlock.ts src/lib/appendix/__tests__/buildAppendixBlock.test.ts
git commit -m "feat(appendix): memo facts block follows the funnel (relevant flows, accounted counts, conclusion flags)"
```

---

### Task 10: Full gate + deploy (controller)

- [ ] **Step 1: Full local gate**

Run: `npm run build` and `npm run test -- src/lib/ --run`
Expected: build exit 0; all tests pass except the 3 pre-existing `autoAdvanceWiring.test.ts` failures.

- [ ] **Step 2: Deploy (CONTROLLER ONLY - requires the user to re-activate PIM first).** Per the established pattern (base64 files into a bash script, run via `az vm run-command invoke` on `adn-x-s-5`, az.cmd full path):
  1. Apply `supabase/migrations/20260610090000_appendix_facts_prompt_v8_funnel.sql` via `docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1`.
  2. Base64-copy `index.ts`, `factsSchemas.ts`, `factsBuild.ts` to `/root/supabase-docker/volumes/functions/generate-appendix/` and `docker restart` the edge container.
  3. Verify: prompt version = 8; md5 of each deployed file matches local; smoke `POST https://api.atad2.tax/functions/v1/generate-appendix` with `{}` returns 400 `{"error":"Missing session_id"}`.
  4. Live check: trigger a session with documents and confirm `facts->'transactions'->0->'relevant'` exists and `facts->'narratives'` is populated.

- [ ] **Step 3: Done.** Do not push. Frontend goes live only when the user pushes to main.

---

## Self-review notes

- Spec coverage: strip (T3+T7+T8), register block (T7), related+AT with likely+ export rule (T4+T7+T8), relevance + accounted (T2+T5+T6+T7+T8+T9), classification NL+local in scope (T3+T7+T8), narratives (T1+T5+T6+T7+T8), merge preservation (T5), edge cases (defaults in T2/T5; empty states T7/T8).
- The pre-existing FactsPanel behaviours (hide entity, section exclude, per-item exclude/confirm) are explicitly retained in T7.
- Type names used across tasks: `Narrative`, `NarrativeKey`, `ConclusionFlags`, `AccountedGroup`, `withTransactionRelevance`, `relevantTransactions`, `accountedTransactionGroups`, `deriveConclusions`, `inScopeEntityIds`, `localQualification`, `withNarrative`, `NARRATIVE_KEYS` - consistent.
