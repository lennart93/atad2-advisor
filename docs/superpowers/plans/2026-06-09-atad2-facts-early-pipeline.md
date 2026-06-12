# ATAD2 Early Pipeline + Part A Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ATAD2 Part A facts fiscal-unity-aware, let advisors hide irrelevant entities, populate the classification matrix + transaction map from the documents, and run the structure/facts/appendix AI work early in the background so the steps never make the user wait.

**Architecture:** The deterministic entity-register builder (mirrored frontend + Deno edge) reads the chart's `atad2_structure_groupings` and collapses a fiscal unity into a single taxpayer `E1`. A `hidden` flag on each entity cascades through every Part A view, the export and the memo grounding. The facts-proposal prompt gains the documents block so it can populate even before the questions are answered. The appendix prewarm is decoupled from the Structure screen into a session-level hook, and `extract-structure` Phase A is triggered right after document upload; the answers later trigger Phase B + a re-run.

**Tech Stack:** React + Vite + TypeScript (frontend); Vitest (`npm run test -- src/lib/appendix/`); self-hosted Supabase Deno edge functions (`generate-appendix`, `extract-structure`); DB migrations applied to the live VM via `az vm run-command` as `supabase_admin`.

---

## Reference (read before starting)

- `src/lib/appendix/types.ts` — `FactEntity`, `AppendixFacts`, `ClassificationItem`, `TransactionItem`, `ActingTogetherCluster`.
- `src/lib/appendix/facts/entityRegister.ts` (frontend) and `supabase/functions/generate-appendix/factsBuild.ts` (Deno edge) — the two copies of `buildEntityRegister`; **keep identical**.
- `src/lib/structure/client.ts` `loadChart(sessionId)` returns `{ chart, entities, edges, groupings }`. `StructureGroup` = `atad2_structure_groupings` Row: `{ id, chart_id, kind, label, member_ids, ... }`. The fiscal-unity kind is the literal `'fiscal_unity'` (see `src/components/structure/EntityInspector.tsx:27`).
- `supabase/functions/extract-structure/documentsLoader.ts` — `loadDocumentsBlock(client, sessionId)` reads `atad2_session_documents` + downloads from the `session-documents` storage bucket; mirror it in `generate-appendix`.
- Edge deploy pattern (from `docs/superpowers/plans/2026-06-08-atad2-appendix-facts-layer.md`): base64 the changed files into `/root/supabase-docker/volumes/functions/<name>/`, `docker restart` the `supabase-edge-functions` container, md5-verify host vs container. Migrations: pipe the SQL into `docker exec -i $(docker ps --filter name=supabase-db -q) psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1`, run via `& "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke --resource-group rg-atad2-prod --name adn-x-s-5 --command-id RunShellScript --scripts "@<file>.sh" --query "value[0].message" -o tsv`. Module-load smoke test: `curl -s -m 20 -X POST http://localhost:8000/functions/v1/<fn> -H "Authorization: Bearer <anon>" -H "apikey: <anon>" -d '{}'` should return a clean 4xx JSON, not a boot error.
- Branch `feat/technical-appendix`; do NOT push to main.

---

# Phase 1 — Fiscal-unity-aware entity register

## Task 1: Extend FactEntity for fiscal unity

**Files:** Modify `src/lib/appendix/types.ts`

- [ ] **Step 1: Add the fields**

In `interface FactEntity`, add after `nlTaxStatus: string | null;`:

```ts
  /** True on the synthetic taxpayer that represents a fiscal unity. */
  isFiscalUnity?: boolean;
  /** On the fiscal-unity entity: the chart entity ids of its members. */
  memberEntityIds?: string[];
  /** On a member row: the register id (e.g. "E1") of the fiscal unity it belongs to. */
  memberOfUnityId?: string;
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/appendix/types.ts
git commit -m "feat(appendix): FactEntity fiscal-unity fields"
```

## Task 2: Fiscal-unity-aware buildEntityRegister (frontend)

**Files:**
- Modify: `src/lib/appendix/facts/entityRegister.ts`
- Test: `src/lib/appendix/__tests__/entityRegister.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/appendix/__tests__/entityRegister.test.ts`:

```ts
import type { StructureGroup } from '@/lib/structure/types';

const grp = (id: string, kind: string, members: string[]): StructureGroup =>
  ({ id, chart_id: 'ch', kind, label: 'Fiscale eenheid Acme c.s.', member_ids: members } as unknown as StructureGroup);

describe('buildEntityRegister fiscal unity', () => {
  it('collapses a fiscal unity that contains the taxpayer into a single E1', () => {
    const entities = [
      ent('c1', 'Acme Holding BV', true),       // taxpayer (head of the unity)
      ent('c2', 'Acme BV'),                      // unity member
      ent('c3', 'Parent Coop'),                  // external parent
      ent('c4', 'Sub Inc', false, 'US'),         // external subsidiary
    ];
    const edges = [edge('c3', 'c1', 40), edge('c1', 'c4', 100)];
    const reg = buildEntityRegister(entities, edges, [grp('g1', 'fiscal_unity', ['c1', 'c2'])]);
    const e1 = reg[0];
    expect(e1.id).toBe('E1');
    expect(e1.isFiscalUnity).toBe(true);
    expect(e1.role).toBe('Taxpayer');
    expect(e1.name).toBe('Fiscale eenheid Acme c.s.');
    expect(e1.memberEntityIds).toEqual(['c1', 'c2']);
    // members are present but flagged as belonging to the unity, not numbered as parties
    const members = reg.filter((r) => r.memberOfUnityId === 'E1');
    expect(members.map((m) => m.name).sort()).toEqual(['Acme BV', 'Acme Holding BV']);
    expect(members.every((m) => m.related === false)).toBe(true);
    // external parties are numbered and related as normal
    const parent = reg.find((r) => r.name === 'Parent Coop')!;
    expect(parent.role).toBe('Parent');
    expect(parent.related).toBe(true); // 40% > 25%
    const sub = reg.find((r) => r.name === 'Sub Inc')!;
    expect(sub.role).toBe('Subsidiary');
  });

  it('without a fiscal unity, behaves exactly as before (taxpayer is E1)', () => {
    const entities = [ent('c1', 'TaxPayer BV', true), ent('c2', 'Sub', false, 'US')];
    const reg = buildEntityRegister(entities, [edge('c1', 'c2', 60)], []);
    expect(reg[0].id).toBe('E1');
    expect(reg[0].isFiscalUnity).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npm run test -- src/lib/appendix/__tests__/entityRegister.test.ts` (arity / behavior mismatch).

- [ ] **Step 3: Rewrite the implementation**

Replace `src/lib/appendix/facts/entityRegister.ts` with:

```ts
import type { StructureEntity, StructureEdge, StructureGroup } from '@/lib/structure/types';
import type { FactEntity } from '@/lib/appendix/types';

const RELATED_THRESHOLD = 25;
const FISCAL_UNITY_KIND = 'fiscal_unity';

/**
 * Deterministic entity register from the structure chart.
 *
 * A fiscal unity (an atad2_structure_groupings row of kind 'fiscal_unity' that
 * contains the taxpayer) is collapsed into one synthetic taxpayer E1; its members
 * are listed (flagged memberOfUnityId) but never counted as separate related
 * parties, and relatedness is measured from the whole unity outward. Without a
 * fiscal unity the single is_taxpayer entity is E1, exactly as before.
 */
export function buildEntityRegister(
  entities: StructureEntity[],
  edges: StructureEdge[],
  groupings: StructureGroup[] = [],
): FactEntity[] {
  const taxpayer = entities.find((e) => e.is_taxpayer) ?? null;
  if (!taxpayer) return [];

  const byId = new Map(entities.map((e) => [e.id, e]));
  const present = (id: string) => byId.has(id);

  const fu = groupings.find(
    (g) => g.kind === FISCAL_UNITY_KIND && Array.isArray(g.member_ids) && (g.member_ids as string[]).includes(taxpayer.id),
  ) ?? null;
  const memberIds: string[] = fu ? (fu.member_ids as string[]).filter(present) : [];
  const memberSet = new Set<string>(fu ? memberIds : [taxpayer.id]); // the "taxpayer side"

  // Classify every non-side entity as Parent / Subsidiary / Group entity by its
  // edges to ANY member of the taxpayer side.
  type Pre = { ent: StructureEntity; role: FactEntity['role']; pct: number | null };
  const ext = new Map<string, Pre>();
  for (const ed of edges) {
    const pct = (ed.ownership_pct as number | null) ?? null;
    const from = ed.from_entity_id as string;
    const to = ed.to_entity_id as string;
    if (memberSet.has(to) && !memberSet.has(from) && byId.has(from) && !ext.has(from)) {
      ext.set(from, { ent: byId.get(from)!, role: 'Parent', pct });
    } else if (memberSet.has(from) && !memberSet.has(to) && byId.has(to) && !ext.has(to)) {
      ext.set(to, { ent: byId.get(to)!, role: 'Subsidiary', pct });
    }
  }
  for (const e of entities) {
    if (memberSet.has(e.id) || ext.has(e.id)) continue;
    ext.set(e.id, { ent: e, role: 'Group entity', pct: null });
  }

  const order = { Parent: 1, Subsidiary: 2, 'Group entity': 3 } as const;
  const sortedExt = [...ext.values()].sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if ((b.pct ?? -1) !== (a.pct ?? -1)) return (b.pct ?? -1) - (a.pct ?? -1);
    return a.ent.name.localeCompare(b.ent.name);
  });

  const toFact = (id: string, ent: StructureEntity, role: FactEntity['role'], pct: number | null): FactEntity => ({
    id,
    chartEntityId: ent.id,
    name: ent.name,
    jurisdiction: (ent.jurisdiction_iso as string | null) ?? null,
    entityType: (ent.entity_type as string | null) ?? null,
    role,
    ownershipPct: pct,
    related: pct != null && pct > RELATED_THRESHOLD,
    nlTaxStatus: null,
  });

  const out: FactEntity[] = [];
  if (fu) {
    out.push({
      id: 'E1',
      chartEntityId: `fu:${fu.id}`,
      name: fu.label,
      jurisdiction: (taxpayer.jurisdiction_iso as string | null) ?? null,
      entityType: 'Fiscal unity',
      role: 'Taxpayer',
      ownershipPct: null,
      related: false,
      nlTaxStatus: null,
      isFiscalUnity: true,
      memberEntityIds: memberIds,
    });
  } else {
    out.push(toFact('E1', taxpayer, 'Taxpayer', null));
  }

  let n = out.length;
  for (const p of sortedExt) out.push(toFact(`E${++n}`, p.ent, p.role, p.pct));

  // Member rows (only when there is a fiscal unity): listed after, flagged, never related.
  if (fu) {
    for (const id of memberIds) {
      const ent = byId.get(id)!;
      out.push({ ...toFact(`E${++n}`, ent, 'Group entity', null), memberOfUnityId: 'E1', related: false });
    }
  }

  return out;
}
```

- [ ] **Step 4: Update the two callers to pass groupings.**

In `src/pages/AssessmentAppendix.tsx`, the chart effect already keeps `chart`. Change the `chart` state type and the build call to include groupings:
- where `setChart({ entities: c.entities, edges: c.edges })` is, change to `setChart({ entities: c.entities, edges: c.edges, groupings: c.groupings })`;
- change the `chart` state type to `{ entities: ...; edges: ...; groupings: Parameters<typeof buildEntityRegister>[2] } | null`;
- change `buildEntityRegister(chart.entities, chart.edges)` to `buildEntityRegister(chart.entities, chart.edges, chart.groupings)`.

- [ ] **Step 5: Run tests + build** — `npm run test -- src/lib/appendix/__tests__/entityRegister.test.ts` (PASS), `npm run build` (PASS).

- [ ] **Step 6: Commit**

```bash
git add src/lib/appendix/facts/entityRegister.ts src/lib/appendix/__tests__/entityRegister.test.ts src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): fiscal-unity-aware entity register (frontend)"
```

## Task 3: Mirror the builder in the edge

**Files:** Modify `supabase/functions/generate-appendix/factsBuild.ts`, `supabase/functions/generate-appendix/index.ts`

- [ ] **Step 1: Port the algorithm.** In `factsBuild.ts`, add a `RawGroup` interface and extend `buildEntityRegister` to accept `groupings: RawGroup[] = []`, applying the SAME algorithm as the frontend (Task 2 step 3), using `g.kind === 'fiscal_unity'` and `g.member_ids`. Add `isFiscalUnity?`, `memberEntityIds?`, `memberOfUnityId?` to the edge's `FactEntity` interface to match `src/lib/appendix/types.ts`.

```ts
export interface RawGroup { id: string; kind: string; label: string; member_ids: string[]; }
```

- [ ] **Step 2: Load groupings in the edge.** In `index.ts` `loadChartRaw`, also select the chart's groupings and return them:

```ts
  const { data: groups } = await c
    .from("atad2_structure_groupings")
    .select("id, kind, label, member_ids").eq("chart_id", chart.id);
```
Return `{ entities, edges, groups: (groups ?? []) as RawGroup[] }` and pass `rawChart.groups` as the 3rd arg to `buildEntityRegister(rawChart.entities, rawChart.edges, rawChart.groups)`.

- [ ] **Step 3: Deploy + module-load smoke test** (base64 deploy `factsBuild.ts` + `index.ts`, restart, md5-verify, curl smoke → 400 Missing session_id).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-appendix/factsBuild.ts supabase/functions/generate-appendix/index.ts
git commit -m "feat(appendix): fiscal-unity-aware entity register (edge, applied)"
```

---

# Phase 2 — Hide irrelevant entities

## Task 4: `hidden` flag + visible-facts filter

**Files:**
- Modify: `src/lib/appendix/types.ts`
- Create: `src/lib/appendix/facts/visibleFacts.ts`
- Test: `src/lib/appendix/__tests__/visibleFacts.test.ts`

- [ ] **Step 1: Add `hidden` to FactEntity.** In `src/lib/appendix/types.ts`, in `FactEntity`, add `hidden?: boolean;` after `nlTaxStatus`.

- [ ] **Step 2: Write the failing test** — `src/lib/appendix/__tests__/visibleFacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { visibleFacts } from '@/lib/appendix/facts/visibleFacts';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';

const fe = (id: string, hidden = false) =>
  ({ id, chartEntityId: id, name: id, jurisdiction: 'NL', entityType: 'BV', role: 'Group entity', ownershipPct: null, related: false, nlTaxStatus: null, hidden } as const);

describe('visibleFacts', () => {
  it('drops hidden entities and any classification/transaction that references them', () => {
    const f = { ...emptyFacts(),
      entities: [fe('E1'), fe('E2', true)],
      classifications: [
        { entityId: 'E1', homeState: 'NL', homeClass: 'x', sourceState: null, sourceClass: null, hybrid: false, status: 'confirmed', excludedFromClient: false, source: 'ai' },
        { entityId: 'E2', homeState: 'NL', homeClass: 'y', sourceState: null, sourceClass: null, hybrid: false, status: 'confirmed', excludedFromClient: false, source: 'ai' },
      ],
      transactions: [
        { id: 'T1', fromEntityId: 'E1', toEntityId: 'E2', kind: 'loan', instrument: null, note: null, articlesTested: [], status: 'confirmed', excludedFromClient: false, source: 'ai' },
      ],
    } as never;
    const out = visibleFacts(f);
    expect(out.entities.map((e) => e.id)).toEqual(['E1']);
    expect(out.classifications.map((c) => c.entityId)).toEqual(['E1']);
    expect(out.transactions).toEqual([]); // T1 referenced hidden E2
  });
});
```

- [ ] **Step 3: Run (FAIL), implement** — `src/lib/appendix/facts/visibleFacts.ts`:

```ts
import type { AppendixFacts } from '../types';

/** Facts with advisor-hidden entities removed, cascading to anything that references them. */
export function visibleFacts(facts: AppendixFacts): AppendixFacts {
  const hidden = new Set(facts.entities.filter((e) => e.hidden).map((e) => e.id));
  if (hidden.size === 0) return facts;
  return {
    entities: facts.entities.filter((e) => !e.hidden),
    classifications: facts.classifications.filter((c) => !hidden.has(c.entityId)),
    transactions: facts.transactions.filter((t) => !hidden.has(t.fromEntityId) && !hidden.has(t.toEntityId)),
    actingTogether: facts.actingTogether.filter((a) => !a.memberEntityIds.some((id) => hidden.has(id))),
  };
}
```
Run the test → PASS.

- [ ] **Step 4: Apply the filter in the export + grounding.**
- In `src/lib/appendix/factsExport.ts` `factsForClient`, run `visibleFacts(facts)` first (compose: `const f = visibleFacts(facts);` then filter proposed/excluded on `f`).
- In `src/lib/appendix/buildAppendixBlock.ts` `buildFactsSummary`, change `const f = factsForClient(facts);` (already calls factsForClient which now strips hidden) — no further change needed once factsForClient strips hidden.

- [ ] **Step 5: Run full suite + build** — `npm run test -- src/lib/appendix/` (PASS), `npm run build` (PASS).

- [ ] **Step 6: Commit**

```bash
git add src/lib/appendix/types.ts src/lib/appendix/facts/visibleFacts.ts src/lib/appendix/__tests__/visibleFacts.test.ts src/lib/appendix/factsExport.ts
git commit -m "feat(appendix): hidden-entity flag + visible-facts cascade filter"
```

## Task 5: Hide control + member nesting in the Part A panel

**Files:** Modify `src/components/appendix/FactsPanel.tsx`, `src/pages/AssessmentAppendix.tsx`

- [ ] **Step 1: Render with `visibleFacts` + nest members + hide control.** In `FactsPanel.tsx`:
- import `visibleFacts` and compute `const shown = visibleFacts(facts);` at the top of the component; render the entity register, relatedness, CLS and transactions from `shown` (so hidden entities never appear). The relatedness list must also skip `memberOfUnityId` rows (they are part of the taxpayer): `shown.entities.filter((e) => e.role !== 'Taxpayer' && !e.memberOfUnityId)`.
- in the entity register, render `memberOfUnityId` rows indented under their unity (a leading "↳" and muted text), and render a fiscal-unity badge on `isFiscalUnity` rows.
- when `onChange` is provided, each NON-member, non-taxpayer entity row gets a small "mark irrelevant" ✕ button that sets `hidden: true` on that entity via `onChange({ ...facts, entities: facts.entities.map((e) => e.id === id ? { ...e, hidden: true } : e) })`.
- a footer "Hidden (N) · show" that lists `facts.entities.filter((e) => e.hidden)` with a restore action (`hidden: false`), shown only when `onChange` is provided and there is at least one hidden entity.

- [ ] **Step 2: Build** — `npm run build` (PASS). The existing 39 appendix tests stay green (`npm run test -- src/lib/appendix/`).

- [ ] **Step 3: Commit**

```bash
git add src/components/appendix/FactsPanel.tsx src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): hide-entity control + fiscal-unity member nesting"
```

## Task 6: Preserve hidden + fiscal-unity flags across regeneration (edge)

**Files:** Modify `supabase/functions/generate-appendix/index.ts`

- [ ] **Step 1: Carry the advisor-set `hidden` flag.** In `mergeFacts`, the entity register is rebuilt fresh each run (deterministic), which would drop advisor `hidden` flags. Before returning, re-apply `hidden` from the existing facts by `chartEntityId`:

```ts
  const exHidden = new Set((existing?.entities ?? []).filter((e) => (e as { hidden?: boolean }).hidden).map((e) => e.chartEntityId));
  const entities = fresh.entities.map((e) => exHidden.has(e.chartEntityId) ? { ...e, hidden: true } : e);
```
Use `entities` (not `fresh.entities`) in the returned object of `mergeFacts`. (Apply the same in the `!existing` branch: just `fresh.entities`.)

- [ ] **Step 2: Deploy + smoke test + commit** (base64 deploy `index.ts`, restart, md5-verify, curl 400).

```bash
git add supabase/functions/generate-appendix/index.ts
git commit -m "feat(appendix): preserve hidden-entity flag across regeneration (applied)"
```

---

# Phase 3 — Documents into the facts proposal + empty state

## Task 7: Documents block in the facts proposal

**Files:**
- Create: `supabase/functions/generate-appendix/documentsLoader.ts`
- Modify: `supabase/functions/generate-appendix/index.ts`
- Create: `supabase/migrations/20260609170000_appendix_facts_prompt_v2_documents.sql`

- [ ] **Step 1: Add the documents loader.** Copy `supabase/functions/extract-structure/documentsLoader.ts` verbatim to `supabase/functions/generate-appendix/documentsLoader.ts` (same `loadDocumentsBlock` exported).

- [ ] **Step 2: Feed it into `buildFacts`.** In `index.ts`, import `loadDocumentsBlock`. In `buildFacts`, load the documents block and add `.replace("{{DOCUMENTS_BLOCK}}", docsBlock || "(no documents)")` to the `user` fill. Pass `c` + `sessionId` into `buildFacts` (add a `sessionId` parameter and pass it at the call site). Load once: `const docsBlock = await loadDocumentsBlock(c, sessionId);`.

- [ ] **Step 3: Prompt migration.** `20260609170000_appendix_facts_prompt_v2_documents.sql`:

```sql
update public.atad2_prompts
set version = 2,
    system_prompt = replace(
      system_prompt,
      'ENTITY_REGISTER:',
      'DOCUMENTS:
{{DOCUMENTS_BLOCK}}

ENTITY_REGISTER:'
    )
where key = 'appendix_facts_system' and system_prompt not like '%{{DOCUMENTS_BLOCK}}%';
```
Apply on the VM (az + psql), verify `select version, system_prompt like '%{{DOCUMENTS_BLOCK}}%' from atad2_prompts where key='appendix_facts_system';`.

- [ ] **Step 4: Deploy edge + smoke test + commit.**

```bash
git add supabase/functions/generate-appendix/documentsLoader.ts supabase/functions/generate-appendix/index.ts supabase/migrations/20260609170000_appendix_facts_prompt_v2_documents.sql
git commit -m "feat(appendix): feed documents into the facts proposal (applied)"
```

## Task 8: "none identified" vs "not generated yet"

**Files:** Modify `src/components/appendix/FactsPanel.tsx`, `src/pages/AssessmentAppendix.tsx`

- [ ] **Step 1: Pass a `generated` flag.** In `AssessmentAppendix.tsx`, pass `generated={!!appendix?.facts}` to `<FactsPanel>`. In `FactsPanel`, add the prop. For the CLS and Transaction exhibits, show "None identified." when `generated && items.length === 0`, and "Not generated yet." when `!generated`.

- [ ] **Step 2: Build + commit.** `npm run build` (PASS).

```bash
git add src/components/appendix/FactsPanel.tsx src/pages/AssessmentAppendix.tsx
git commit -m "feat(appendix): distinguish 'none identified' from 'not generated yet'"
```

---

# Phase 4 — Early background pipeline

## Task 9: Decouple the appendix prewarm into a session-level hook

**Files:**
- Create: `src/hooks/useAppendixPrewarm.ts`
- Modify: `src/components/structure/StructureChartStep.tsx` (remove its inline prewarm), `src/pages/Assessment.tsx` (mount the hook)

- [ ] **Step 1: Create the hook.** `src/hooks/useAppendixPrewarm.ts`:

```ts
import { useEffect, useRef } from 'react';
import { loadChart } from '@/lib/structure/client';
import { startAppendixGeneration } from '@/lib/appendix/client';

/**
 * Fire the appendix/facts generation once, as soon as the structure chart for
 * this session has been drafted — regardless of which assessment step the user is
 * on. Replaces the prewarm that used to live inside StructureChartStep.
 */
export function useAppendixPrewarm(sessionId: string | undefined): void {
  const fired = useRef(false);
  useEffect(() => {
    if (!sessionId || fired.current) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || fired.current) return;
      try {
        const c = await loadChart(sessionId);
        const status = c?.chart?.status;
        if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') {
          fired.current = true;
          startAppendixGeneration(sessionId).catch(() => {});
          return;
        }
      } catch { /* keep polling */ }
      if (!cancelled) timer = setTimeout(tick, 5000);
    };
    let timer = setTimeout(tick, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId]);
}
```

- [ ] **Step 2: Remove the inline prewarm** from `src/components/structure/StructureChartStep.tsx` (the `appendixPrewarmedRef` effect that calls `startAppendixGeneration`). Read that file, delete that single effect and the now-unused import/ref.

- [ ] **Step 3: Mount the hook** once in `src/pages/Assessment.tsx` (the assessment shell that has the active `sessionId`): `useAppendixPrewarm(sessionId);`. Read `Assessment.tsx` to find the session id in scope and add the call near the top of the component.

- [ ] **Step 4: Build + commit.** `npm run build` (PASS).

```bash
git add src/hooks/useAppendixPrewarm.ts src/components/structure/StructureChartStep.tsx src/pages/Assessment.tsx
git commit -m "feat(appendix): session-level appendix prewarm hook"
```

## Task 10: Trigger structure extraction Phase A right after document upload

**Files:** Modify the document-upload completion path (`src/hooks/usePrefill.ts` and/or `src/components/assessment/DocumentUploadStep.tsx` — read both to find where prefill finishes) + `src/lib/structure/client.ts` (a `startExtraction` helper if one does not already exist)

- [ ] **Step 1: Find the trigger point + the extraction invoker.** Read `src/hooks/usePrefill.ts` and `src/components/assessment/DocumentUploadStep.tsx`. Identify (a) the point where documents are uploaded and the prefill swarm completes, and (b) how `extract-structure` is currently invoked (a `supabase.functions.invoke('extract-structure', { body: { session_id } })` call). If a client helper does not exist, add `startStructureExtraction(sessionId)` to `src/lib/structure/client.ts`:

```ts
export async function startStructureExtraction(sessionId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('extract-structure', { body: { session_id: sessionId } });
  if (error) throw error;
}
```

- [ ] **Step 2: Fire Phase A after documents are processed.** At the point identified in Step 1 (after the documents exist / prefill completes), call `startStructureExtraction(sessionId).catch(() => {})` in the background. `extract-structure` Phase A only needs the documents, so it produces a draft chart; the `useAppendixPrewarm` hook then chains the appendix once the chart is `draft_ready`. Guard so it fires once per session (e.g. a ref, or only when the chart does not yet exist).

- [ ] **Step 3: Build + commit.** `npm run build` (PASS).

```bash
git add src/hooks/usePrefill.ts src/components/assessment/DocumentUploadStep.tsx src/lib/structure/client.ts
git commit -m "feat(structure): extract the chart in the background after document upload"
```

---

# Phase 5 — Update on answers

## Task 11: Re-run on answers completion

**Files:** Modify the questions/confirmation completion path (`src/pages/AssessmentConfirmation.tsx` — read it to find where the user finishes the questions and proceeds)

- [ ] **Step 1: Find the completion point.** Read `src/pages/AssessmentConfirmation.tsx` (the step after Questions). Identify where the answers are finalized / the user proceeds toward Structure.

- [ ] **Step 2: Trigger Phase B + appendix re-run.** At that point, in the background: call `startStructureExtraction(sessionId)` (Phase B self-chains because answers now exist — see `extract-structure/index.ts:134`), and then rely on the `useAppendixPrewarm` having already fired OR call `startAppendixGeneration(sessionId)` again to refresh the facts/articles with the answers. The existing `mergeFacts`/row merge preserve advisor confirmations, edits, hidden entities and exclusions, so the refresh is non-destructive. Guard against duplicate fires.

- [ ] **Step 3: Build + commit.** `npm run build` (PASS).

```bash
git add src/pages/AssessmentConfirmation.tsx
git commit -m "feat(appendix): refresh facts + articles when the questions are answered"
```

## Task 12: Full regression

- [ ] **Step 1:** `npm run test -- src/lib/appendix/` — all pass.
- [ ] **Step 2:** `npm run build` — PASS.
- [ ] **Step 3:** Manual end-to-end on a test session: upload docs → confirm the chart drafts and Part A pre-fills in the background; answer the questions → confirm Part A + articles refresh; at the Appendix step confirm the fiscal unity is E1, members nest, the hide ✕ works, and CLS + transactions are populated.

---

## Notes for the implementer

- **Keep the two `buildEntityRegister` copies identical** (`src/lib/appendix/facts/entityRegister.ts` and `supabase/functions/generate-appendix/factsBuild.ts`).
- **Migrations + edge deploys go to the live VM** (az + psql; base64 deploy + restart + md5-verify; curl smoke test). Each migration is idempotent; delete temporary `apply_*.sh` / `deploy_*.sh` scripts after running (do not commit them).
- **Do not push to main.** Work stays on `feat/technical-appendix`.
- Tasks 10 and 11 are integration tasks that depend on the existing upload/confirmation wiring; read the named files first and follow the established `supabase.functions.invoke(...)` pattern. If the precise hook point is ambiguous, stop and report rather than guessing.
