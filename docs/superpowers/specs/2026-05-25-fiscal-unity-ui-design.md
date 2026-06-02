# Fiscale eenheid handmatig kunnen aanmaken in de structure chart

**Datum:** 2026-05-25
**Probleem:** De structure-chart editor kan visueel al een fiscale eenheid renderen (gestippelde rechthoek om een groep entiteiten heen, via `FiscalUnityOverlay`), maar er is geen UI om er een aan te maken, te hernoemen of te verwijderen. Het wordt alleen gerenderd als de DB-rij toevallig al bestaat.

## Wat er nu is

- Tabel `atad2_structure_groupings` met `kind`, `label`, `member_ids`. Geen migratie nodig.
- `listGroupings` in `src/lib/structure/client.ts` haalt ze op.
- `FiscalUnityOverlay` in `src/components/structure/overlays/` rendert per groupering een gestippelde rechthoek (`stroke-dasharray: 4 4` voor `kind = 'fiscal_unity'`) met label.
- Selectie in de chart is single-select (`{ kind: 'node' | 'edge', id: string } | null`).
- Geen `createGrouping` / `updateGrouping` / `deleteGrouping` client-functies.

## Wat we toevoegen

### Multi-select
- Shift-klik op een blok voegt toe aan selectie (React Flow ingebouwd).
- Box-select door op leeg canvas te slepen (React Flow ingebouwd, mits `panOnDrag` op de juiste manier).
- Selectiestatus in `StructureChartStep` wordt uitgebreid van één item naar een **lijst van entity-IDs**. Edge-selectie blijft single (nu niet nodig in multi).
- `FloatingInspector` blijft alleen werken bij single-select; multi-select toont geen inspector.

### "Maak fiscale eenheid"-knop in `FloatingToolbar`
- Verschijnt alleen als `selectedEntityIds.length >= 2`.
- Klik → opent `AddFiscalUnityDialog`.
- Dialog: tekstveld "Naam" (default leeg, placeholder "Fiscale eenheid"), Opslaan en Annuleren.
- Opslaan roept `createGrouping({ chart_id, kind: 'fiscal_unity', label, member_ids })` aan, voegt resultaat toe aan groupings-state, sluit dialog en wist selectie.

### Edit/verwijder via klik op label
- `FiscalUnityOverlay` krijgt een klik-handler op de label-rect (huidige `<rect>` + `<text>`). De buiten-rechthoek (stippellijn) blijft `pointerEvents: none` om hover op entiteiten niet te blokkeren.
- Klik op label → opent `FiscalUnityEditPopover` (kleine zwevende popover die naast het label verschijnt).
- Popover heeft:
  - Inline-editable label (klikbaar tekstveld; Enter bewaart, Escape annuleert).
  - "Verwijder"-knop met bevestiging.
- Bewerk roept `updateGrouping(id, { label })`. Verwijder roept `deleteGrouping(id)` en haalt het uit de state.

## Bestanden die veranderen

| Bestand | Nieuw / aanpassen | Wat |
|---|---|---|
| `src/lib/structure/client.ts` | aanpassen | 3 nieuwe functies: `createGrouping`, `updateGrouping`, `deleteGrouping`. |
| `src/components/structure/StructureChart.tsx` | aanpassen | `onSelectionChange` accepteert nu een uitgebreidere selectie-shape met meerdere entity-IDs. React Flow's `onSelectionChange` callback gebruiken voor multi-node detectie. |
| `src/components/structure/StructureChartStep.tsx` | aanpassen | Selectie-state-shape uitbreiden. Groupings-CRUD wire-up. Multi-select doorgeven aan toolbar. |
| `src/components/structure/FloatingToolbar.tsx` | aanpassen | Nieuwe `selectedEntityIds` prop + conditionele "Maak fiscale eenheid"-knop. |
| `src/components/structure/AddFiscalUnityDialog.tsx` | nieuw | Modal-dialog met label-veld, Opslaan/Annuleren. |
| `src/components/structure/overlays/FiscalUnityOverlay.tsx` | aanpassen | Label-rect krijgt `pointerEvents: 'auto'` + onClick → opent popover voor die groep. Coördinaten van het label doorgeven aan de parent zodat de popover op de juiste plek opent. |
| `src/components/structure/overlays/FiscalUnityEditPopover.tsx` | nieuw | Klein popover-component (positioned absolute) met inline-edit label en verwijder-knop. |

## Datamodel
Geen schemawijzigingen. `atad2_structure_groupings` is al goed: `chart_id`, `kind`, `label`, `member_ids`.

## Selectie-shape

Huidig:
```typescript
type Selection = { kind: 'node' | 'edge'; id: string } | null;
```

Nieuw:
```typescript
type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'nodes'; ids: string[] }  // multi-select, alleen entities
  | null;
```

`FloatingInspector` werkt alleen bij `kind: 'node'` of `kind: 'edge'` (single). Bij `kind: 'nodes'` blijft hij dicht.

## Edge cases

| Geval | Wat er gebeurt |
|---|---|
| User maakt fiscale eenheid met 1 entity | Knop is uitgegrijst — minimum 2 vereist. |
| User selecteert 2 entiteiten die al in een bestaande fiscale eenheid zitten | Tweede groupering wordt aangemaakt; ze kunnen overlappen visueel. Geen blokkering. |
| User verwijdert een entity die in een fiscale eenheid zit | `member_ids` wordt gefilterd in de overlay (lookup faalt → entity wordt overgeslagen). Als alle members weg zijn → groep blijft als lege rij; visueel niets te zien. Kleine zorg, opruimen kan later via een onderhoudsstap. |
| User probeert dezelfde naam in te voeren als bestaande groep | Geen uniqueness-check; meerdere groepen mogen dezelfde naam hebben. |
| User klikt op de gestippelde lijn zelf (niet op het label) | Geen actie. Alleen de label-rect is klikbaar. |

## Wat we expliciet NIET doen
- **Andere `kind`-waardes** (consolidation, joint venture, etc.). Alleen `fiscal_unity` in deze iteratie. De overlay ondersteunt al een fallback voor andere kinds, dus uitbreiden kan later zonder migratie.
- **Drag-resize van de rechthoek**: padding rond members is vast (16px, al gedefinieerd).
- **Nesting** (groep binnen een groep): één-laag-diep, geen recursieve relaties.
- **Auto-uitbreiden** wanneer nieuwe entiteiten worden toegevoegd: `member_ids` blijft expliciet.
- **PPTX-export van de overlay**: out of scope voor deze iteratie. Komt later als de gebruiker erom vraagt.

## Testen

### Unit (vitest)
1. `createGrouping` plaatst de juiste rij in Supabase (gemockt) en geeft de nieuwe rij terug.
2. `deleteGrouping` verwijdert de juiste rij op `id`.
3. `updateGrouping` patcht `label` zonder `kind` of `member_ids` aan te raken.

### Component / integratie
- Geen — handmatige test in de browser is genoeg voor deze UI-iteratie. Selectie + dialog + overlay zijn visueel gedreven.

### Handmatig
1. Open een chart met meerdere entiteiten.
2. Shift-klik 3 entiteiten → "Maak fiscale eenheid"-knop verschijnt in toolbar.
3. Klik knop → dialog opent → typ "MyCo F.E." → Opslaan.
4. Gestippelde rechthoek verschijnt om de 3 entiteiten heen met label "MyCo F.E.".
5. Klik op het label → popover opent → hernoem naar "Holding F.E." → Enter → label update.
6. Klik op label → popover → Verwijder → bevestig → rechthoek verdwijnt.

## Doel
Na deze iteratie kan een gebruiker een fiscale eenheid handmatig aanmaken, hernoemen en verwijderen — visueel direct zichtbaar als een gestippelde rechthoek om de gekozen entiteiten. Geen losse beheerpagina nodig; alles in de chart-editor.
