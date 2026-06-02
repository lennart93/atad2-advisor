# Fiscale eenheid — dialog weg + auto-arrange — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eén-klik fiscale eenheid (geen dialog meer) en layout-algoritme dat unity-leden binnen elke rij aaneengesloten plaatst zodat het gestippelde kader alleen om de leden heen valt.

**Architecture:** `tierLayout` krijgt een optionele `groupings`-parameter. Tussen de bestaande barycenter sweep (Phase 5) en de row-wrap (Phase 6) komt een nieuwe Phase 5.5 die binnen elke rij token-sorteert: unity-leden vormen één blok, niet-leden gaan eromheen. Tokens worden gerangschikt op hun anchor X (huidige positie van het eerste lid), zodat de natuurlijke plek behouden blijft. De `AddFiscalUnityDialog` wordt verwijderd — toolbar-knop slaat direct op met default label.

**Tech Stack:** TypeScript + Vitest + bestaande React/React Flow stack.

**Spec:** [docs/superpowers/specs/2026-05-25-fiscal-unity-no-dialog-and-auto-arrange-design.md](../specs/2026-05-25-fiscal-unity-no-dialog-and-auto-arrange-design.md)

---

## File overview

| Bestand | Wijzigen / verwijderen | Wat |
|---|---|---|
| `src/lib/structure/tierLayout.ts` | wijzigen | Signature krijgt optionele `groupings`-array. Nieuwe Phase 5.5 (`groupUnityMembers`) tussen Phase 5 en Phase 6. |
| `src/lib/structure/__tests__/tierLayout.test.ts` | wijzigen | Test: unity-leden in dezelfde rij eindigen aaneengesloten. |
| `src/components/structure/StructureChartStep.tsx` | wijzigen | `groupings` doorgeven aan `tierLayout`. Dialog-mount weg. Knop-callback maakt direct een unity. |
| `src/components/structure/AddFiscalUnityDialog.tsx` | verwijderen | Niet meer gebruikt. |

---

## Task 1: `groupings`-parameter toevoegen aan `tierLayout`

**Files:**
- Modify: `src/lib/structure/tierLayout.ts:68-73`

- [ ] **Step 1: Signature uitbreiden**

Vervang regels 68–73:

```typescript
export function tierLayout(args: {
  entities: StructureEntity[];
  ownershipEdges: StructureEdge[];
  clusters: Cluster[];
}): TierLayoutResult {
  const { entities, ownershipEdges, clusters } = args;
```

Door:

```typescript
export function tierLayout(args: {
  entities: StructureEntity[];
  ownershipEdges: StructureEdge[];
  clusters: Cluster[];
  groupings?: StructureGroup[];
}): TierLayoutResult {
  const { entities, ownershipEdges, clusters } = args;
  const groupings = args.groupings ?? [];
```

- [ ] **Step 2: Import van StructureGroup toevoegen**

Helemaal bovenaan (regel 1), vervang:

```typescript
import type { StructureEntity, StructureEdge } from './types';
```

Door:

```typescript
import type { StructureEntity, StructureEdge, StructureGroup } from './types';
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Verwacht: geen nieuwe errors. (Bestaande call-sites werken nog omdat `groupings` optional is.)

- [ ] **Step 4: Tests draaien (regressie-check)**

```bash
npx vitest run src/lib/structure/__tests__/tierLayout.test.ts
```

Verwacht: alle bestaande tests slagen — gedrag is nog niet veranderd.

- [ ] **Step 5: Commit**

```bash
git add src/lib/structure/tierLayout.ts
git commit -m "refactor(structure): accept optional groupings param in tierLayout"
```

---

## Task 2: Unity-grouping logica (TDD)

We schrijven eerst de test die unity-leden contiguous verwacht, daarna implementeren we Phase 5.5.

**Files:**
- Modify: `src/lib/structure/__tests__/tierLayout.test.ts`
- Modify: `src/lib/structure/tierLayout.ts` (nieuw blok tussen regels 163 en 165)

- [ ] **Step 1: Test toevoegen**

Voeg deze test toe binnen het `describe('tierLayout', ...)` blok in `tierLayout.test.ts`, vlak vóór de afsluitende `});` van die describe:

```typescript
  it('unity-leden binnen dezelfde rij worden contiguous geplaatst', () => {
    // 5 broers/zussen onder dezelfde ouder: a, b, c, d, e (alfabetisch).
    // Unity = {a, c, e} (3 niet-aanliggende leden). Verwacht: a, c, e komen
    // aaneengesloten te staan; b en d worden eruit geschoven.
    const tx = ent('tx', { is_taxpayer: true });
    const a = ent('a');
    const b = ent('b');
    const c = ent('c');
    const d = ent('d');
    const e = ent('e');
    const result = tierLayout({
      entities: [tx, a, b, c, d, e],
      ownershipEdges: [
        ownEdge('tx', 'a'),
        ownEdge('tx', 'b'),
        ownEdge('tx', 'c'),
        ownEdge('tx', 'd'),
        ownEdge('tx', 'e'),
      ],
      clusters: [],
      groupings: [{
        id: 'g1',
        chart_id: 'c1',
        kind: 'fiscal_unity',
        label: 'F.E.',
        member_ids: ['a', 'c', 'e'],
        created_at: '',
      }],
    });
    // Sorteer rij-leden op X.
    const xs = [
      { id: 'a', x: result.positions.get('a')!.x },
      { id: 'b', x: result.positions.get('b')!.x },
      { id: 'c', x: result.positions.get('c')!.x },
      { id: 'd', x: result.positions.get('d')!.x },
      { id: 'e', x: result.positions.get('e')!.x },
    ].sort((p, q) => p.x - q.x);
    const order = xs.map((p) => p.id);
    // a, c, e moeten op 3 opeenvolgende posities staan (in willekeurige volgorde t.o.v. elkaar).
    const aIdx = order.indexOf('a');
    const cIdx = order.indexOf('c');
    const eIdx = order.indexOf('e');
    const members = [aIdx, cIdx, eIdx].sort((p, q) => p - q);
    expect(members[2] - members[0]).toBe(2); // 3 aaneengesloten posities
  });
```

- [ ] **Step 2: Test laten falen**

```bash
npx vitest run src/lib/structure/__tests__/tierLayout.test.ts
```

Verwacht: de nieuwe test faalt — `a`, `c`, `e` zijn nog niet aaneengesloten.

- [ ] **Step 3: Phase 5.5 toevoegen in `tierLayout.ts`**

Zoek naar regel 163 (sluiting van de barycenter sweep `}` op regel 163) en regel 165 (`// Phase 6: row-wrap`). Voeg ertussenin:

```typescript

  // Phase 5.5: Unity grouping — binnen elke rij komen leden van dezelfde
  // fiscale eenheid aaneengesloten te staan. We bouwen "tokens": een
  // unity-blok = aaneengesloten reeks entities met dezelfde primary unity id,
  // een niet-lid = singleton token. Tokens worden gesorteerd op hun anchor X
  // (= huidige X van hun eerste entity), zodat de natuurlijke plek behouden
  // blijft. Niet-leden binnen een unity-blok worden eruit gehaald.
  if (groupings.length > 0) {
    const primaryUnity = new Map<string, string>(); // entityId -> unityId
    for (const g of groupings) {
      for (const mid of g.member_ids) {
        if (!primaryUnity.has(mid)) primaryUnity.set(mid, g.id);
      }
    }
    const slotUnityId = (s: Slot): string | null => {
      if (s.kind !== 'entity') return null;
      return primaryUnity.get(s.entity.id) ?? null;
    };
    for (const rank of ranksRendered) {
      const tier = slotsByRank.get(rank)!;
      const memberCount = tier.filter((s) => slotUnityId(s) !== null).length;
      if (memberCount < 2) continue;
      // Bouw tokens door tier in huidige volgorde af te wandelen.
      type Token = { unityId: string | null; slots: Slot[]; anchorX: number };
      const tokens: Token[] = [];
      for (const s of tier) {
        const uid = slotUnityId(s);
        const last = tokens[tokens.length - 1];
        if (uid !== null && last && last.unityId === uid) {
          last.slots.push(s);
        } else {
          tokens.push({ unityId: uid, slots: [s], anchorX: s.x });
        }
      }
      // Sorteer tokens op anchor X. Stabiel: tokens met gelijke anchor blijven in volgorde.
      tokens.sort((p, q) => p.anchorX - q.anchorX);
      // Flatten terug.
      const newOrder: Slot[] = [];
      for (const t of tokens) for (const s of t.slots) newOrder.push(s);
      // Vervang tier-array inhoud in-place.
      tier.length = 0;
      tier.push(...newOrder);
      repackTier(tier);
    }
  }
</typescript>

- [ ] **Step 4: Test draaien — moet groen worden**

```bash
npx vitest run src/lib/structure/__tests__/tierLayout.test.ts
```

Verwacht: alle 21 tests pass (de 20 bestaande + de nieuwe).

- [ ] **Step 5: Hele suite draaien**

```bash
npx vitest run
```

Verwacht: alle 119 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/structure/tierLayout.ts src/lib/structure/__tests__/tierLayout.test.ts
git commit -m "feat(structure): tierLayout groups fiscal unity members contiguously per row"
```

---

## Task 3: `groupings` doorgeven aan `tierLayout` vanuit StructureChartStep

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx:426-430`

- [ ] **Step 1: `groupings` toevoegen aan de call**

Vervang het `tierLayout`-blok (rond regel 426):

```typescript
    const result = tierLayout({
      entities: visibleEntities,
      ownershipEdges: ownership,
      clusters: activeClusters,
    });
```

Door:

```typescript
    const result = tierLayout({
      entities: visibleEntities,
      ownershipEdges: ownership,
      clusters: activeClusters,
      groupings,
    });
```

- [ ] **Step 2: Verifieer `runLayout` dependency-array**

Vlak na het bovenstaande, zoek de afsluiting van `useCallback`/`runLayout`. Voeg `groupings` toe aan de dependency-array zodat de layout opnieuw draait wanneer groupings veranderen.

In de `useCallback`-haakjes onderaan `runLayout` (rond regel 458):

```typescript
  }, [chart, visibleEntities, visibleEdges, expandedClusters, validation.hasBlocking]);
```

Vervang door:

```typescript
  }, [chart, visibleEntities, visibleEdges, expandedClusters, validation.hasBlocking, groupings]);
```

- [ ] **Step 3: TypeScript check + tests**

```bash
npx tsc --noEmit
npx vitest run
```

Verwacht: geen nieuwe errors, 119 tests groen.

- [ ] **Step 4: Commit**

```bash
git add src/components/structure/StructureChartStep.tsx
git commit -m "feat(structure): wire groupings into tierLayout call"
```

---

## Task 4: Dialog weghalen, direct opslaan

**Files:**
- Modify: `src/components/structure/StructureChartStep.tsx`
- Delete: `src/components/structure/AddFiscalUnityDialog.tsx`

- [ ] **Step 1: State + dialog-mount weghalen**

In `StructureChartStep.tsx`:

Verwijder de import:

```typescript
import { AddFiscalUnityDialog } from './AddFiscalUnityDialog';
```

Verwijder de state-regel:

```typescript
  const [fiscalUnityDialogOpen, setFiscalUnityDialogOpen] = useState(false);
```

Verwijder het JSX-blok dat de dialog mountte:

```typescript
      <AddFiscalUnityDialog
        open={fiscalUnityDialogOpen}
        onOpenChange={setFiscalUnityDialogOpen}
        memberCount={selection?.kind === 'nodes' ? selection.ids.length : 0}
        onConfirm={async (label) => {
          if (!chart || selection?.kind !== 'nodes') return;
          const created = await createGrouping({
            chart_id: chart.id,
            kind: 'fiscal_unity',
            label,
            member_ids: selection.ids,
          });
          setGroupings((prev) => [...prev, created]);
          setFiscalUnityDialogOpen(false);
          setSelection(null);
        }}
      />
```

- [ ] **Step 2: Toolbar-callback rechtstreeks opslaan**

Vervang de `onCreateFiscalUnity`-prop op `<FloatingToolbar>`:

```typescript
                onCreateFiscalUnity={() => setFiscalUnityDialogOpen(true)}
```

Door:

```typescript
                onCreateFiscalUnity={async () => {
                  if (!chart || selection?.kind !== 'nodes') return;
                  const created = await createGrouping({
                    chart_id: chart.id,
                    kind: 'fiscal_unity',
                    label: 'Fiscale eenheid',
                    member_ids: selection.ids,
                  });
                  setGroupings((prev) => [...prev, created]);
                  setSelection(null);
                }}
```

- [ ] **Step 3: Dialog-bestand verwijderen**

```bash
rm src/components/structure/AddFiscalUnityDialog.tsx
```

- [ ] **Step 4: TypeScript check + tests**

```bash
npx tsc --noEmit
npx vitest run
```

Verwacht: geen errors, 119 tests groen.

- [ ] **Step 5: Commit**

```bash
git add src/components/structure/StructureChartStep.tsx src/components/structure/AddFiscalUnityDialog.tsx
git commit -m "feat(structure): one-click fiscal unity (no dialog)"
```

---

## Task 5: Handmatige browser-test

**Files:** (geen)

- [ ] **Step 1: Dev server starten**

```bash
npm run dev
```

- [ ] **Step 2: Scenario lopen**

Open een chart met ≥3 entiteiten in één rij (bv. de S4-chart waar je eerder mee testte):

1. Shift-klik twee niet-aaneengesloten entiteiten (bv. de 1e en de 3e van een rij).
2. Klik "Maak fiscale eenheid (2)" in de toolbar.
3. **Verwacht:** geen dialog. Direct: de twee blokken schuiven naar elkaar toe, en het gestippelde kader verschijnt netjes om alleen die twee. Het blok dat ertussen zat is naar buiten geschoven.
4. Klik op het label "Fiscale eenheid" → popover opent → wijzig naam → Enter → label update.
5. Klik label opnieuw → Verwijder → bevestig → kader verdwijnt, blokken blijven staan (positie kan behouden blijven of opnieuw uitgelijnd zijn — beide acceptabel).

---

## Self-Review

**1. Spec coverage:**

| Spec-onderdeel | Task |
|---|---|
| Dialog weg, direct opslaan met label "Fiscale eenheid" | Task 4 |
| `tierLayout` accepteert `groupings` parameter | Task 1 |
| Phase 5.5: unity-blok sortering tussen Phase 5 en Phase 6 | Task 2 step 3 |
| Tokens sorteren op anchor X | Task 2 step 3 (`tokens.sort((p, q) => p.anchorX - q.anchorX)`) |
| Niet-leden uit unity-blok eruit halen | Task 2 step 3 (tokens worden gebouwd door entities in volgorde af te wandelen; niet-leden binnen een blok eindigen als eigen singleton-tokens en sorteren apart) |
| `groupings` propageren vanuit `StructureChartStep` | Task 3 |
| `AddFiscalUnityDialog` verwijderen | Task 4 step 3 |
| Tests blijven groen | Task 2 step 5, Task 3 step 3, Task 4 step 4 |
| Edge case: 1 lid in rij → geen sortering | Task 2 step 3 (`if (memberCount < 2) continue;`) |
| Edge case: entity in meerdere unities | Task 2 step 3 (`if (!primaryUnity.has(mid))` — pakt de eerste) |
| Edge case: twee unities in dezelfde rij | Task 2 step 3 (elk unity-id krijgt zijn eigen tokens) |

**2. Placeholder scan:** Geen TBD/TODO. Alle code-blokken compleet. Geen "similar to..." verwijzingen.

**3. Type consistency:**
- `groupings: StructureGroup[]` (optioneel in functie-signature, altijd doorgegeven vanuit caller). Consistent in Task 1 en Task 3.
- `tierLayout` call-site in Task 3 gebruikt `groupings` als shorthand voor `groupings: groupings` — geldige TypeScript object property shorthand.
- `primaryUnity` Map<string, string> consistent gebruikt binnen Task 2.
- `Token`-type lokaal in de loop, geen external usage.

Geen issues. Klaar.
