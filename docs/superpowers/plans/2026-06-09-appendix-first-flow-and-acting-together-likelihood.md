# Appendix-first flow + acting-together likelihood — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Appendix step before the Structure step, let appendix-hidden entities drop out of the chart, and turn the "Acting together" block into a per-cluster likelihood overview whose rationale text is pre-generated per level (so switching the level swaps the text with no AI call).

**Architecture:** Three phases. (1) Flow order lives in `src/lib/assessment/steps.ts` + per-step nav targets. (2) The structure step loads the appendix `hidden` set and filters its BFS. (3) The acting-together cluster model gains `likelihood` + `rationales{5}` + live `reasoning`, replacing the old `status`/`rationale` + the `actingTogetherNarrative`; the edge `generate-appendix` (Deno) + prompt `appendix_facts_system` v5 produce the 5 rationale variants, grounded on the existing RAG.

**Tech Stack:** React + Vite + TypeScript + Tailwind + shadcn/ui; Vitest (`npm run test -- src/lib/`); build `npm run build`; self-hosted Supabase Deno edge function `generate-appendix`; DB prompt rows in `atad2_prompts`. Deploys/migrations go to the live VM via `az vm run-command` (base64 + md5 verify); the controller handles VM ops. Branch `feat/technical-appendix`; do not push to main.

Spec: `docs/superpowers/specs/2026-06-09-appendix-first-flow-and-acting-together-likelihood-design.md`.

---

## Phase 1 — Flow reorder (appendix before structure)

### Task 1: Step order + path mapping

**Files:**
- Modify: `src/lib/assessment/steps.ts`
- Test: `src/lib/assessment/__tests__/steps.test.ts`

- [ ] **Step 1: Update the test to the new order (appendix index 4, structure index 5)**

In `src/lib/assessment/__tests__/steps.test.ts` replace the first `it` block's array and the two index assertions:

```ts
  it('exposes the seven ordered steps (confirmation gates appendix; structure before report)', () => {
    expect(ASSESSMENT_STEPS.map((s) => s.key)).toEqual([
      'intake', 'documents', 'questions', 'confirmation', 'appendix', 'structure', 'report',
    ]);
  });
```

And change the two route-index assertions:

```ts
  it('maps the appendix route to step 4', () => {
    expect(stepIndexForPath('/assessment-appendix/abc-123')).toBe(4);
  });

  it('maps the structure route to step 5', () => {
    expect(stepIndexForPath('/assessment/structure/abc-123')).toBe(5);
  });
```

(Leave the `wide`/`fullBleed` test as-is — those assert per-key flags, which do not change.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/lib/assessment/__tests__/steps.test.ts --run`
Expected: FAIL (order array + the two index expectations mismatch).

- [ ] **Step 3: Reorder `ASSESSMENT_STEPS` and `stepIndexForPath`**

In `src/lib/assessment/steps.ts`, reorder the array so `appendix` precedes `structure` (keep each entry's own `wide`/`fullBleed`):

```ts
export const ASSESSMENT_STEPS: readonly AssessmentStep[] = [
  { key: 'intake',       label: 'Intake',       wide: false, fullBleed: false },
  { key: 'documents',    label: 'Documents',    wide: false, fullBleed: false },
  { key: 'questions',    label: 'Questions',    wide: true,  fullBleed: false },
  { key: 'confirmation', label: 'Confirmation', wide: false, fullBleed: false },
  { key: 'appendix',     label: 'Appendix',     wide: true,  fullBleed: false },
  { key: 'structure',    label: 'Structure',    wide: true,  fullBleed: true  },
  { key: 'report',       label: 'Overview',     wide: false, fullBleed: false },
] as const;
```

Update the doc comment's flow line and swap the two indices in `stepIndexForPath`:

```ts
 * Flow order: intake → documents → questions → confirmation → appendix → structure → report.
 * Confirmation gates the appendix step; the structure chart follows the appendix.
```

```ts
  if (pathname.startsWith('/assessment-appendix/')) return 4;
  if (pathname.startsWith('/assessment/structure/')) return 5;
```

(Leave `/assessment-confirmation/` → 3 and `/assessment-report/` → 6 unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/lib/assessment/__tests__/steps.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessment/steps.ts src/lib/assessment/__tests__/steps.test.ts
git commit -m "feat(flow): order appendix before structure in the assessment stepper"
```

---

### Task 2: Per-step navigation targets

**Files:**
- Modify: `src/pages/AssessmentConfirmation.tsx`
- Modify: `src/pages/AssessmentAppendix.tsx:288` (Previous button) and `:167-177` (handleConfirm)
- Modify: `src/components/structure/StructureChartStep.tsx:724-760` (goNext/skipNext) and `:781` (Previous)

No unit test (pure navigation wiring); verified by the build + manual flow.

- [ ] **Step 1: Confirmation → Appendix**

In `src/pages/AssessmentConfirmation.tsx`, find the forward navigation that currently targets the structure route (search for `assessment/structure`) and change it to the appendix route:

```ts
navigate(`/assessment-appendix/${sessionId}`);
```

If the confirmation also kicks off background work (e.g. `finishAssessment`), leave that untouched — it still triggers extraction + appendix generation; only the destination changes.

- [ ] **Step 2: Appendix nav — Previous to confirmation, forward to structure**

In `src/pages/AssessmentAppendix.tsx`, the "Previous" button currently navigates to the structure route. Change it to confirmation:

```tsx
          <Button
            variant="outline"
            onClick={() => navigate(`/assessment-confirmation/${sessionId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
```

In `handleConfirm`, keep `confirmAppendix(...)` but change the destination from the report to the structure step:

```ts
  const handleConfirm = async () => {
    if (!appendix || !user || !sessionId) return;
    setConfirming(true);
    try {
      await confirmAppendix(appendix.id, user.id);
      navigate(`/assessment/structure/${sessionId}`);
    } catch (e) {
      toast.error('Could not confirm appendix', { description: String(e) });
      setConfirming(false);
    }
  };
```

- [ ] **Step 3: Structure nav — Previous to appendix, forward to report**

In `src/components/structure/StructureChartStep.tsx`:

The "Previous" button (`onClick={() => navigate(\`/assessment-confirmation/${sessionId}\`)}`) → appendix:

```tsx
              onClick={() => navigate(`/assessment-appendix/${sessionId}`)}
```

In `goNext`, the final navigate (`navigate(\`/assessment-appendix/${sessionId}\`)`) → report:

```ts
    navigate(`/assessment-report/${sessionId}`);
```

In `skipNext`, the final navigate (`navigate(\`/assessment-appendix/${sessionId}\`)`) → report:

```ts
    navigate(`/assessment-report/${sessionId}`);
```

(`editFromOverview` behaviour is unchanged.)

- [ ] **Step 4: Build to verify no type/route breakage**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AssessmentConfirmation.tsx src/pages/AssessmentAppendix.tsx src/components/structure/StructureChartStep.tsx
git commit -m "feat(flow): wire prev/next so the chart follows the appendix"
```

---

## Phase 2 — Appendix-hidden entities filtered from the chart

### Task 3: Filter chart by the appendix hidden set

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`

The structure step loads `atad2_appendix.facts`, derives the set of hidden `chartEntityId`s, and excludes those entities (and anything only reachable through them) from the chart's BFS. Non-destructive: chart rows are untouched; un-hiding happens in the appendix.

- [ ] **Step 1: Import the appendix loader**

Add to the imports in `StructureChartStep.tsx` (near the other `@/lib` imports):

```ts
import { loadAppendix } from '@/lib/appendix/client';
```

- [ ] **Step 2: Add hidden-id state and load it**

Add state next to the other `useState` declarations (e.g. after `const [groupings, setGroupings] = useState<StructureGroup[]>([]);`):

```ts
  const [hiddenChartIds, setHiddenChartIds] = useState<Set<string>>(new Set());
```

Add a dedicated effect that loads the appendix hidden set (best-effort; the appendix is generated before this step in the new flow, but may still be empty):

```ts
  // Appendix is leading: entities the advisor hid in the appendix are filtered
  // out of the chart (non-destructive — the rows stay; un-hiding is done in the
  // appendix). hidden ids are chartEntityIds; synthetic fiscal-unity ids (fu:*)
  // are not real chart entities and are ignored.
  useEffect(() => {
    let cancelled = false;
    loadAppendix(sessionId)
      .then((a) => {
        if (cancelled || !a?.facts) return;
        const ids = a.facts.entities
          .filter((e) => e.hidden && !e.chartEntityId.startsWith('fu:'))
          .map((e) => e.chartEntityId);
        setHiddenChartIds(new Set(ids));
      })
      .catch(() => { /* no appendix yet → hide nothing */ });
    return () => { cancelled = true; };
  }, [sessionId]);
```

- [ ] **Step 3: Exclude hidden ids from the BFS in `visibleEntities`**

Replace the `visibleEntities` memo body so the BFS treats hidden entities as absent (they and any branch only reachable through them drop out). Add `hiddenChartIds` to the dependency array.

```ts
  const visibleEntities = useMemo(() => {
    if (entities.length === 0) return entities;
    const hidden = hiddenChartIds;
    const ownership = edges.filter((e) => e.kind === 'ownership');
    const taxpayer = entities.find((e) => e.is_taxpayer && !hidden.has(e.id));
    const anchorId = taxpayer?.id ?? entities.find((e) => !hidden.has(e.id))?.id;
    if (!anchorId) return entities.filter((e) => !hidden.has(e.id));
    const connected = new Set<string>([anchorId]);
    const queue = [anchorId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const e of ownership) {
        if (e.from_entity_id === cur && !hidden.has(e.to_entity_id) && !connected.has(e.to_entity_id)) {
          connected.add(e.to_entity_id);
          queue.push(e.to_entity_id);
        }
        if (e.to_entity_id === cur && !hidden.has(e.from_entity_id) && !connected.has(e.from_entity_id)) {
          connected.add(e.from_entity_id);
          queue.push(e.from_entity_id);
        }
      }
    }
    return entities.filter((e) => connected.has(e.id) && !hidden.has(e.id));
  }, [entities, edges, hiddenChartIds]);
```

- [ ] **Step 4: Show a "hidden in appendix" indicator**

Pass a count into `FloatingToolbar`. Compute it just before the return (after `showLoader`):

```ts
  const hiddenInAppendixCount = useMemo(
    () => entities.filter((e) => hiddenChartIds.has(e.id)).length,
    [entities, hiddenChartIds],
  );
```

Add the prop to the `<FloatingToolbar ... />` usage:

```tsx
                hiddenInAppendixCount={hiddenInAppendixCount}
```

Then in `src/components/structure/FloatingToolbar.tsx`, add the optional prop to its `Props` interface:

```ts
  hiddenInAppendixCount?: number;
```

and render a small muted note inside the toolbar (next to the orphan toggle), e.g.:

```tsx
        {hiddenInAppendixCount ? (
          <span className="text-[11px] text-muted-foreground px-1">
            {hiddenInAppendixCount} hidden in appendix
          </span>
        ) : null}
```

(Match the toolbar's existing element styling; this is a read-only note — un-hiding happens in the appendix.)

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/structure/StructureChartStep.tsx src/components/structure/FloatingToolbar.tsx
git commit -m "feat(structure): hide appendix-hidden entities from the chart"
```

---

## Phase 3 — Acting-together likelihood model (frontend)

### Task 4: Likelihood type + labels module

**Files:**
- Create: `src/lib/appendix/facts/actingLikelihood.ts`
- Test: `src/lib/appendix/__tests__/actingLikelihood.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  ACTING_LIKELIHOODS, ACTING_LIKELIHOOD_KEYS, actingLikelihoodLabel, isActingLikelihood,
} from '@/lib/appendix/facts/actingLikelihood';

describe('acting-together likelihood', () => {
  it('has five ordered levels', () => {
    expect(ACTING_LIKELIHOOD_KEYS).toEqual([
      'highly_unlikely', 'unlikely', 'unclear', 'likely', 'highly_likely',
    ]);
    expect(ACTING_LIKELIHOODS.map((l) => l.key)).toEqual([...ACTING_LIKELIHOOD_KEYS]);
  });
  it('labels each level and falls back to Unclear', () => {
    expect(actingLikelihoodLabel('likely')).toBe('Likely');
    expect(actingLikelihoodLabel('highly_unlikely')).toBe('Highly unlikely');
    expect(actingLikelihoodLabel('garbage')).toBe('Unclear');
    expect(actingLikelihoodLabel(null)).toBe('Unclear');
  });
  it('recognises valid keys', () => {
    expect(isActingLikelihood('unclear')).toBe(true);
    expect(isActingLikelihood('maybe')).toBe(false);
    expect(isActingLikelihood(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/actingLikelihood.test.ts --run`
Expected: FAIL ("cannot find module").

- [ ] **Step 3: Implement the module**

```ts
// The likelihood that a candidate cluster qualifies as an acting-together
// group. Five ordered levels with a neutral middle. The AI proposes a default
// and pre-writes a rationale per level so switching the level swaps the text
// without a new AI call.

export type ActingLikelihood =
  | 'highly_unlikely' | 'unlikely' | 'unclear' | 'likely' | 'highly_likely';

export const ACTING_LIKELIHOOD_KEYS = [
  'highly_unlikely', 'unlikely', 'unclear', 'likely', 'highly_likely',
] as const;

export const ACTING_LIKELIHOODS: ReadonlyArray<{ key: ActingLikelihood; label: string }> = [
  { key: 'highly_unlikely', label: 'Highly unlikely' },
  { key: 'unlikely',        label: 'Unlikely' },
  { key: 'unclear',         label: 'Unclear' },
  { key: 'likely',          label: 'Likely' },
  { key: 'highly_likely',   label: 'Highly likely' },
];

const KNOWN = new Set<string>(ACTING_LIKELIHOOD_KEYS);

export function isActingLikelihood(v: string | null | undefined): v is ActingLikelihood {
  return v != null && KNOWN.has(v);
}

export function actingLikelihoodLabel(v: string | null | undefined): string {
  return ACTING_LIKELIHOODS.find((l) => l.key === v)?.label ?? 'Unclear';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/actingLikelihood.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appendix/facts/actingLikelihood.ts src/lib/appendix/__tests__/actingLikelihood.test.ts
git commit -m "feat(appendix): acting-together 5-level likelihood scale"
```

---

### Task 5: New `ActingTogetherCluster` shape + facts helpers

**Files:**
- Modify: `src/lib/appendix/types.ts:94-102` (ActingTogetherCluster) and `:129-134` (AppendixFacts)
- Create: `src/lib/appendix/facts/actingCluster.ts` (immutable patch helpers)
- Modify: `src/lib/appendix/facts/emptyFacts.ts`
- Modify: `src/lib/appendix/facts/visibleFacts.ts`
- Modify: `src/lib/appendix/factsExport.ts`
- Test: `src/lib/appendix/__tests__/actingCluster.test.ts`
- Modify (test): `src/lib/appendix/__tests__/emptyFacts.test.ts`

- [ ] **Step 1: Update the types**

In `src/lib/appendix/types.ts`, add the import and replace `ActingTogetherCluster`:

```ts
import type { ActingLikelihood } from './facts/actingLikelihood';
```

```ts
export interface ActingTogetherCluster {
  id: string;                  // "A1"
  memberEntityIds: string[];   // ["E3","E4"]
  combinedPct: number | null;
  likelihood: ActingLikelihood;   // current (advisor may change); init = aiLikelihood
  aiLikelihood: ActingLikelihood; // AI's proposed default
  rationales: Record<ActingLikelihood, string>; // one pre-generated rationale per level
  reasoning: string;           // live displayed text; init = rationales[likelihood]; editable
  excludedFromClient: boolean;
  source: 'ai' | 'edited';
}
```

Remove `actingTogetherNarrative` from `AppendixFacts`:

```ts
export interface AppendixFacts {
  entities: FactEntity[];
  actingTogether: ActingTogetherCluster[];
  classifications: ClassificationItem[];
  transactions: TransactionItem[];
}
```

- [ ] **Step 2: Write the failing test for the cluster patch helpers**

```ts
import { describe, it, expect } from 'vitest';
import { withClusterLikelihood, withClusterText, withClusterExclude } from '@/lib/appendix/facts/actingCluster';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { AppendixFacts } from '@/lib/appendix/types';

const cluster = {
  id: 'A1', memberEntityIds: ['E2', 'E3'], combinedPct: 18,
  likelihood: 'unlikely' as const, aiLikelihood: 'unlikely' as const,
  rationales: {
    highly_unlikely: 'HU text', unlikely: 'U text', unclear: 'UC text',
    likely: 'L text', highly_likely: 'HL text',
  },
  reasoning: 'U text', excludedFromClient: false, source: 'ai' as const,
};
const facts = (): AppendixFacts => ({ ...emptyFacts(), actingTogether: [cluster] });

describe('acting-cluster patch helpers', () => {
  it('changing the likelihood swaps reasoning to that level text and marks edited', () => {
    const out = withClusterLikelihood(facts(), 'A1', 'likely');
    expect(out.actingTogether[0].likelihood).toBe('likely');
    expect(out.actingTogether[0].reasoning).toBe('L text');
    expect(out.actingTogether[0].source).toBe('edited');
  });
  it('editing the text sets reasoning and marks edited, leaving likelihood', () => {
    const out = withClusterText(facts(), 'A1', 'my own words');
    expect(out.actingTogether[0].reasoning).toBe('my own words');
    expect(out.actingTogether[0].likelihood).toBe('unlikely');
    expect(out.actingTogether[0].source).toBe('edited');
  });
  it('toggling exclude does not touch source', () => {
    const out = withClusterExclude(facts(), 'A1', true);
    expect(out.actingTogether[0].excludedFromClient).toBe(true);
    expect(out.actingTogether[0].source).toBe('ai');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- src/lib/appendix/__tests__/actingCluster.test.ts --run`
Expected: FAIL ("cannot find module").

- [ ] **Step 4: Implement the patch helpers**

`src/lib/appendix/facts/actingCluster.ts`:

```ts
import type { AppendixFacts, ActingTogetherCluster } from '@/lib/appendix/types';
import type { ActingLikelihood } from './actingLikelihood';

function patch(
  facts: AppendixFacts,
  id: string,
  fn: (c: ActingTogetherCluster) => ActingTogetherCluster,
): AppendixFacts {
  return { ...facts, actingTogether: facts.actingTogether.map((c) => (c.id === id ? fn(c) : c)) };
}

/** Pick a level: swap the displayed reasoning to that level's pre-generated text. */
export function withClusterLikelihood(facts: AppendixFacts, id: string, level: ActingLikelihood): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, likelihood: level, reasoning: c.rationales[level] ?? c.reasoning, source: 'edited' }));
}

/** Hand-edit the rationale text for the current level. */
export function withClusterText(facts: AppendixFacts, id: string, reasoning: string): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, reasoning, source: 'edited' }));
}

/** Toggle exclude-from-client (a scope flag, not a content edit). */
export function withClusterExclude(facts: AppendixFacts, id: string, excluded: boolean): AppendixFacts {
  return patch(facts, id, (c) => ({ ...c, excludedFromClient: excluded }));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- src/lib/appendix/__tests__/actingCluster.test.ts --run`
Expected: PASS.

- [ ] **Step 6: Update emptyFacts/normalizeFacts (drop narrative) + its test**

`src/lib/appendix/facts/emptyFacts.ts` — remove `actingTogetherNarrative` from both functions:

```ts
export function emptyFacts(): AppendixFacts {
  return { entities: [], actingTogether: [], classifications: [], transactions: [] };
}

export function normalizeFacts(facts: Partial<AppendixFacts> | null | undefined): AppendixFacts {
  return {
    entities: Array.isArray(facts?.entities) ? facts!.entities : [],
    actingTogether: Array.isArray(facts?.actingTogether) ? facts!.actingTogether : [],
    classifications: Array.isArray(facts?.classifications) ? facts!.classifications : [],
    transactions: Array.isArray(facts?.transactions) ? facts!.transactions : [],
  };
}
```

`src/lib/appendix/__tests__/emptyFacts.test.ts` — revert the expectation to the four-array shape:

```ts
  it('emptyFacts has all four arrays', () => {
    expect(emptyFacts()).toEqual({ entities: [], actingTogether: [], classifications: [], transactions: [] });
  });
```

- [ ] **Step 7: Update visibleFacts + factsExport (drop narrative; keep cluster filters)**

`src/lib/appendix/facts/visibleFacts.ts` — remove the `actingTogetherNarrative` line from the returned object (the four filters stay exactly as they are).

`src/lib/appendix/factsExport.ts` — drop the narrative line and change the acting-together keep-rule from `status === 'confirmed'` to non-excluded:

```ts
  const f = visibleFacts(facts);
  return {
    entities: f.entities,
    actingTogether: f.actingTogether.filter((a) => !a.excludedFromClient),
    classifications: keep(f.classifications),
    transactions: keep(f.transactions),
  };
```

- [ ] **Step 8: Run the appendix suite to verify**

Run: `npm run test -- src/lib/appendix/ --run`
Expected: the existing `factsExport.test.ts`, `visibleFacts.test.ts`, `emptyFacts.test.ts` pass. If `factsExport.test.ts` still asserts an acting-together item with the old `status: 'confirmed'` shape, update that fixture to the new cluster shape (set `excludedFromClient: false`, drop `status`).

- [ ] **Step 9: Commit**

```bash
git add src/lib/appendix/types.ts src/lib/appendix/facts/actingCluster.ts src/lib/appendix/facts/emptyFacts.ts src/lib/appendix/facts/visibleFacts.ts src/lib/appendix/factsExport.ts src/lib/appendix/__tests__/actingCluster.test.ts src/lib/appendix/__tests__/emptyFacts.test.ts
git commit -m "feat(appendix): acting-together cluster model with per-level rationales"
```

---

### Task 6: FactsPanel "Acting together" exhibit

**Files:**
- Modify: `src/components/appendix/FactsPanel.tsx`

Replace the AT block (currently the `Handshake` exhibit using `withActing`/`ConfirmBtn`/`DismissBtn` + the `actingTogetherNarrative`) with the likelihood overview. The transactions block keeps using `ConfirmBtn`/`ExcludeBtn`; `DismissBtn` and `withActing` become unused and are removed.

- [ ] **Step 1: Swap imports**

Remove the `withActing` helper (defined inline in the file) and add:

```tsx
import { withClusterLikelihood, withClusterText, withClusterExclude } from '@/lib/appendix/facts/actingCluster';
import { ACTING_LIKELIHOODS, type ActingLikelihood } from '@/lib/appendix/facts/actingLikelihood';
```

Delete the inline `withActing` function and the `DismissBtn` component (no longer referenced).

- [ ] **Step 2: Add a likelihood-tint helper near the other helpers**

```tsx
function likelihoodTint(level: ActingLikelihood): string {
  // Directional + subtle: "likely" end = amber (a group is more likely, a
  // relatedness risk); "unlikely" end = neutral slate; unclear = grey.
  switch (level) {
    case 'highly_likely':
    case 'likely':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200';
    case 'unclear':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300';
  }
}
```

- [ ] **Step 3: Replace the AT exhibit JSX**

Replace the entire `<Exhibit tag="AT" ...>...</Exhibit>` block with:

```tsx
      <Exhibit tag="AT" icon={<Handshake className="h-4 w-4 text-muted-foreground" />} title="Acting together">
        {shown.actingTogether.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {generated ? 'No entities that could form an acting-together group.' : 'Not assessed yet.'}
          </p>
        ) : (
          <div className="space-y-2.5">
            {shown.actingTogether.map((a) => (
              <div
                key={a.id}
                className={cn(
                  'rounded-md border border-[hsl(var(--border-subtle))] p-2.5',
                  a.excludedFromClient && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 text-xs">
                    <span className="font-medium text-foreground">
                      {a.memberEntityIds.map((id) => nameOf(facts, id)).join(' + ')}
                    </span>
                    <span className="text-muted-foreground"> ≈ {pct(a.combinedPct)}</span>
                  </div>
                  {editable && (
                    <ExcludeBtn
                      excluded={a.excludedFromClient}
                      onClick={() => onChange!(withClusterExclude(facts, a.id, !a.excludedFromClient))}
                    />
                  )}
                </div>

                {/* Likelihood selector */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ACTING_LIKELIHOODS.map((l) => {
                    const active = a.likelihood === l.key;
                    return (
                      <button
                        key={l.key}
                        type="button"
                        disabled={!editable}
                        onClick={() => onChange!(withClusterLikelihood(facts, a.id, l.key))}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
                          active ? likelihoodTint(l.key) : 'bg-transparent text-muted-foreground hover:bg-muted',
                          !editable && 'cursor-default',
                        )}
                        aria-pressed={active}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>

                {/* Rationale (editable; swaps when the level changes) */}
                {editable ? (
                  <textarea
                    value={a.reasoning}
                    onChange={(e) => onChange!(withClusterText(facts, a.id, e.target.value))}
                    rows={2}
                    className="mt-1.5 w-full resize-y rounded border border-[hsl(var(--border-subtle))] bg-white/70 px-2 py-1 text-[11px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-400"
                  />
                ) : (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{a.reasoning}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Exhibit>
```

(Note: `nameOf`, `pct`, `ExcludeBtn`, `Exhibit`, `Handshake`, `cn`, `shown` already exist in the file. `shown.actingTogether` comes from `visibleFacts(facts)`, which filters clusters that reference hidden entities.)

- [ ] **Step 4: Build to verify (catches the removed-symbol references)**

Run: `npm run build`
Expected: build succeeds with no "DismissBtn is declared but never used" / "withActing" errors. If the build flags `withActing`/`DismissBtn` as unused, ensure both were removed in Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/components/appendix/FactsPanel.tsx
git commit -m "feat(appendix): acting-together likelihood selector with level-swapped rationale"
```

---

### Task 7: Exports — print + memo block

**Files:**
- Modify: `src/lib/appendix/printAppendix.ts` (Part A.4 acting-together) and the imports
- Modify: `src/lib/appendix/buildAppendixBlock.ts` (`buildFactsSummary`)
- Modify (tests): `src/lib/appendix/__tests__/printAppendix.test.ts`, `src/lib/appendix/__tests__/buildAppendixBlock.test.ts` if their facts fixtures include acting-together with the old shape

- [ ] **Step 1: printAppendix — render likelihood + reasoning**

In `src/lib/appendix/printAppendix.ts` add to the imports:

```ts
import { actingLikelihoodLabel } from './facts/actingLikelihood';
```

Replace the `atNarrative` + `atItems` + `atBlock` block (the "Acting together" section) with:

```ts
    // Acting together: per-cluster likelihood + reasoning.
    const atItems = f.actingTogether.map((a) => {
      const members = a.memberEntityIds.map((mid) => entityName(mid)).join(', ');
      const pct = a.combinedPct != null ? ` (≈ ${a.combinedPct}%)` : '';
      const excludedFlag = (internal && a.excludedFromClient) ? ` <span class="flag">excluded</span>` : '';
      return `<li>${esc(members)}${pct} - <strong>${esc(actingLikelihoodLabel(a.likelihood))}</strong>${excludedFlag}: ${esc(a.reasoning)}</li>`;
    }).join('');
    const atBlock = atItems
      ? `<h2>Part A.4 · Acting together</h2><ul>${atItems}</ul>`
      : '';
```

(`entityName`, `esc`, `internal`, `f` already exist in this function. The old `proposed`/`status` flags are gone with the model; only the internal `excluded` marker remains.)

- [ ] **Step 2: buildAppendixBlock — memo grounding line**

In `src/lib/appendix/buildAppendixBlock.ts` add the import:

```ts
import { actingLikelihoodLabel } from './facts/actingLikelihood';
```

Replace the `at` line builder and drop `atNarrative`:

```ts
  const at = f.actingTogether
    .map((a) => `- ${a.memberEntityIds.map((id) => esc(nameOf(id))).join(' + ')} ~ ${a.combinedPct ?? '?'}%: ${esc(actingLikelihoodLabel(a.likelihood))} - ${esc(a.reasoning)}`)
    .join('\n');
```

In the `parts` array, remove the `atNarrative ? ... : ''` entry and keep:

```ts
    at ? `Acting-together assessment:\n${at}` : '',
```

- [ ] **Step 3: Update fixtures if needed, then run the suite**

Run: `npm run test -- src/lib/appendix/ --run`
Expected: PASS. If `printAppendix.test.ts` or `buildAppendixBlock.test.ts` build a facts object with an acting-together cluster in the old shape (`status`/`rationale`), update those fixtures to the new shape:

```ts
actingTogether: [{
  id: 'A1', memberEntityIds: ['E1', 'E2'], combinedPct: 20,
  likelihood: 'likely', aiLikelihood: 'likely',
  rationales: { highly_unlikely: 'a', unlikely: 'b', unclear: 'c', likely: 'GP coordinates', highly_likely: 'e' },
  reasoning: 'GP coordinates', excludedFromClient: false, source: 'ai',
}],
```

and assert on `'Likely'` / `'GP coordinates'` where the old test asserted the rationale.

- [ ] **Step 4: Commit**

```bash
git add src/lib/appendix/printAppendix.ts src/lib/appendix/buildAppendixBlock.ts src/lib/appendix/__tests__/printAppendix.test.ts src/lib/appendix/__tests__/buildAppendixBlock.test.ts
git commit -m "feat(appendix): export acting-together likelihood + reasoning"
```

---

### Task 8: AssessmentAppendix wiring (no narrative, helpers already wired)

**Files:**
- Modify: `src/pages/AssessmentAppendix.tsx` (only if it referenced `actingTogetherNarrative`)

- [ ] **Step 1: Grep for stale references**

Run: `npm run build`
Expected: any remaining references to `actingTogetherNarrative` (e.g. in `AssessmentAppendix.tsx` or elsewhere) surface as type errors. The `FactsPanel` already receives `facts`/`onChange`/`generated` unchanged, so no prop change is needed. Fix any flagged reference by deleting it.

- [ ] **Step 2: Full appendix suite + build**

Run: `npm run test -- src/lib/appendix/ --run && npm run build`
Expected: PASS + build succeeds.

- [ ] **Step 3: Commit (if anything changed)**

```bash
git add -A
git commit -m "chore(appendix): drop stale actingTogetherNarrative references"
```

---

## Phase 4 — Edge function + prompt + deploy

### Task 9: Edge Deno mirror — types, schema, build/merge

**Files:**
- Modify: `supabase/functions/generate-appendix/factsBuild.ts` (ActingTogetherCluster mirror; drop narrative)
- Modify: `supabase/functions/generate-appendix/factsSchemas.ts` (tolerant actingTogether)
- Modify: `supabase/functions/generate-appendix/index.ts` (buildFacts, mergeFacts, buildFactsBlock, base facts)

No Vitest here (Deno edge code); verified by the deploy smoke test in Task 11.

- [ ] **Step 1: `factsBuild.ts` — mirror the new cluster + drop narrative**

Replace the `ActingTogetherCluster` interface and remove `actingTogetherNarrative` from `AppendixFacts`:

```ts
export type ActingLikelihood =
  | "highly_unlikely" | "unlikely" | "unclear" | "likely" | "highly_likely";

export interface ActingTogetherCluster {
  id: string;
  memberEntityIds: string[];
  combinedPct: number | null;
  likelihood: ActingLikelihood;
  aiLikelihood: ActingLikelihood;
  rationales: Record<ActingLikelihood, string>;
  reasoning: string;
  excludedFromClient: boolean;
  source: "ai" | "edited";
}
```

```ts
export interface AppendixFacts {
  entities: FactEntity[];
  actingTogether: ActingTogetherCluster[];
  classifications: ClassificationItem[];
  transactions: TransactionItem[];
}
```

- [ ] **Step 2: `factsSchemas.ts` — tolerant acting-together output**

Replace the `actingTogether` entry and drop `actingTogetherNarrative`:

```ts
  actingTogether: z.array(z.object({
    memberEntityIds: z.array(z.string().min(1)).min(1),
    combinedPct: z.number().nullish(),
    likelihood: z.enum(["highly_unlikely", "unlikely", "unclear", "likely", "highly_likely"]).nullish(),
    rationales: z.object({
      highly_unlikely: z.string().nullish(),
      unlikely: z.string().nullish(),
      unclear: z.string().nullish(),
      likely: z.string().nullish(),
      highly_likely: z.string().nullish(),
    }).partial().nullish(),
  })).optional().default([]),
  nlTaxStatusByEntityId: z.record(z.string(), z.string()).optional(),
```

(Delete the `actingTogetherNarrative: z.string().nullish(),` line.)

- [ ] **Step 3: `index.ts` — base facts, buildFacts mapping, mergeFacts, buildFactsBlock, renumberFacts**

In `buildFacts`, change the base object (remove narrative):

```ts
  const base: AppendixFacts = { entities, actingTogether: [], classifications: [], transactions: [] };
```

Remove the `actingTogetherNarrative: proposed.actingTogetherNarrative ?? null,` line from the returned object, and replace the `actingTogether` mapping with the new shape (coalescing each level + defaulting likelihood):

```ts
      actingTogether: proposed.actingTogether.map((a, i) => {
        const aiLikelihood = (a.likelihood ?? "unclear") as ActingLikelihood;
        const r = a.rationales ?? {};
        const fallback = "No specific assessment for this level.";
        const rationales: Record<ActingLikelihood, string> = {
          highly_unlikely: r.highly_unlikely ?? fallback,
          unlikely: r.unlikely ?? fallback,
          unclear: r.unclear ?? fallback,
          likely: r.likely ?? fallback,
          highly_likely: r.highly_likely ?? fallback,
        };
        return {
          id: `A${i + 1}`,
          memberEntityIds: a.memberEntityIds,
          combinedPct: a.combinedPct ?? null,
          likelihood: aiLikelihood,
          aiLikelihood,
          rationales,
          reasoning: rationales[aiLikelihood],
          excludedFromClient: false,
          source: "ai" as const,
        };
      }),
```

Add `ActingLikelihood` to the type import from `./factsBuild.ts`:

```ts
import {
  buildEntityRegister,
  type RawEntity, type RawEdge, type RawGroup, type AppendixFacts, type FactEntity, type ActingLikelihood,
} from "./factsBuild.ts";
```

In `mergeFacts`, replace the acting-together merge so advisor edits survive (key by sorted members; preserve `likelihood`/`reasoning`/`excludedFromClient` when `source==='edited'`):

```ts
  const atKey = (a: { memberEntityIds: string[] }) => [...a.memberEntityIds].sort().join("|");
  const exAt = new Map(existing.actingTogether.map((a) => [atKey(a), a]));
  const actingTogether = fresh.actingTogether.map((f) => {
    const prev = exAt.get(atKey(f));
    if (prev && prev.source === "edited") {
      return { ...f, likelihood: prev.likelihood, reasoning: prev.reasoning, excludedFromClient: prev.excludedFromClient, source: "edited" as const };
    }
    return { ...f, excludedFromClient: prev?.excludedFromClient ?? false };
  });
  return renumberFacts({ entities, classifications, transactions, actingTogether });
```

In `renumberFacts`, drop `actingTogetherNarrative` from the returned object (keep the `actingTogether` renumber):

```ts
function renumberFacts(f: AppendixFacts): AppendixFacts {
  return {
    entities: f.entities,
    classifications: f.classifications,
    transactions: f.transactions.map((t, i) => ({ ...t, id: `T${i + 1}` })),
    actingTogether: f.actingTogether.map((a, i) => ({ ...a, id: `A${i + 1}` })),
  };
}
```

In `buildFactsBlock`, replace the acting-together lines (use likelihood + reasoning; drop the narrative):

```ts
  const at = acting
    .map((a) => `${a.memberEntityIds.map(nameOf).join(" + ")} ~ ${a.combinedPct ?? "?"}%: ${a.likelihood} - ${a.reasoning}`)
    .join("\n");
```

Remove the `const atNarrative = ...` line and the `atNarrative ? ... : ""` entry from the returned `parts` array; keep `at ? \`Possible acting-together groups:\n${at}\` : ""`.

- [ ] **Step 4: Sanity check the edited files locally (type-only review)**

The Deno files are not type-checked by the frontend build. Re-read each changed function to confirm: no remaining `actingTogetherNarrative`, no remaining `.status`/`.rationale`/`.combinedPct` references to the old cluster shape, and `ActingLikelihood` imported where used.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-appendix/factsBuild.ts supabase/functions/generate-appendix/factsSchemas.ts supabase/functions/generate-appendix/index.ts
git commit -m "feat(edge): acting-together likelihood clusters with per-level rationales"
```

---

### Task 10: Prompt `appendix_facts_system` v5

**Files:**
- Create: `supabase/migrations/20260609190000_appendix_facts_prompt_v5_acting_likelihood.sql`

- [ ] **Step 1: Write the migration**

```sql
-- appendix_facts_system v5. Apply on the VM as supabase_admin.
-- Acting-together becomes a per-cluster likelihood overview: each candidate
-- cluster gets a default likelihood (5-level scale) plus a short rationale for
-- EVERY level, so the advisor can switch the level without a new AI call. The
-- single actingTogetherNarrative is removed. Overwrites the active row in place.

update public.atad2_prompts set
  version = 5,
  system_prompt = $prompt$You are a senior Dutch international tax specialist establishing the facts for an ATAD2 technical appendix for {{TAXPAYER_NAME}}, financial year {{FISCAL_YEAR}}.

You are given the source documents, the entity register (each entity has a stable id like E1, with name, jurisdiction, type, role and ownership %), grounded literature, the assessment answers and the structure block. From these, propose the following and nothing else, as JSON:

1. nlTaxStatusByEntityId: for EVERY entity id, its Dutch tax status, as exactly one of these keys:
   - "resident": a Dutch resident taxpayer (binnenlands belastingplichtig for CIT).
   - "nonresident_pe": a non-resident taxpayer with a Dutch permanent establishment (buitenlands belastingplichtig, NL VI).
   - "outside_cit": outside the scope of Dutch CIT (buiten NL Vpb), but still a non-transparent entity.
   - "transparent": fiscally transparent for Dutch purposes (NL looks through, e.g. a CV/partnership).
   - "unknown": cannot be determined from the inputs.
   A resident, a non-resident with a PE and an outside-CIT entity are all NON-transparent for NL; only "transparent" is looked through. Use the GROUNDED_LITERATURE to classify foreign legal forms naar Nederlandse maatstaven, taking the financial year into account (the Wet FKR changed the rules from 1-1-2025; before that the toestemmingsvereiste applied to CV-achtigen). Use "unknown" if the inputs do not support a choice.
2. actingTogether: candidate clusters of entities (two or more, by entity id) that could in theory form an acting-together group (samenwerkende groep) - typically co-investors or subfondsen whose combined interest could cross the 25% related-party threshold. Identify at most the four most relevant candidate clusters. For EACH cluster return:
   - memberEntityIds and combinedPct,
   - likelihood: the single best-fitting level on this scale: "highly_unlikely", "unlikely", "unclear", "likely", "highly_likely",
   - rationales: an object with a SHORT one-to-two sentence rationale for EACH of the five levels ("highly_unlikely", "unlikely", "unclear", "likely", "highly_likely"). Each rationale must read as a self-contained justification for THAT level ("there is no indication because ..." toward the unlikely end; "there are indications because ..." toward the likely end), grounded on the GROUNDED_LITERATURE: coordination is the key test (a general partner / management company with material control + parallel comparable equity and (risk-bearing) loan funding); subfondsen usually qualify, passive co-investors usually do not; the threshold is 25% via art. 12ac lid 2; per-investment assessment. The advisor may switch the level, so all five must be plausible, defensible texts.
3. transactions: the intra-group flows between related entities that the ATAD2 articles test, each with from/to entity id, kind, instrument, a short note, and which article(s) it triggers (e.g. "12aa(1)(a)").
4. classifications: for each entity that matters for hybridity, how it is treated in its home state vs the relevant counterparty/source state (transparent, opaque or disregarded), and whether that is a mismatch (hybrid=true when home and source differ).

=== HARD RULES ===
- Use ONLY the entity ids given. Never invent an entity, edge, payment, percentage, jurisdiction or classification not supported by the inputs.
- Base the acting-together assessment and the NL classification on the GROUNDED_LITERATURE; do not invent rules beyond it. If there are no plausible candidate clusters, return an empty actingTogether array.
- Reference entities by their id (E1, E2 ...). Where a fact is unknown, omit it (or use "unknown" for the tax status) rather than guessing.
- Measured, advisory tone. No em-dashes.

=== OUTPUT FORMAT (STRICT) ===
Return ONLY a JSON object: {"nlTaxStatusByEntityId":{...},"actingTogether":[{"memberEntityIds":[...],"combinedPct":..,"likelihood":"..","rationales":{"highly_unlikely":"..","unlikely":"..","unclear":"..","likely":"..","highly_likely":".."}}],"transactions":[...],"classifications":[...]}

=== INPUTS ===
GROUNDED_LITERATURE (Dutch tax doctrine; cite implicitly, do not contradict):
{{KB_BLOCK}}

SOURCE_DOCUMENTS:
{{DOCUMENTS_BLOCK}}

ENTITY_REGISTER:
{{ENTITY_REGISTER}}

ANSWERS_BLOCK:
{{ANSWERS_BLOCK}}

STRUCTURE_BLOCK:
{{STRUCTURE_BLOCK}}$prompt$,
  notes = 'v5: acting-together per-cluster likelihood (5 levels) + rationale per level; narrative removed.'
where key = 'appendix_facts_system' and is_active = true;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260609190000_appendix_facts_prompt_v5_acting_likelihood.sql
git commit -m "feat(prompt): appendix_facts_system v5 acting-together likelihood + per-level rationales"
```

---

### Task 11: Deploy edge + migration to the VM (controller)

**Files:** none (VM ops). The controller runs this with PIM active, mirroring the established pattern: base64 each changed file into `/root/supabase-docker/volumes/functions/generate-appendix/`, apply the migration via `docker exec ... psql -U supabase_admin`, `docker restart supabase-edge-functions`, md5-verify host vs container, curl smoke test (`POST .../generate-appendix` with the anon key → expect HTTP 400 `{"error":"Missing session_id"}`).

- [ ] **Step 1: Apply the v5 migration**

`docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/facts_v5.sql` then confirm `select key, version from atad2_prompts where key='appendix_facts_system' and is_active;` returns version 5.

- [ ] **Step 2: Deploy the three edge files**

Write `index.ts`, `factsBuild.ts`, `factsSchemas.ts` into the function dir; `docker restart supabase-edge-functions`; md5-verify host vs `/home/deno/functions/generate-appendix/<file>` for all three.

- [ ] **Step 3: Smoke test**

`curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8000/functions/v1/generate-appendix -H "Authorization: Bearer <anon>" -H "apikey: <anon>" -H 'Content-Type: application/json' -d '{}'` → expect 400 with `{"error":"Missing session_id"}` (proves the module loads with the new imports).

- [ ] **Step 4: End-to-end retrieval still works**

Re-run `scripts/kb/probe.mjs` (acting-together + classification queries) to confirm the KB grounding is unchanged.

---

## Phase 5 — Final verification

### Task 12: Full suite + build + holistic review

- [ ] **Step 1: Run the whole appendix + assessment test suite**

Run: `npm run test -- src/lib/ --run`
Expected: all green (steps, actingLikelihood, actingCluster, emptyFacts, visibleFacts, factsExport, printAppendix, buildAppendixBlock, plus the untouched suites).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Dispatch the final code-review subagent** over the whole branch diff (flow reorder, hidden filter, acting-together redesign, edge + prompt) per superpowers:requesting-code-review, then finish per superpowers:finishing-a-development-branch.

---

## Self-review (against the spec)

**Spec coverage:**
- Part 1 (flow reorder) → Tasks 1-2. ✓
- Part 2 (appendix-hidden → chart) → Task 3. ✓
- Part 3 (acting-together likelihood): scale → Task 4; model + helpers + facts plumbing → Task 5; UI → Task 6; export → Task 7; stale-ref cleanup → Task 8; edge mirror/schema/build/merge → Task 9; prompt v5 → Task 10; deploy → Task 11. ✓
- "Acting together" label (drop Dutch) → Task 6 (title is "Acting together"). ✓
- Narrative removed → Tasks 5, 7, 9, 10. ✓

**Placeholder scan:** no TBD/"handle edge cases" left; the AI-omits-levels fallback is concrete (`"No specific assessment for this level."`); legacy tolerance handled by `normalizeFacts` + the merge defaulting.

**Type consistency:** `ActingLikelihood` keys identical across `actingLikelihood.ts`, `types.ts`, `actingCluster.ts`, `factsBuild.ts`, `factsSchemas.ts`, the prompt JSON, and `index.ts`. Helper names (`withClusterLikelihood`/`withClusterText`/`withClusterExclude`) used identically in Tasks 5 and 6. `actingLikelihoodLabel` used in Tasks 6, 7. `hiddenChartIds` consistent within Task 3.

**One known follow-on:** the structure step's existing `visibleEntities` orphan handling will treat children of a hidden intermediary as orphans (reachable only via the hidden node) — acceptable (they surface under the existing "N disconnected · Show" toggle). Not a blocker.
