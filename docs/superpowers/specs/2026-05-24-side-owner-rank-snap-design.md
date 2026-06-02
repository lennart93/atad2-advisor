# Zij-eigenaren omlaag schuiven naar hun dochter

**Datum:** 2026-05-24
**Probleem:** In de structure chart staan eigenaren die maar één dochter diep in de structuur bezitten (zoals Energiefonds Overijssel → S4 Ancillary Services) in de bovenste rij tussen de "echte" topbazen. Hun lijn loopt vervolgens dwars over een middelblok heen (zoals S4 Energy B.V.), wat suggereert dat dat middelblok de tussenpersoon is — terwijl die er niets mee te maken heeft.

## Wat er nu gebeurt

`src/lib/structure/tierLayout.ts` → functie `longestPathRanks`:
- Een entiteit zonder eigen baas (UPE) krijgt rang 0.
- Andere entiteiten krijgen rang = (hoogste rang van hun ouders) + 1.

Gevolg: ALLE UPEs zitten in dezelfde bovenste rij, ongeacht hoe diep hun echte dochter ligt. Een UPE die alleen een dochter op rang 2 heeft, zit toch op rang 0 — twee rijen boven die dochter. De lijn ertussen springt over rang 1 heen.

## De fix

Eén extra stap na het bestaande rang-algoritme. Voor elke UPE:
- Pak zijn directe dochters.
- Vind de dochter met de **laagste** rang (= dichtstbij).
- Zet UPE op die rang − 1.

### Voorbeeld

Met de chart uit de bug-report:
- Castleton: dochter S4 Energy zit op rang 1. Nieuwe rang Castleton = 0.
- Energiefonds Overijssel: dochter S4 Ancillary Services zit op rang 2. Nieuwe rang Energiefonds = 1.
- Participatie Fonds: dochter op rang 2 → rang 1.
- The Cradle: dochter op rang 2 → rang 1.
- Osse Holding: dochter op rang 2 → rang 1.

Resultaat:
- Rij 0: Castleton
- Rij 1: S4 Energy + Energiefonds + Participatie Fonds + The Cradle + Osse Holding
- Rij 2: alle 6 dochters

Het bestaande sorteer-algoritme (barycenter sweep, regel 148–163 in `tierLayout.ts`) plaatst elke zij-eigenaar automatisch naast S4 Energy, recht boven zijn eigen dochter.

## Edge cases

| Geval | Resultaat |
|---|---|
| UPE heeft geen dochters | Rang blijft 0 — krijgt geen dochter om naartoe te schuiven. Geen effect. |
| UPE heeft één dochter op rang 1 | Rang blijft 0. Geen schuif nodig. |
| UPE heeft meerdere dochters op verschillende dieptes | UPE komt naar de **dichtstbij** liggende dochter (laagste rang). Zijn dieper liggende dochter krijgt dan een lijn die meerdere rijen overslaat — acceptabel: dat zijn er weinig in de praktijk. |
| Verwerkings-volgorde | We doen één pass over alle UPEs en lezen alleen de rangen uit de **eerste pass**. Volgorde maakt niet uit — UPEs zijn per definitie zonder ouder, dus een UPE kan nooit de dochter van een andere UPE zijn. Geen ketting-effect. |
| Cyclische eigendomsstructuur | Bestaande validator blokkeert dit al — niet onze zorg. |

## Wat we NIET aanraken

- De positie binnen een rij. Het bestaande barycenter-algoritme doet z'n werk al.
- Lijnen, percentage-labels, kleuren.
- Multi-parent entiteiten. Die krijgen sowieso al de juiste rang door de bestaande "max parent rang + 1" regel.
- De `selectAnchor` functie.

## Bestanden die veranderen

| Bestand | Wat |
|---|---|
| `src/lib/structure/tierLayout.ts` | Eén extra blok aan het einde van `longestPathRanks`: snap UPE-rang naar (min dochter-rang) − 1. |
| `src/lib/structure/__tests__/tierLayout.test.ts` | Nieuwe tests voor het schuif-gedrag (zie hieronder). |

## Tests

Toevoegen aan de bestaande `tierLayout.test.ts`:

1. **Zij-eigenaar met diepe dochter schuift omlaag.**
   Setup: Castleton → S4 Energy → S4 Sub; Energiefonds → S4 Sub.
   Verwacht: Castleton op rang 0, S4 Energy en Energiefonds beide op rang 1, S4 Sub op rang 2.

2. **UPE met dochter op rang 1 blijft op rang 0.**
   Setup: Castleton → S4 Energy.
   Verwacht: Castleton op rang 0 (1 − 1 = 0, geen verschuiving).

3. **UPE zonder dochter blijft op rang 0.**
   Setup: alleen Castleton, geen edges.
   Verwacht: rang 0 (gedegradeerd tot orphan na de filter, maar de rang is 0).

4. **Bestaande tests blijven groen.**
   Geen wijziging in gedrag voor charts die alleen één-keten UPEs hebben.

## Doel

Na deze fix lijkt de chart visueel op de tweede screenshot (de hand-getekende versie van Lennart): elke zij-eigenaar zweeft pal boven zijn echte dochter. Lijnen lopen niet meer over onverwante blokken heen.
