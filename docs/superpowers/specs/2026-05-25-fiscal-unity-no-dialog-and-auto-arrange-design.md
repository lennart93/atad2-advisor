# Fiscale eenheid: dialog weghalen + auto-arrange leden naar elkaar toe

**Datum:** 2026-05-25
**Probleem:** Twee resterende ruwe randjes na de eerste iteratie van de fiscale-eenheid UI:
1. De naam-dialog vertraagt de actie. Gebruiker wil één klik → klaar.
2. Als geselecteerde entiteiten niet naast elkaar staan, omsluit het gestippelde kader ook entiteiten die er niet bij horen.

## Wat we wijzigen

### 1. Geen dialog meer

De `AddFiscalUnityDialog` wordt verwijderd uit de flow. De toolbar-knop "Maak fiscale eenheid" roept direct `createGrouping` aan met:
- `kind: 'fiscal_unity'`
- `label: 'Fiscale eenheid'` (default)
- `member_ids: <selectie>`

De gebruiker kan de naam achteraf wijzigen door op het label van het kader te klikken (`FiscalUnityEditPopover` blijft bestaan).

### 2. Layout-algoritme respecteert unity-grouping

`src/lib/structure/tierLayout.ts` krijgt een extra parameter `groupings: StructureGroup[]` en een nieuwe stap die binnen elke rij ervoor zorgt dat leden van dezelfde unity een aaneengesloten blok vormen.

#### Algoritme

Tussen de bestaande Phase 5 (barycenter sweep) en Phase 6 (row-wrap):

**Phase 5.5 — Unity grouping:**
Voor elke rij die meer dan één unity-lid bevat:
1. Verzamel per entity de "primary unity id" (de eerste `grouping.id` waar deze entity lid van is, of `null`).
2. Bouw een lijst van "tokens" door de huidige rij-volgorde af te wandelen:
   - Een unity-blok = aaneengesloten reeks entities met dezelfde primary unity id.
   - Een niet-lid = singleton token.
3. Per token houden we de huidige X-positie van zijn eerste entity bij als "anchor X" (= waar deze groep van nature thuishoort).
4. Sorteer tokens op anchor X.
5. Flatten de tokens terug in een rij-array.
6. Herpak posities (`repackTier`) zoals de bestaande sort doet.

Het effect: niet-leden binnen een unity-blok worden eruit gehaald en aan een kant geplaatst. De unity blijft contiguous.

#### Trade-off met parent-child uitlijning

De bottom-up centroid alignment (Phase 6.5 die we eerder toevoegden) blijft staan en draait NA Phase 5.5. Dat betekent: parent-positionering past zich aan op de nieuwe rij-volgorde. Soms zal een kind dat in een unity zit niet meer pal onder zijn ouder staan, omdat het tussen unity-leden is geschoven. **Unity-clarity weegt zwaarder dan strikte parent-child uitlijning** — bewuste keuze van de gebruiker.

#### `groupings` propageren

`tierLayout` wordt aangeroepen vanuit `StructureChartStep.runLayout`. We voegen `groupings` toe aan de input. Komt al uit `loadChart` en zit al in state.

## Bestanden die veranderen

| Bestand | Wat |
|---|---|
| `src/lib/structure/tierLayout.ts` | Nieuwe parameter `groupings`. Nieuwe Phase 5.5 met unity-blok sortering. |
| `src/lib/structure/__tests__/tierLayout.test.ts` | Test: unity-leden eindigen contiguous na layout. |
| `src/components/structure/StructureChartStep.tsx` | Dialog-mount weg. Knop-callback direct opslaan met default label. `groupings` doorgeven aan `runLayout`. |
| `src/components/structure/AddFiscalUnityDialog.tsx` | Verwijderen. |
| `src/components/structure/FloatingToolbar.tsx` | Geen change in code; alleen de semantiek van `onCreateFiscalUnity` verandert (geen dialog meer). |

## Edge cases

| Geval | Wat er gebeurt |
|---|---|
| Eén lid in een rij, andere leden in andere rijen | Geen sortering nodig in die rij; rendering geeft kruis-rij bounding box (bestaand gedrag). |
| Entity in meerdere unities tegelijk | We pakken de eerste `grouping.id` waar de entity lid van is. Acceptabel: zeldzaam, gebruiker kan herordering accepteren of leden bewerken. |
| Gebruiker drag-resizet een entity nadat de unity bestaat | Volgende layout-pass groepeert ze opnieuw automatisch. Gewone drag behoudt user-positie tot de volgende auto-arrange. |
| Twee unities in dezelfde rij | Elke unity vormt zijn eigen contiguous blok. Tokens sorteren op anchor X, dus de blokken landen op natuurlijke plek. |
| Multi-row rij (de bestaande row-wrap) | Phase 5.5 draait per rij; row-wrap volgt erna en herverdeelt zoals nu. |

## Wat we NIET aanraken

- De rendering (`FiscalUnityOverlay`): gestippelde rechthoek + label, klik-op-label voor popover. Geen wijzigingen.
- `FiscalUnityEditPopover`: blijft het rename + delete mechanisme.
- DB-schema: geen migratie.
- Cross-row uitlijning (als unity-leden over meerdere rijen verspreid zijn): we doen alleen per-rij compactie. Het kader zal in dat geval een groter X-bereik beslaan; acceptabel voor nu.
- De default label "Fiscale eenheid": geen `id`-suffix voor uniqueness. Twee groepen mogen dezelfde naam hebben.

## Testen

### Unit (vitest)
1. Bestaande `tierLayout`-tests blijven groen.
2. Nieuwe test: bouw een rij `[A, B, C, D, E]`. Unity = `{A, C}`. Verwacht: na `tierLayout` zijn A en C aaneengesloten (X-positie verschil = NODE_WIDTH + MIN_GAP).

### Handmatig in de browser
1. Open een chart met ≥3 entiteiten in één rij.
2. Shift-klik de eerste en derde entity in de rij (niet de tweede).
3. Klik "Maak fiscale eenheid (2)" → er verschijnt direct een gestippeld kader om alleen die twee. De tweede entity is naar buiten geschoven.
4. Klik op het label → hernoem werkt nog → verwijder werkt nog.

## Doel
Eén-klik fiscale eenheid die altijd visueel klopt, ook wanneer leden niet van nature naast elkaar staan.
