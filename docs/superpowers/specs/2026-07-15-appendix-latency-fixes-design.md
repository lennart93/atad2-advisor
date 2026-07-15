# Bijlage-latency fixes — geen dubbele runs + asynchrone eindredactie

Datum: 2026-07-15 · Status: goedgekeurd door Lennart (chat), direct geïmplementeerd

## Probleem (gemeten, sessie 7eb4e24a, 15 jul)

De wachttijd op de Facts-pagina was 5+ minuten. Tijdlijn: de speculatieve keten
vuurde om 10:53:42 op een half-gevulde suggestie-set (prefill-swarm nog bezig),
bouwde om 10:54:13 een bijlage-run die om 10:56:21 klaar én waardeloos was
(input inmiddels veranderd), waarna de echte run pas om 10:56:25 kon starten
(verse-run-guard) en om 10:59:56 landde. Slechtste-geval-doel: de wachttijd van
een snelle doorklikker terugbrengen naar ± 1 minuut; normale gebruikers 0.

## Besluiten (Lennart)

1. Orkestratie-fix: nooit meer een run op een instabiele suggestie-set en nooit
   een bijlage-run op een chart die al niet meer bij de actuele antwoorden hoort.
2. De Fable-eindredactie (taalpolijst, 30-60 s) blokkeert de bijlage niet meer:
   bijlage komt vrij na de swarm, de eindredactie werkt daarna stil bij, en
   alleen zolang er niets bevestigd of bewerkt is.
3. Sneller model voor Part B: UITGESTELD tot een inhoudelijke vergelijking.

## Ontwerp

### 1a. Stabiliteits-debounce in useSpeculativeRefine

De hook wordt pollend (elke 10 s) in plaats van eenmalig per mount, en vuurt
pas wanneer twee opeenvolgende metingen dezelfde effectieve vingerafdruk
opleveren (= de suggestie-set is 20 s onveranderd). Nieuwe parameter
`debounce`: de Confirmation-pagina zet die uit (antwoorden zijn daar per
definitie definitief, geen 10 s verliezen); upload- en vragenpagina aan.
Dedup per sessie+vingerafdruk blijft. Bijeffect: een gebruiker die tijdens de
vragenlijst van een suggestie afwijkt, krijgt de her-verrijking al tijdens de
vragenlijst (vingerafdruk wijzigt alleen bij afwijken, accepteren houdt hem
gelijk), dus ook die wacht daarna korter.

### 1b. Vingerafdruk-poort op useAppendixPrewarm

De prewarm start een bijlage-run alleen nog als de chart-vingerafdruk gelijk is
aan de ACTUELE effectieve vingerafdruk (pure helper `shouldStartAppendix`):
- chart fp == huidige fp → vuren (dedup-key zoals nu);
- chart fp != huidige fp → overslaan: er komt een nieuwe verrijking aan, een
  run nu zou weggegooid werk zijn (dit was run #1 in de meting);
- chart fp == null (legacy) → eenmalig vuren zoals voorheen (grandfather).

### 2. Fable-eindredactie asynchroon en veilig

`generate-appendix` schrijft de rijen + `generation_status='ready'` +
vingerafdruk DIRECT na de merge (gebruiker vrij). Daarna draait de bestaande
`reviewAppendix` in dezelfde achtergrondtaak; bij resultaat:
- herlees de bijlage-rij;
- sla de HELE pass over als `review_status='confirmed'` (na bevestiging wordt
  nooit meer geschreven, besluit 14 jul);
- pas per rij alleen toe via pure helper `applyReviewSafely`: alleen rijen die
  nog `source='ai'` zijn én waarvan de reasoning nog exact gelijk is aan wat
  deze run schreef (advisor-bewerkingen in het venster winnen dus altijd);
- review-warnings worden aan de HERLEZEN facts.warnings toegevoegd (nooit het
  hele facts-object van de eerste write terugschrijven);
- statussen wijzigt de eindredactie nooit (bestond al).
Failure blijft best-effort: geen review = de al geschreven rijen blijven staan.

## Wat bewust niet verandert

- De Facts-poortwachter, vingerafdruk-logica en memo-guard: ongewijzigd.
- Part B-model en prompts: ongewijzigd (optie uitgesteld).
- Geen datamodel-wijzigingen, geen migratie.

## Verwachte uitkomst (op de meting van 15 jul)

Run #1 (2m08 verspild) vervalt; de echte run start ~50 s eerder én is ~45-60 s
korter (eindredactie async): bijlage klaar ± 10:57:30 i.p.v. 10:59:56. Een
gebruiker in testtempo wacht dan nog ± 1 min; wie normaal door de vragenlijst
gaat, wacht niets.

## Tests

- `applyReviewSafely`: pure, cross-import test (edited row blijft, ai-rij met
  ongewijzigde reasoning krijgt de nieuwe tekst, onbekende rowId genegeerd).
- `shouldStartAppendix`: drie takken (match / mismatch / legacy).
- Debounce-beslissing useSpeculativeRefine als pure functie.

## Deploy

Edge `generate-appendix` + frontend (hooks). Geen migratie. Zelfde route als
15 jul: commit → push (frontend via Actions) → VM rsync + verificatie.
