# Speculatieve bijlage-generatie — fix voor de ronde-2 race

Datum: 2026-07-14 · Status: ontwerp goedgekeurd door Lennart (chat), implementatieplan volgt

## 1. Probleem

De technische bijlage wordt twee keer gegenereerd: één keer direct na de upload
(docs-only chart, zonder antwoorden) en één keer na de vragenlijst (verrijkte
chart + antwoorden). Die tweede run start pas minuten na de Q&A-afronding (een
bewuste wachtketen van tot ~4 minuten in `Assessment.tsx` + wachten op een nog
lopende ronde-1-run) en duurt zelf ook minuten. De gebruiker is dan al voorbij
de Facts-pagina: die toont de ronde-1-momentopname als "ready" en ververst
daarna nooit meer. De tweede run schrijft vervolgens stilletjes over de al
bevestigde bijlage heen (de edge function kijkt niet naar `review_status`), en
de memo-guard laat dat bewust door. Gevolg: transacties die niemand heeft
beoordeeld duiken voor het eerst op in het Word-memo. Een derde stille
schrijver (`maybeResyncAppendix` in de Structure-stap) kan hetzelfde doen, nog
later in de flow.

## 2. Besluiten (Lennart, 14 jul 2026)

1. **De Facts-pagina toont nooit een niet-definitieve set.** Zolang de
   definitieve run niet is geland toont de pagina een wachtstatus
   ("Processing your answers").
2. **Chart-wijzigingen in de Structure-stap raken de bijlage nooit meer**, ook
   het entiteitenregister van Appendix 1 niet. De richting bijlage → chart
   (verborgen entiteiten filteren de kaart) blijft bestaan.
3. **De keten werkt speculatief vooruit op de prefill-suggesties.** In de
   praktijk worden de suggesties vrijwel altijd de antwoorden; daarom draaien
   chart-verrijking én bijlage-generatie alvast op de suggesties terwijl de
   gebruiker de vragenlijst doorloopt. Wijkt de gebruiker af, dan draait de
   keten opnieuw op de echte antwoorden en wacht alleen díe gebruiker.

## 3. Ontwerp

### 3.1 Effectieve antwoorden (nieuwe gedeelde bron)

Een helper `effectiveAnswers(sessionId)` levert per vraag het beste antwoord
dat er op dat moment is:

- het **echte antwoord** uit `atad2_answers` als de vraag beantwoord is;
- anders de **prefill-suggestie** uit `atad2_question_prefills`:
  - `suggested_answer` (yes/no) + `suggested_toelichting` als explanation;
  - géén `suggested_answer` maar wél `contextual_hint` +
    `suggested_toelichting_unknown` (Route B): antwoord `unknown` met die
    toelichting (zo matcht ook een pure accept van een unknown-companion);
  - anders: vraag weggelaten.

Bij een pure accept kopieert de UI de suggestie-toelichting letterlijk naar de
explanation (Route A in `autoAdvanceGate.ts`), dus echte en speculatieve
waarden zijn dan identiek.

Gebruikers: `extract-structure` (het Q&A-blok van de refine-pass; de bestaande
`hasQaAnswers`-gate telt dan effectieve antwoorden i.p.v. alleen echte) en
`generate-appendix` (`ANSWERS_BLOCK`, evidence notes, de 1bis-renderregel).
De helper leeft in Deno `_shared/` met een frontend-mirror in
`src/lib/` (zelfde duale onderhoudsregel als `skeleton.ts`/`skeletonRows.ts`).

### 3.2 Antwoorden-vingerafdruk

Canonieke vorm: per vraag `"{question_id}={lowercase(answer)}|{trim(explanation ?? '')}"`,
regels gesorteerd op `question_id`, daarover sha256 (hex). De canonicalisatie
staat in dezelfde duale helper als 3.1.

- Elke afgeronde run van `extract-structure` (refine) en `generate-appendix`
  slaat de vingerafdruk van de gebruikte effectieve set op in een nieuwe
  kolom `answers_fingerprint` (TEXT, nullable) op respectievelijk
  `atad2_structure_charts` en `atad2_appendix`. De write is fout-tolerant
  (kolom-missing-safe, patroon van de prefill-followup), zodat een edge-deploy
  vóór de migratie niets breekt.
- De frontend berekent dezelfde vingerafdruk over de actuele `atad2_answers`
  en vergelijkt.

### 3.3 Triggers (wie start wat, wanneer)

1. **Speculatieve start.** Zodra de prefill-pipeline is uitgewerkt (alle
   prefills terminaal én de factsheet-herloop klaar — het "settled"-signaal
   dat `useFactsheetPrewarm` al kent) start de chart-verrijking
   (`startExtraction('refine')`) op de effectieve antwoorden. Vangnet-trigger:
   het openen van de vragenlijst. Dedup per sessie + suggestie-vingerafdruk.
   De speculatieve refine start nooit terwijl de prefill-swarm nog draait
   (zelfde pauze-regel als de factsheet-prewarm).
2. **Bijlage volgt de chart.** Het bestaande `useAppendixPrewarm`-mechanisme
   ('draft'-milestone: chart bereikt `draft_ready`) vuurt de bijlage-generatie
   af — ongewijzigd principe, alleen gebeurt `draft_ready` nu al tijdens de
   vragenlijst. De hook wordt ook op de Confirmation-pagina gemount, zodat het
   venster tussen Q&A en Facts-pagina benut wordt. De **'phaseA'-milestone
   vervalt**: de bijlage-run op de kale docs-chart wordt nooit meer getoond en
   kostte alleen dubbele model-calls (en blokkeerde de definitieve run via de
   verse-run-guard).
3. **Q&A-afronding: vergelijken in plaats van wachten.** Er komt géén losse
   vergelijk-code in `completeAssessment`: dezelfde twee hooks (speculatieve
   refine + bijlage-prewarm, beide gededuplicetteerd op de vingerafdruk) staan
   ook op de Confirmation-pagina gemount. Wijken de echte antwoorden af van
   wat de speculatieve runs gebruikten, dan ziet de refine-hook daar direct
   een vingerafdruk-mismatch en vuurt opnieuw; de bijlage volgt via trigger 2
   (nieuwe chart-vingerafdruk = nieuwe prewarm-sleutel). Matchen ze, dan
   vuurt er niets. De huidige wachtketen (~regels 1162–1204 in
   `Assessment.tsx`, incl. de 240s-loop) **vervalt volledig**.
4. **Facts-pagina als poortwachter.** De pagina toont de feiten alleen als:
   `generation_status = 'ready'` **én** `answers_fingerprint` gelijk is aan de
   vingerafdruk van de actuele echte antwoorden. Anders: wachtstatus
   "Processing your answers", pollen tot de goede run er is, en als er geen
   verse run loopt zelf de juiste stap starten (chart nog niet `draft_ready` →
   eerst refine; anders bijlage-generatie). De Confirm-knop bestaat dus alleen
   op een definitieve set.
   **Grandfathering:** een bijlage die al `review_status = 'confirmed'` heeft
   (bestaande dossiers, of fingerprint-kolom nog leeg) wordt gewoon getoond;
   de gate geldt alleen vóór bevestiging.

### 3.4 Verwijderingen

- `useAppendixPrewarm`: 'phaseA'-milestone (en bijbehorende test-takken).
- `Assessment.tsx`: de volledige post-Q&A wachtketen voor de bijlage.
- `StructureChartStep.tsx`: `maybeResyncAppendix` en de aanroepen ervan
  (besluit 2). `registerMatchesChart` vervalt als die daardoor ongebruikt is.

### 3.5 Wat bewust NIET verandert

- `mergeFacts` / de rijen-merge in `generate-appendix`: advisor-edits en
  -bevestigingen blijven beschermd zoals nu.
- `memoSyncGuard`: ongewijzigd. Na deze wijziging bestaat er geen schrijver
  meer die ná de bevestiging nog ongevraagd iets toevoegt; alleen
  advisor-geïnitieerde acties (zoals "Re-check relationships") regenereren nog.
- De factsheet-/docfacts-pipeline en n8n: onaangeroerd.
- Antwoord-edits ná afronding (rapportpagina): het bestaande
  stale-rij-mechanisme + memo-guard blijven dat afvangen.

## 4. Randgevallen

- **Vragen naar de cliënt / unknown-suggesties:** het echte antwoord komt
  later of wijkt af → vingerafdruk verschilt → herrun; de gate vangt het op.
- **Bewerkte toelichting bij accepteren:** vingerafdruk verschilt → herrun.
  Bewust: een gewijzigde toelichting is materieel nieuwe input (evidence
  notes). Pure accepts matchen.
- **Sessie zonder prefills/documenten:** effectieve set = alleen echte
  antwoorden; de keten start dan feitelijk pas bij Q&A-afronding en de gate
  werkt identiek.
- **Browser dicht/ververst midden in de keten:** elke terugkeer op een pagina
  met de prewarm-hook of de Facts-pagina herbeoordeelt vingerafdruk + status
  en herstart wat ontbreekt.
- **Gelijktijdige runs:** de bestaande verse-run-guard + heartbeat in
  `generate-appendix` blijven; een tweede start terwijl een run vers bezig is
  wordt genegeerd, en de afronding-vergelijking (trigger 3) vuurt daarna
  alsnog omdat de gate op de Facts-pagina blijft controleren.
- **Casing:** `atad2_answers.answer` kan met hoofdletter zijn opgeslagen;
  de canonicalisatie lowercased het antwoord.

## 5. Datamodel & deploy

- **Migratie** `20260714130000_answers_fingerprint_columns.sql`:
  `ALTER TABLE atad2_structure_charts ADD COLUMN
  answers_fingerprint text;` + idem voor `atad2_appendix` (idempotent,
  `IF NOT EXISTS`). Toepassen als `supabase_admin` (repo-regel).
- `src/integrations/supabase/types.ts` handmatig bijwerken (repo-regel).
- **Deploy-volgorde:** (1) migratie → (2) edge functions `extract-structure` +
  `generate-appendix` incl. `_shared` (volledige map, `ls | wc -l` +
  md5-verificatie, DASH-pad) → (3) frontend via Azure App Service. Elke
  tussenstand is veilig: de fingerprint-write is fout-tolerant en de
  oude frontend negeert de nieuwe kolom; de nieuwe frontend grandfathert
  bevestigde bijlagen zonder fingerprint.

## 6. Tests

- Vingerafdruk-canonicalisatie: frontend-unit tests + pariteit frontend/Deno
  (zelfde fixture, zelfde hash).
- `effectiveAnswers`-merge: echt wint van suggestie; Route B unknown-companion;
  weglaatregel.
- Gate-beslislogica Facts-pagina als pure functie (ready/fingerprint/
  grandfather-matrix).
- Afronding-vergelijking (trigger 3) als pure helper: welke run(s) vuren bij
  welke mismatch.
- `useAppendixPrewarm`: 'phaseA' weg, 'draft' blijft; bestaande tests
  aangepast.
- `StructureChartStep`: resync-gedrag verwijderd (test mee opruimen).

## 7. Buiten scope

- Wijzigingen aan de memo-guard, de factsheet-pipeline, n8n-workflows.
- Sneller maken van de chart-verrijking of de generatie zelf.
- Het herzien van de merge-semantiek van `mergeFacts`.
