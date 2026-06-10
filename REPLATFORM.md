# REPLATFORM.md — Van assessment-tool naar klantplatform

Status: voorstel ter goedkeuring. Geschreven 2026-06-05.
Dit document is de bron van waarheid voor de ombouw van de ATAD2 Advisor van een
eenmalige assessment-workflow naar een klantplatform. Het beschrijft het doel,
hoe het er nu uitziet, het nieuwe datamodel, en een gefaseerd plan waarbij elke
fase los te leveren is en productie nooit stilstaat.

---

## 1. Het doel (stip op de horizon)

Vandaag *is* de app één assessment. Straks is de app *een lijst klanten*.

Na inloggen ziet een adviseur zijn klantmappen. Hij opent er één en leeft in die
klantomgeving. Een ATAD2-assessment draaien wordt één knop die je per klant
indrukt, één keer per jaar, met vorig jaar ernaast. Elk jaar neemt de vorige
structuur, documenten en antwoorden mee, zodat je alleen de verschillen
bevestigt. Mist er informatie, dan vul je die later aan en herreken je alleen de
stukken die het raakt, in plaats van de hele memo opnieuw te schrijven.

De bestaande 6-stappen-flow blijft exact zoals hij is. We voegen een oudermap toe
en richten de bestaande onderdelen daarop. We herschrijven niets.

Vier wensen die het plan moet waarmaken:
- **(a)** Een klant aanmaken en in die klantomgeving werken.
- **(b)** De ATAD2-assessment als een herhaalbare actie binnen de klant.
- **(c)** Een "ik ben nog niet klaar, stel me eerst vragen"-modus.
- **(d)** Ontbrekende info later aanvullen en alleen de geraakte delen herrekenen.
- **(e)** Volgende jaren makkelijk bijwerken.

---

## 2. Waar we nu staan

**Er bestaat geen klant.** Elke assessment is één rij in `atad2_sessions`, eigendom
van één gebruiker, met de bedrijfsidentiteit als los stukje tekst
(`taxpayer_name`, `entity_name`, `fiscal_year`). Er is geen verband tussen
"Acme BV 2024" en "Acme BV 2025", en geen snelle manier om "alle jaren van dit
bedrijf" op te vragen, anders dan zoeken op tekst.

Drie pijnpunten die de wensen bevestigen:
1. **Opnieuw draaien wist alles.** Een assessment overdoen betekent nu dat de
   sessie wordt leeggemaakt; de oude raak je kwijt. (Er ligt al een aanzet in
   [supabase/migrations/20260603130000_session_reset_for_rerun.sql](supabase/migrations/20260603130000_session_reset_for_rerun.sql).)
2. **Documenten worden weggegooid zodra de memo klaar is** (in
   [src/pages/AssessmentReport.tsx](src/pages/AssessmentReport.tsx)). Tegen de tijd
   van volgend jaar is er meestal niets meer om over te nemen.
3. **De memo is één blok uit één AI-aanroep.** De enige manier om een laat
   document mee te nemen, is de hele memo opnieuw schrijven.

Het goede nieuws: de machinerie die we nodig hebben, zit er al.
- Alles wat een assessment nodig heeft (antwoorden, documenten, AI-suggesties,
  structuurschema, memo) hangt al netjes onder de sessie. Daarom is dit goedkoop:
  schuif er een ouder boven en de kinderen erven dat automatisch.
- De document-swarm in
  [supabase/functions/prefill-documents/analyze.ts](supabase/functions/prefill-documents/analyze.ts)
  doet al per vraag een kleine AI-aanroep en schrijft elk resultaat naar een eigen
  regel. Dat is het exacte sjabloon voor per-stuk herrekenen.
- Dezelfde swarm detecteert al gaten (de `contextual_hint`-regels) en gooit dat
  signaal nu weg. Dat is de basis voor "stel me eerst vragen".
- Het veld `report_json` op `atad2_reports` is nu altijd leeg: vrije ruimte om de
  memo in losse secties op te slaan.
- De dashboardpagina [src/pages/Index.tsx](src/pages/Index.tsx) doet nu per sessie
  een aparte telling en rapport-lookup. Dat is het natuurlijke moment om die in
  één query te trekken zodra we per klant gaan groeperen.

---

## 3. Wat we bewust NIET doen

- **Geen herschrijving van de assessment-flow.** De 6 stappen
  ([Assessment](src/pages/Assessment.tsx) → [Upload](src/pages/AssessmentUpload.tsx)
  → [Structure](src/pages/AssessmentStructure.tsx) →
  [Confirmation](src/pages/AssessmentConfirmation.tsx) →
  [Report](src/pages/AssessmentReport.tsx)) blijven staan.
- **Geen kantoorbrede tenancy.** Een klant is van de adviseur (zie keuzes). Delen
  binnen het kantoor komt eventueel later, zonder het mapmodel over te doen.
- **Geen verhuizing van omzetvelden.** Omzet blijft per assessment (zie keuzes).
  De lopende revenue-migratie hoeft niet aangepast en kan door zoals hij is.
- **Geen fysieke hernoeming van `atad2_sessions`.** De tabel blijft zo heten,
  ook al betekent hij straks "het assessment van één jaar". Te veel kinderen
  verwijzen ernaar; we lossen het op met duidelijke commentaarregels.

---

## 4. Het datamodel

De vorm verandert weinig. Eén nieuwe tabel, één verwijzing erbij, en een paar
kleine toevoegingen die pas landen in de fase die ze nodig heeft.

### Nieuw: `atad2_clients` (de map)
Eén rij per bedrijf dat een adviseur begeleidt.
- `id`, `user_id` (de eigenaar, zelfde per-gebruiker-model als nu)
- `client_name`, optioneel `client_code`, `jurisdiction`, `notes`
- `created_at`, `archived_at` (zacht verwijderen, zodat audit-historie nooit
  verdwijnt)
- Geen commerciele velden (omzet blijft op de sessie).
- Row-level security: eigenaar-only, plus lees-rechten voor admin/moderator,
  exact zoals het huidige model.

### Gewijzigd: `atad2_sessions` (betekent nu "assessment van één jaar")
- Nieuw: `client_id` → verwijzing naar `atad2_clients`. Komt eerst NULLABLE
  binnen, wordt gevuld, en wordt daarna verplicht.
- Nieuw (Fase 2): `rolled_over_from` (sessie-id van vorig jaar), `rollover_at`.
  De keten teruglezen reconstrueert de tijdlijn 2024 → 2025 → 2026, zonder
  aparte tabel.
- `taxpayer_name` / `entity_name` / `fiscal_year` blijven als momentopname per
  jaar, zodat een klant hernoemen geen historie overschrijft.
- Omzetvelden (`sold`, `revenue_eur`, ...) blijven ongewijzigd op de sessie.

### Kleine toevoegingen, alleen waar nodig
- **Documenten → klantbibliotheek (Fase 1):** documenten verhuizen van de sessie
  naar de klant. `atad2_session_documents` krijgt een `client_id` en de opschoning
  na een geslaagde memo vervalt: niets wordt meer weggegooid. Een assessment
  *verwijst* naar de documenten die het dat jaar gebruikt (een `used_in_year`-tag of
  een kleine koppeltabel) in plaats van eigen kopieën te houden. Hierdoor is er bij
  jaar-op-jaar geen kopieerstap meer nodig: de bibliotheek blijft staan. Zie sectie
  5 voor hoe deze bibliotheek in de klantmap zichtbaar wordt.
- **Audit-log (Fase 1):** `client_id` / `client_name` toevoegen aan
  `atad2_assessment_log`, zodat staf op map kan filteren.
- **Memo in secties (Fase 3):** het lege `report_json` vullen met benoemde
  secties (Inleiding, Risico-uitkomst, Samenvatting, Algemene achtergrond,
  Technische beoordeling, Conclusie), elk met tekst plus een vingerafdruk van de
  input die hem maakte. Twee dunne kolommen op `atad2_reports`
  (`parent_report_id`, `regenerated_sections`).
- **Leesbaarheid/readiness (Fase 3):** een paar afgeleide kolommen op de
  bestaande `atad2_question_prefills` (`readiness_state`, `question_for_user`,
  `gap_resolution`), geen nieuwe grote tabel.

### Eenmalige opschoonactie (backfill)
Maak één klant per uniek `(user_id, taxpayer_name)`-paar uit de bestaande sessies
en zet elke sessie zijn `client_id`. Zo landt elk bestaand assessment netjes in
een map en blijft alles werken. Eerst in kijk-modus tonen ter controle (zie
Fase 0), pas daarna wegschrijven.

> Let op het projectproces: er is geen Supabase CLI tegen de self-hosted VM. Het
> bestand [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)
> wordt met de hand bijgewerkt, en migraties draaien als `supabase_admin` via
> `az vm run-command` (zie [CLAUDE.md](CLAUDE.md)).

---

## 5. De klantmap (client workspace)

Een klant ontstaat zoals nu: de adviseur maakt hem zelf aan. Maar in plaats van een
opstapje naar één assessment wordt het een blijvend dossier. De klant blijft jaar
na jaar bestaan; een assessment is een momentopname daarbinnen. Documenten,
kerngegevens, structuur en contacten horen bij de KLANT; antwoorden en de memo
horen bij een specifiek jaar.

Zo ziet de klantpagina eruit:

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Klanten                                                            │
│  Acme BV                          [ + Vragenlijst ]  [ + Assessment ] │
│  NL · klant sinds 2023 · 3 dossierjaren                              │
│  Laatste uitkomst: Laag risico (FY2024) · FY2025 nog niet gestart    │
├──────────────────────────────────────────────────────────────────────┤
│ Overzicht · Documenten · Assessments · Vragenlijsten · Structuur · Details │
├──────────────────────────────────────────────────────────────────────┤
│   ...inhoud van de actieve tab...                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### Twee vaste acties (rechtsboven, altijd zichtbaar)
- **Vragenlijst produceren** maakt op basis van de huidige documenten een lijst
  gerichte vragen (de gaten + verduidelijkingen die de swarm vindt), zonder dat je
  een heel assessment hoeft te starten. Dit is de "ik ben nog niet klaar, stel me
  eerst vragen"-modus als losse, exporteerbare deliverable (Word/PDF), die je naar
  de klant kunt sturen en waarvan de antwoorden terug de bibliotheek in komen.
- **Assessment starten** kiest een jaar en zet je in de bestaande 6-stappen-flow.

### Tabs
- **Overzicht** — de voorpagina: jaren-tijdlijn met uitkomst per jaar, een
  "wat ontbreekt nog"-leesmeter, de kerngegevens-kaart, en recente activiteit.
  Eén blik = waar staan we met deze klant.
- **Documenten** — de bibliotheek (kernwens). Sleep alles erin; de AI sorteert in
  categorieën en vat samen. Up- én download, los of als zip. Per document:
  categorie, AI-samenvatting, relevantie, in welk jaar gebruikt, "dun"-vlag.
  Documenten horen bij de klant; een assessment pakt er een selectie uit. Hiermee
  verdwijnt het weggooi-probleem.
- **Assessments** — de jaren-tijdlijn: per jaar status, uitkomst, openen/hervatten,
  "start volgend jaar". De bestaande flow zit hierachter.
- **Vragenlijsten** — de geproduceerde vragenlijsten, exporteerbaar en bewaard;
  antwoorden voer je terug de assessment in.
- **Structuur** — het groepsschema op klantniveau. Elk jaar erft dit als startpunt
  en maakt er een jaarsnapshot van.
- **Details** — kerngegevens, contacten, notities, en de commerciële strook (per
  jaar verkocht/omzet rolt hier op).

### Toevoegingen die een dossier echt af maken
Nu meenemen (goedkoop, leunt op wat er al is):
- **Kerngegevens-kaart** — de stabiele feiten die elk jaar terugkomen (entiteiten,
  jurisdicties, boekjaareinde, fiscale eenheid, bekende hybride structuren). De
  ruggengraat die elk jaar warm laat starten; dit onderscheidt een platform van een
  one-shot tool.
- **Wat-ontbreekt-nog-paneel** — een levende checklist (documenten + open vragen)
  die het gat-signaal dat de swarm al produceert actiegericht maakt.
- **Dossier/activiteitenlog** — een tijdlijn van alles (geüpload, gedraaid,
  bevestigd, verstuurd). Audit-trail én geheugen; de audit-tabel bestaat al.
- **Notities** — vrije tekst per klant ("herstructurering medio 2025", "wacht op
  master file van HQ"). Het `notes`-veld bestaat al.

Later (waardevol, mag wachten):
- **Jaar-op-jaar verschil-overzicht** — een one-pager "wat veranderde t.o.v. vorig
  jaar" (uitkomst, antwoorden, structuur). Sterke jaarlijks-product-feature, sluit
  op de rollover aan.
- **Contacten** — wie spreken we bij de klant (naam, e-mail); nodig zodra je
  vragenlijsten gaat versturen.
- **Deadlines/nudges** — "FY2025 nog niet gestart" met deadline-indicator, later
  koppelbaar aan herinneringen.

---

## 6. Het plan: vier fasen

### Fase 0 — Stille fundering (nog geen schemawijziging)
Doel: de veilige, additieve groundwork landen waar alle latere fasen op leunen,
en twee zichtbare winsten boeken, vóór we het datamodel aanraken. Laagst
mogelijke risico, alles omkeerbaar.
- Dashboard-queries op [src/pages/Index.tsx](src/pages/Index.tsx) vervangen door
  één samenvattende query/view, zodat de homepage snel blijft zodra hij per klant
  groepeert.
- In één TypeScript-bestand de statische kaart vastleggen van "welke memo-sectie
  hangt aan welke antwoorden/sessievelden", plus een kleine input-hash-helper.
  Pure code, los te testen, geen backend.
- Documenten niet meer hard verwijderen bij een geslaagde memo wanneer een "bewaar
  voor volgend jaar"-vlag staat; in plaats daarvan als "retained" markeren. Eén
  kleine aanpassing in het bestaande opschoonpad in
  [src/pages/AssessmentReport.tsx](src/pages/AssessmentReport.tsx).
- De dedup-query (uniek `user_id` + `taxpayer_name`) in kijk-modus draaien, zodat
  de voorgestelde klantenlijst gecontroleerd kan worden vóór er iets wordt
  weggeschreven.

Oplevering: een sneller dashboard, een gecontroleerde lijst voorgestelde
klantmappen, documentbehoud aan vanaf nu, en de afhankelijkheidskaart op zijn
plek. Aan de flow verandert nog niets zichtbaar.

### Fase 1 — Klanten en de klantomgeving (wens a + b)
Doel: de klantmap introduceren en de assessment een herhaalbare actie erin maken.
Dit is de kern van de ombouw en hergebruikt de hele bestaande 6-stappen-flow.
- `atad2_clients` aanmaken met row-level security (eigenaar-scoped, plus
  admin/moderator lezen). `client_id` toevoegen aan `atad2_sessions` als nullable.
- De gecontroleerde backfill draaien: één klant per uniek
  `(user_id, taxpayer_name)`-paar, `client_id` zetten. Controleren op wezen, dan
  de NOT NULL-constraint zetten.
- Nieuwe homepage: een doorzoekbare lijst klantmappen (naam, aantal assessments,
  laatste jaar en uitkomst, of dit jaar nog openstaat) met een "Nieuwe klant"-knop.
  De oude `/` redirecten hiernaartoe. De bestaande sessie-kaart hergebruiken, één
  niveau lager.
- Klantomgeving op `/clients/:clientId` (zie sectie 5 voor de volledige opzet) met
  tabs Overzicht, Documenten, Assessments, Vragenlijsten, Structuur en Details, en
  twee vaste knoppen rechtsboven: "Vragenlijst produceren" en "Assessment starten".
  De "Assessment starten"-knop maakt een nieuwe sessie met `client_id` en zet de
  gebruiker in de bestaande flow. De "Vragenlijst produceren"-knop landt nu al in de
  UI en wordt in Fase 3 op de readiness-/swarm-motor aangesloten.
- Documenten naar klantniveau tillen: `client_id` op `atad2_session_documents`, de
  upload-/downloadbibliotheek in de Documenten-tab, en de opschoning-bij-memo-succes
  uitzetten. Een assessment verwijst voortaan naar de documenten die het dat jaar
  gebruikt.
- De intake bedraden zodat, gestart vanuit een klant, `taxpayer_name` is voorgevuld
  (bewerkbaar) en het formulier alleen om het jaar vraagt. De enkele `client_id`
  toevoegen aan de ene startSession-insert in [src/pages/Assessment.tsx](src/pages/Assessment.tsx).
  Een "Klantnaam / FYxxxx"-broodkruimel boven de bestaande stepper.
- `client_id` / `client_name` toevoegen aan de audit-log en de admin Sessions-pagina
  laten filteren op map.

Oplevering: een adviseur logt in, ziet zijn klanten, opent er één, en draait dit
jaar als één knop. Elk eerder assessment staat nu in zijn map. De flow en de
AI-pijplijn zijn ongewijzigd. Wensen (a) en (b) zijn klaar.

### Fase 2 — Jaar-op-jaar overzetten (wens e)
Doel: "volgend jaar doen" wordt één klik die vorig jaar meeneemt en daarna alleen
vraagt naar wat veranderde.
- `rolled_over_from` / `rollover_at` op de sessie en een `rollover_session`-RPC
  gemodelleerd op de bestaande reset-RPC
  ([20260603130000_session_reset_for_rerun.sql](supabase/migrations/20260603130000_session_reset_for_rerun.sql)):
  eigendom-gecontroleerd, atomisch, audit-gelogd. Hij maakt het nieuwe jaar onder
  dezelfde klant, kopieert antwoorden (getagd "overgenomen") en het afgeronde
  structuurschema (posities behouden, status terug naar bewerkbaar).
- Documenten worden NIET gekopieerd: ze staan al in de klantbibliotheek (Fase 1).
  Het nieuwe jaar verwijst simpelweg naar de relevante documenten. Dat schrapt de
  hele storage-kopieerstap en het bijbehorende risico.
- Een "Start volgend jaar"-knop op afgeronde assessments (dashboardkaart en eind
  van de memo) en een tijdlijn per klant zodat de lijn zichtbaar is.
- Een "Wat is er veranderd?"-scherm (variant van de vragenpagina) dat overgenomen
  antwoorden in twee bakjes toont: "Waarschijnlijk veranderd" (een document
  verschoof of een eerder antwoord werd bewerkt) en "Overgenomen, lijkt ongewijzigd"
  (bevestig met één klik). Daarna gaan de gewone bevestiging/structuur/memo-stappen
  verder.
- De swarm uitbreiden met een optioneel vragenfilter, zodat alleen de vragen die
  geraakt worden door een veranderde documentcategorie of een bewerkt eerder
  antwoord opnieuw worden geanalyseerd, plus een gerichte structuur-diff
  (toegevoegde/verwijderde entiteiten, gewijzigde belangen). Beide volgen de harde
  grounding-regel: geen verzonnen wijzigingen.

Oplevering: volgend jaar starten is één knop. Vorig jaar verschijnt voorgevuld,
het ongewijzigde deel bevestig je in een klik, alleen wat echt bewoog beantwoord
je opnieuw. Wens (e) is klaar. Let op: de klantbibliotheek bevat alleen documenten
die vanaf Fase 0 (documentbehoud) zijn bewaard; eerder weggegooide documenten zijn
niet met terugwerkende kracht terug te halen.

### Fase 3 — "Stel me eerst vragen" + stuksgewijs herrekenen (wens c + d)
Doel: de "nog niet klaar, stel me eerst vragen"-modus, en later ontbrekende info
aanvullen en alleen de geraakte memo-delen herrekenen.
- Readiness tonen als afgeleide kijk op wat de swarm al produceert: BEKEND (een
  gegronde suggestie), VRAAG-AAN-MIJ (de swarm vond een aanwijzing maar wil
  bevestiging, de huidige `contextual_hint`), GEEN-SIGNAAL. Opslaan op de bestaande
  prefill-regels en een simpele leesmeter tonen.
- Lus 1 (vooraf): na de eerste documentscan een "Voor je begint, een paar open
  vragen"-paneel dat elk VRAAG-AAN-MIJ-gat in gewone taal stelt. De adviseur upload
  een document (herrekent die ene vraag) of typt een antwoord, dat als bewijs wordt
  teruggevoerd in die swarm-aanroep. De bestaande "toch starten"-uitweg blijft;
  nooit hard blokkeren.
- Lus 2 (achteraf): op de bevestigingspagina elke vraag die nog VRAAG-AAN-MIJ is
  tonen als "Ontbrekende informatie". Een gat invullen herrekent alleen die vraag
  (de regel-per-vraag maakt dit schoon) en werkt het antwoord ter plekke bij.
- De memo opslaan als adresseerbare secties in het al-lege `report_json`, met per
  sectie de input-vingerafdruk uit de afhankelijkheidskaart van Fase 0. De
  gerenderde markdown blijft de bron voor downloads en weergave.
- Een "Memo bijwerken"-pad dat de vingerafdrukken vergelijkt, ALLEEN de verouderde
  secties opnieuw genereert via een nieuwe Supabase Edge Function (gekloond van de
  bestaande per-vraag swarm-functie, in lijn met de beweging weg van n8n), en ze
  terugzet, met archivering van de vorige versie. De drie risico-narratief-secties
  altijd samen herrekenen, zodat de memo zichzelf niet tegenspreekt. De bestaande
  "alles opnieuw"-knop blijft als uitweg.

Oplevering: een adviseur kan zeggen "ik ben nog niet klaar, vraag me wat je nodig
hebt", die gerichte vragen vooraf beantwoorden, en later een ontbrekend document
toevoegen waarna alleen de geraakte memo-secties bijwerken, voor een fractie van
de kosten en zonder de sessie te wissen. Wensen (c) en (d) zijn klaar.

---

## 7. Vastgelegde keuzes

- **Eigenaarschap klant: per adviseur.** Spiegelt het huidige model, laagste
  risico, een echte "oudermap erboven". Kantoorbreed delen kan later, zonder het
  mapmodel over te doen.
- **Omzetvelden: per assessment (status quo).** Omzet blijft op de jaar-sessie.
  De lopende revenue-migratie hoeft niet aangepast.
- **Documenten: één klantbibliotheek, geen kopieën.** Documenten horen bij de klant
  en blijven staan; een assessment verwijst naar de documenten die het dat jaar
  gebruikt. Dit maakt de up-/download-bibliotheek mogelijk en schrapt meteen de
  kopieer- en opschoon-complexiteit van jaar-op-jaar.
- **Overnemen is opt-in, prominent.** Vorig jaar overnemen is het hele punt, maar
  automatisch een stempel zetten is voor fiscaal werk een risico. Eén duidelijke
  knop, en zichtbaar markeren welk jaar is overgenomen en licht beoordeeld, zodat de
  audit-trail eerlijk blijft.
- **Standaard-start blijft mogelijk.** Een snelle start die eerst vraagt "welke
  klant?" (kies bestaand of maak nieuw), zodat elk assessment in een map landt
  zonder de snelle route te verliezen.
- **Granulariteit herrekenen: zes secties, drie risico-narratieven samen, op een
  Edge Function.** Voorkomt een memo waarin één deel "onvoldoende informatie" zegt
  en een ander deel zegt dat het gat gevuld is.

---

## 8. Risico's en hoe we ze afdekken

- **Backfill verkeerd groeperen** (twee bedrijven met dezelfde getypte naam
  samengevoegd, of "Acme BV" vs "Acme B.V." gesplitst). Afdekken: dedup eerst in
  kijk-modus, product owner controleert de lijst, en een "klanten samenvoegen"-tool
  als snelle follow-up. Groepering is een suggestie die de gebruiker kan
  corrigeren, nooit een harde automatische samenvoeging.
- **`client_id` verplicht maken is een brekende wijziging** als ergens nog een
  sessie zonder wordt gemaakt. Afdekken: strikte volgorde (nullable, backfill,
  controleren, dan NOT NULL) en bevestigen dat de startSession-insert in
  [src/pages/Assessment.tsx](src/pages/Assessment.tsx) de enige aanmaakplek is.
- **Documenten worden nu bij memo-succes verwijderd**, dus assessments afgerond
  vóór Fase 0 hebben niets om over te nemen. Documenthergebruik werkt alleen
  vooruit. Duidelijk communiceren, niet met terugwerkende kracht oplosbaar.
- **Documenten aan de juiste klant koppelen tijdens de backfill.** Omdat documenten
  naar klantniveau verhuizen, moeten bestaande documentregels aan de juiste klant
  worden gehangen (via hun sessie). Afdekken: de koppeling afleiden uit de sessie
  die het document al bezit, en controleren op wezen vóór de NOT NULL-constraint.
- **Overnemen en herrekenen verleiden tot het stempelen van verouderde
  conclusies.** Afdekken: het "Waarschijnlijk veranderd"-bakje, bevestigen per
  vraag, een zichtbare "overgenomen, licht beoordeeld"-markering, en overgenomen
  antwoorden een expliciete "bevestigd voor dit jaar"-status geven, niet enkel
  "gekopieerd".
- **Tegenstrijdigheid tussen memo-secties** (een herberekende Conclusie naast een
  oude Samenvatting). Afdekken: de drie risico-narratieven samen herrekenen plus
  een server-side uitkomst-consistentiecheck. "Alles opnieuw" blijft beschikbaar.
- **Naamsmell:** `atad2_sessions` betekent nu "een assessment". Afdekken met
  duidelijke commentaarregels in migratie en types. Fysieke hernoeming is buiten
  scope.
- **Kostenverwachting:** per-sectie herrekenen is niet letterlijk 1/6 van de
  kosten; elke aanroep leest de andere secties mee. Besparing is echt, maar kleiner
  dan de simpele rekensom. Verwachting zo zetten.
- **Oude bookmarks naar `/`** komen op de klantlijst; admin-/globale weergaven
  voelen sessie-centrisch tot ze klantgroepering krijgen. Lage impact voor één
  interne gebruikersgroep; `/` redirecten en de admin-weergaven als follow-up
  markeren.

---

## 9. Quick wins (los te leveren, lage risico)

- Het N+1 dashboard nu in één query trekken; de homepage gaat zo meer werk doen
  door per klant te groeperen, en dit versnelt het huidige scherm meteen.
- Documentopschoning nu omzetten naar bewaren-in-plaats-van-verwijderen achter een
  vlag; kleine wijziging die alles van jaar-op-jaar deblokkeert en vanaf nu
  documenten bewaart.
- De klant-dedup-query in kijk-modus draaien en de voorgestelde maplijst tonen vóór
  er iets wordt weggeschreven; maakt de riskantste stap (backfill) gecontroleerd en
  omkeerbaar.
- De statische sectie-afhankelijkheidskaart en input-hash-helper vroeg toevoegen
  als pure, testbare code; nodig voor het herrekenen, maar nul backend-risico.
- Readiness vroeg tonen als simpele meter over data die de swarm al produceert
  (BEKEND / VRAAG-AAN-MIJ / GEEN-SIGNAAL), vóór een van beide lussen wordt gebouwd.
- De bestaande reset-RPC als letterlijk sjabloon voor de overzet-RPC gebruiken, in
  plaats van er een vanaf nul te ontwerpen.

---

## 10. Deployen

Volgt het bestaande projectproces (zie [CLAUDE.md](CLAUDE.md)):
- Frontend alleen via Azure App Service (GitHub Actions), nooit op de VM.
- DB-migraties als `supabase_admin` via `az vm run-command`.
- Edge functions rsync naar de DASH-path (`/root/supabase-docker/volumes/functions/`)
  en de container herstarten; md5 controleren binnen de container.
- [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) met de
  hand bijwerken bij elke schemawijziging.
- Commit/push alleen op expliciet verzoek; main is live productie.
