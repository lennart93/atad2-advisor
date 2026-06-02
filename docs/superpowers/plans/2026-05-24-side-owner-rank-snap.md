# Zij-eigenaren omlaag schuiven — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UPEs (eigenaren zonder eigen baas) die alleen een diepe dochter hebben, schuiven omlaag naar rang (min dochter-rang) − 1. Zo komen ze pal boven hun echte dochter te zweven in plaats van bovenaan tussen onverwante topbazen.

**Architecture:** Eén extra stap aan het einde van `longestPathRanks` in `src/lib/structure/tierLayout.ts`. Bouwt een omgekeerd ouder→dochter mapping op, en zet voor elke UPE de rang op (min dochter-rang) − 1. UPEs zijn per definitie zonder ouder, dus ze beïnvloeden elkaar niet — volgorde maakt niet uit.

**Tech Stack:** TypeScript, Vitest.

**Spec:** [docs/superpowers/specs/2026-05-24-side-owner-rank-snap-design.md](../specs/2026-05-24-side-owner-rank-snap-design.md)

---

## File overview

| Bestand | Wat |
|---|---|
| `src/lib/structure/tierLayout.ts` | Aanpassen — extra blok aan het einde van `longestPathRanks` (rond regel 322) |
| `src/lib/structure/__tests__/tierLayout.test.ts` | Tests toevoegen voor het snap-gedrag |

---

## Task 1: Tests eerst (TDD) — verwacht falen

We schrijven drie tests die het nieuwe gedrag vastpinnen. Daarna draaien we ze om te zien dat ze falen.

**Files:**
- Modify: `src/lib/structure/__tests__/tierLayout.test.ts`

- [ ] **Step 1: Drie nieuwe tests toevoegen**

Voeg deze tests toe binnen de `describe('tierLayout', ...)` blok, vlak vóór de afsluitende `});` op regel 154:

```typescript
  it('zij-eigenaar met alleen een diepe dochter schuift omlaag', () => {
    // castleton → s4energy → s4sub  (castleton: rang 0, s4energy: 1, s4sub: 2)
    // energiefonds → s4sub          (energiefonds is een UPE die alleen een dochter op rang 2 heeft)
    // Verwacht: energiefonds schuift naar rang 1 (= 2 − 1), dus zelfde Y als s4energy.
    const castleton = ent('castleton');
    const s4energy = ent('s4energy');
    const s4sub = ent('s4sub', { is_taxpayer: true });
    const energiefonds = ent('energiefonds');
    const result = tierLayout({
      entities: [castleton, s4energy, s4sub, energiefonds],
      ownershipEdges: [
        ownEdge('castleton', 's4energy'),
        ownEdge('s4energy', 's4sub'),
        ownEdge('energiefonds', 's4sub'),
      ],
      clusters: [],
    });
    expect(result.positions.get('castleton')!.y).toBe(0);
    expect(result.positions.get('s4energy')!.y).toBe(TIER_Y_STEP);
    expect(result.positions.get('energiefonds')!.y).toBe(TIER_Y_STEP);
    expect(result.positions.get('s4sub')!.y).toBe(TIER_Y_STEP * 2);
  });

  it('UPE met directe dochter op rang 1 blijft op rang 0', () => {
    // castleton → s4energy. Dochter zit op rang 1, dus snap = 1 − 1 = 0 → geen verschuiving.
    const castleton = ent('castleton');
    const s4energy = ent('s4energy', { is_taxpayer: true });
    const result = tierLayout({
      entities: [castleton, s4energy],
      ownershipEdges: [ownEdge('castleton', 's4energy')],
      clusters: [],
    });
    expect(result.positions.get('castleton')!.y).toBe(0);
    expect(result.positions.get('s4energy')!.y).toBe(TIER_Y_STEP);
  });

  it('UPE met meerdere dochters op verschillende dieptes pakt de dichtstbij', () => {
    // upe → shallow (direct, rang 1) en upe → deep (via mid op rang 2)
    // Snap = min(1, 2) − 1 = 0. UPE blijft op rang 0.
    const upe = ent('upe');
    const shallow = ent('shallow', { is_taxpayer: true });
    const mid = ent('mid');
    const deep = ent('deep');
    const result = tierLayout({
      entities: [upe, shallow, mid, deep],
      ownershipEdges: [
        ownEdge('upe', 'shallow'),
        ownEdge('shallow', 'mid'),
        ownEdge('mid', 'deep'),
        ownEdge('upe', 'deep'),
      ],
      clusters: [],
    });
    // upe heeft een dichtstbij dochter op rang 1 → blijft op rang 0
    expect(result.positions.get('upe')!.y).toBe(0);
    expect(result.positions.get('shallow')!.y).toBe(TIER_Y_STEP);
  });
```

- [ ] **Step 2: Tests draaien om te zien dat de eerste faalt**

```bash
npx vitest run src/lib/structure/__tests__/tierLayout.test.ts
```

Verwacht: de eerste van de drie nieuwe tests (`zij-eigenaar met alleen een diepe dochter schuift omlaag`) **faalt**. Specifiek: `energiefonds.y` is `0` (rang 0 = bovenaan) terwijl de test `TIER_Y_STEP` (= 180) verwacht.

De andere twee tests slagen al toevallig — `UPE met directe dochter op rang 1` en `meerdere dochters` zijn gevallen waarin niets verschuift. Die fungeren als regressie-checks.

---

## Task 2: De snap-stap toevoegen aan `longestPathRanks`

We voegen één blok toe aan het einde van `longestPathRanks` (vlak voor `return ranks;`).

**Files:**
- Modify: `src/lib/structure/tierLayout.ts`

- [ ] **Step 1: De snap-logica toevoegen**

Vervang de slotregel van `longestPathRanks` (rond regel 322–323):

```typescript
  }
  return ranks;
}
```

Door:

```typescript
  }

  // Snap-stap: een UPE die alleen diepe dochters heeft, schuift omlaag naar
  // rang (min dochter-rang) − 1. Reden: een eigenaar die geen eigen baas heeft
  // maar alleen iets onderaan bezit, hoort visueel pal boven die dochter te
  // zweven, niet bovenaan tussen de "echte" topbazen.
  //
  // We lezen de rangen die we hierboven hebben gezet (firstPassRanks), zodat
  // UPEs die ZELF schuiven elkaar niet beïnvloeden. UPEs zijn per definitie
  // zonder ouder, dus een UPE kan nooit de dochter van een andere UPE zijn —
  // volgorde maakt niet uit.
  const firstPassRanks = new Map(ranks);
  const childrenOf = new Map<string, string[]>();
  for (const e of ownershipEdges) {
    if (!reachable.has(e.from_entity_id) || !reachable.has(e.to_entity_id)) continue;
    const list = childrenOf.get(e.from_entity_id) ?? [];
    list.push(e.to_entity_id);
    childrenOf.set(e.from_entity_id, list);
  }
  for (const id of allReachableIds) {
    const ps = parents.get(id) ?? [];
    if (ps.length > 0) continue; // geen UPE — overslaan
    const cs = childrenOf.get(id) ?? [];
    if (cs.length === 0) continue; // geen dochters om naartoe te schuiven
    let minChildRank = Number.POSITIVE_INFINITY;
    for (const c of cs) {
      const cr = firstPassRanks.get(c);
      if (cr === undefined) continue;
      if (cr < minChildRank) minChildRank = cr;
    }
    if (minChildRank === Number.POSITIVE_INFINITY) continue;
    const snapped = Math.max(0, minChildRank - 1);
    ranks.set(id, snapped);
  }

  return ranks;
}
```

- [ ] **Step 2: Tests draaien om te zien dat ze nu slagen**

```bash
npx vitest run src/lib/structure/__tests__/tierLayout.test.ts
```

Verwacht: **alle** tests in `tierLayout.test.ts` slagen — de drie nieuwe én de bestaande (geen regressie).

- [ ] **Step 3: Volledige test-suite draaien om regressies elders te checken**

```bash
npx vitest run
```

Verwacht: geen nieuwe falende tests. Eventuele al-bestaande failures negeren (los van deze wijziging).

- [ ] **Step 4: Commit**

```bash
git add src/lib/structure/tierLayout.ts src/lib/structure/__tests__/tierLayout.test.ts
git commit -m "feat(structure): snap side-owner UPEs down to (min child rank) − 1"
```

---

## Task 3: Visueel verifiëren in de browser

De unit tests bevestigen de rangen, maar de uiteindelijke layout (volgorde links-rechts, lijnen) is een gecombineerd effect. Even handmatig kijken.

**Files:**
- (geen)

- [ ] **Step 1: Dev server draaien**

```bash
npm run dev
```

- [ ] **Step 2: Open een sessie met een chart die voorheen het probleem had**

Open de structure-chart pagina op de sessie waarin de drie screenshots gemaakt zijn (de S4 Energy structuur). Of een willekeurige andere sessie met een UPE die alleen een diepe dochter heeft.

- [ ] **Step 3: Verifiëren dat zij-eigenaren naast S4 Energy staan, niet erboven**

Verwacht: blokken zoals Energiefonds Overijssel, Participatie Fonds, The Cradle en Osse Holding staan nu **in dezelfde rij** als S4 Energy, niet erboven. Hun lijn naar hun dochter is kort en duidelijk.

Als er nog steeds rare positionering is: open de inspector (selecteer een zij-eigenaar) en check of zijn Y-coördinaat overeenkomt met die van S4 Energy. Niet? Open een DM, niet committen.

---

## Self-Review

**1. Spec coverage:**

| Spec-onderdeel | Task |
|---|---|
| Snap-regel: UPE → (min directe dochter-rang) − 1 | Task 2 step 1 |
| Edge case: UPE met dochter op rang 1 blijft op rang 0 | Task 1 step 1 (tweede test) |
| Edge case: UPE met meerdere dochters op verschillende dieptes pakt dichtstbij | Task 1 step 1 (derde test) |
| Edge case: UPE zonder dochters → rang blijft | Code (regel `if (cs.length === 0) continue`); niet expliciet getest omdat zo'n UPE een orphan wordt en niet in `positions` zit (al gedekt door bestaande `orphans land in the orphans array` test). |
| Volgorde van UPE-verwerking maakt niet uit | Code (we lezen `firstPassRanks`, niet de live `ranks`); commentaar legt het uit |
| Nieuwe tests in `tierLayout.test.ts` | Task 1 |
| Bestaande tests blijven groen | Task 2 step 2-3 |

**2. Placeholder scan:** Geen TBD/TODO. Alle code-blokken compleet.

**3. Type consistency:**
- `childrenOf: Map<string, string[]>` — alleen lokaal gebruikt, naam consistent in de code-block.
- `firstPassRanks: Map<string, number>` — alleen lokaal.
- Geen nieuwe geëxporteerde types.

Geen issues. Klaar.
