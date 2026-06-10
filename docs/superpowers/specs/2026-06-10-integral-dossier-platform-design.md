# Integraal ontwerp: van flow naar dossier-platform

Status: door Lennart goedgekeurd op hoofdlijnen (2026-06-10); dit document is de
vastlegging. Vervangt de aanname in [REPLATFORM.md](../../../REPLATFORM.md) dat
"de 6-stappen-flow exact blijft zoals hij is"; de overige inhoud van
REPLATFORM.md (klantmappen, klantwerkruimte, jaar-op-jaar) blijft geldig en is
in de routekaart hieronder opgenomen.

Totstandkoming: vijf parallelle deelontwerpen (dossier-model, open-vragen-lus,
hub/navigatie, rapporten, routekaart), daarna drie adversariële controles
(code-haalbaarheid, onderlinge consistentie, audit/fiscale deugdelijkheid; 36
bevindingen, alle verwerkt), daarna één synthese. Alle code-verwijzingen zijn
geverifieerd in de repo.

---

## 1. Doel en principes

### Doel
Een jaarassessment is geen gang meer die je van begin tot eind doorloopt, maar
een **dossier**: één klant, één boekjaar, vijf blijvende bouwblokken
(Documenten, Vragen, Structuur, Technische bijlage, Rapport). De adviseur opent
elk blok in elke volgorde, stopt halverwege, komt dagen later terug. De
database kent altijd de eerlijke status van elk blok, houdt live bij welke
informatie nog bij de klant ligt, kan op dag één een gewatermerkte tussenstand
produceren, en maakt het onmogelijk dat een definitieve memo vertrekt terwijl
er nog een vraag open en onbeoordeeld ligt.

### Vastgelegde gebruikersbeslissingen (2026-06-10)
1. **Bouwblokken + begeleiding**: de corridor verdwijnt; een "volgende
   stap"-paneel begeleidt maar dwingt nooit.
2. **Alleen adviseurs, voor altijd**: geen klantportaal, geen deelbare links.
   "De klant vragen" = de open-vragenlijst exporteren, offline bespreken,
   antwoorden zelf intypen.
3. **Open vragen druppelen live binnen** tijdens de analyse (geen extra
   AI-ronde; binnen seconden zichtbaar).
4. **Twee rapportsoorten**: tussenstand (altijd toegestaan, duidelijk
   gewatermerkt) en definitief (alleen door de poort).
5. **Aanpak: fundament eerst**: eerst het expliciete dossier-model in de
   database, dan de hub erbovenop; bestaande pagina's worden blok-bewerkers.
6. **De appendix-tak (feat/technical-appendix) gaat pas naar main wanneer
   Lennart hem klaar verklaart**; de routekaart is daarop ingericht (zie §8).

### Ontwerpprincipes
1. **Afleiden boven opslaan.** Statussen worden berekend uit data die er al is,
   in één database-overzicht. Opgeslagen wordt alleen wat niet af te leiden
   valt: aftekeningen van de adviseur (wie/wanneer/waarom) en de levensloop van
   AI-taken.
2. **Eén eigenaar per feit.** `atad2_answers` is de enige waarheid voor de
   memo-poort; het open-vragen-register is de werklaag erbovenop en poort
   nooit zelf. Er is precies één poortfunctie, één rapportsoort-kolom, één
   generatie-status-mechanisme.
3. **De adviseur is de enige auteur van antwoorden.** AI signaleert, de
   adviseur beslist. Een AI-suggestie overschrijft nooit een vastgelegd
   antwoord en beweegt nooit de poort.
4. **De poort zit in de database, bij elke schrijver.** Dezelfde functie wordt
   aangeroepen door de UI, door de nieuwe rapportmotor én door de bestaande
   n8n-route tijdens de overgang. Een verouderd tabblad of een rauwe
   API-aanroep kan geen ongepoorte definitieve memo maken.
5. **Aftekeningen op naam; archiveren, nooit wissen.** Rapporten worden voor
   gebruikers onverwijderbaar (archiveren vervangt verwijderen);
   antwoordwijzigingen krijgen een append-only logboek; de structuurchart
   krijgt `finalized_by`.
6. **Begeleiden, nooit dwingen.** Niets is grijs of op slot, behalve de knop
   "Generate final memorandum" (expliciet gesanctioneerd door beslissing 4).
7. **Productie breekt nooit.** Elke plak is los leverbaar; elke oude route
   krijgt een doorverwijzing (met behoud van query-parameters); de n8n-memoroute
   blijft byte-voor-byte werken tot de nieuwe motor zich bewezen heeft.
8. **Gegronde AI.** Het HARD GROUNDING RULE-blok blijft byte-identiek. De ene
   lijst die een klant letterlijk leest (de opgevraagde informatie) is
   deterministische registerdata, nooit AI-tekst.
9. **Huispatronen hergebruiken**: de twee-assige bijlage-status
   (generation_status + review_status), zacht archiveren
   (archived_at/archived_by), het admin_reset_session-RPC-sjabloon, en het
   bestaande realtime-invalidatiepatroon uit usePrefill.ts.

---

## 2. Het dossier-model

### De dossier-rij
Geen nieuwe tabel: één `atad2_sessions`-rij ís één jaardossier (na de
klantmappen-plak ook met `client_id`). Alle vijf blokken hangen al aan
`session_id`.

### Eén statusvocabulaire
Elk blok rapporteert één van zes statussen, eenmalig gedefinieerd in
SQL-CASE-regels in één view: **empty** (niets), **generating** (AI werkt nu,
verse hartslag), **in_progress** (inhoud bestaat, werk resteert), **attention**
(mislukt of vastgelopen), **ready** (compleet, wacht op aftekening),
**confirmed** (afgetekend, altijd gedekt door een opgeslagen tijdstempel). De
UI mag labels mappen ("Analyzing" voor generating) maar verzint nooit een
zevende status.

### Wat wordt opgeslagen (alleen oordelen en levenslopen)
- **`atad2_answers`** krijgt `unknown_confirmed_at` (timestamptz),
  `unknown_confirmed_by` (uuid), `unknown_confirmed_note` (text) en
  `updated_at` (standaard-trigger). Een BEFORE UPDATE-trigger wist de drie
  bevestigingskolommen zodra de antwoordwaarde wijzigt: een verouderde
  aftekening kan een antwoord-bewerking nooit overleven.
- **Nieuw, append-only: `atad2_answer_events`** (session_id, question_id,
  oud/nieuw antwoord, oud/nieuwe toelichting, bevestiging gezet/gewist, actor,
  created_at), geschreven door dezelfde trigger in dezelfde transactie. De
  vragenlijst draagt de eigenlijke risico-oordelen en krijgt hiermee hetzelfde
  spoor dat de bijlage al heeft via `atad2_appendix_edits`.
- **`atad2_prefill_jobs`** krijgt `heartbeat_at`; de browser-swarm-lus werkt
  hem elke ~20 seconden bij (patroon gekopieerd van de chart-heartbeat). Een
  lopende job met een hartslag ouder dan 2 minuten leidt af naar *attention*
  met een Resume-actie (hervatten is al idempotent).
- **`atad2_structure_charts`** krijgt `finalized_by` (uuid), gevuld door het
  bestaande finalize-schrijfpad (sluit de enige aftekening zonder actor).
- **`atad2_reports`** krijgt `report_kind` ('interim'|'final', default 'final'
  zodat historie en n8n-rijen correct classificeren), `generation_status`
  ('generating'|'ready'|'error', default 'ready'), `error_message`,
  `prompt_version`, `parent_report_id`, `regenerated_sections` (text[]),
  `open_questions` (jsonb, bevroren momentopname voor tussenstanden) en
  `total_risk` wordt numeric (risicosommen zijn fractioneel). **De rapportrij
  is tegelijk de generatie-taak** (het bijlage-huispatroon): geen aparte
  jobs-tabel, geen tweede realtime-kanaal.
- Het open-vragen-register (§3) bevat uitsluitend werkstroom-status.

### Wat wordt afgeleid
Eén security_invoker-view **`atad2_dossier_blocks`**, één rij per sessie: de
vijf blokstatussen plus ruwe feiten (documentenaantal, prefill-jobstatus,
aantal open onbekenden, antwoorden-aantal, chartstatus, bijlagestatussen,
heeft-tussenstand, heeft-definitief, rapportgeneratie-status, en de grove vlag
`inputs_changed_after_final`). Deze view **vervangt** de eerder geplande
`atad2_session_summaries`; ook de klantenlijst en de werkruimte lezen hem,
zodat er precies één status-orakel is. Er is geen TypeScript-spiegel van de
statusregels, met één gedocumenteerde uitzondering: wélke memo-secties
verouderd zijn wordt client-side berekend uit `sectionDependencies.ts` (daar
wonen de vingerafdrukken); de view levert alleen de grove drift-vlag.

### Per-blok-afleidingsregels (samengevat)
- **Documenten**: empty / in_progress (documenten zonder dekkende analyse) /
  ready (laatste analyse dekt alle documenten). Blokkeert de poort nooit: een
  dossier beantwoord uit adviseurskennis is legitiem.
- **Vragen**: generating (jobfase stage2 + verse hartslag); attention (vastgelopen,
  mislukt, of deels mislukte swarm afgeleid uit tellingen); empty; in_progress
  (vragenpad niet uitgelopen óf onbevestigde Unknown-antwoorden resteren);
  confirmed (vragenpad af én nul onbevestigde Unknowns). De uitkomst-bevestiging
  hoort NIET bij dit blok maar bij Rapport (anders kan de Vragen-kaart nooit
  "af" zijn zonder een andere pagina te bezoeken).
- **Structuur**: zuivere mapping van de bestaande chart-statusmachine
  (extracting=generating; failed/staal=attention; draft/edited=in_progress;
  finalized=confirmed).
- **Technische bijlage**: mapping van generation_status + review_status;
  confirmed = review_status 'confirmed'. Er komt GEEN 'skipped'-reviewstatus
  (zie §6).
- **Rapport**: generating (verse genererende rij); attention (fout of staal);
  ready (actuele definitieve memo bestaat); in_progress (alleen tussenstand);
  empty. De kaart toont het label "Needs update" (geen status) wanneer er een
  definitieve memo is én `inputs_changed_after_final`.

### De poort voor de definitieve memo
Eén SECURITY DEFINER-functie **`final_report_gate(p_session_id)`** →
`{allowed, blockers:[{code, count}]}`, gemodelleerd op `admin_reset_session`
(eigendomscontrole binnenin; service role toegestaan). Blokkers:
`questions_not_finished`, `open_unknown_answers` (aantal Unknown-antwoorden
zonder bevestiging), `outcome_not_confirmed`, `structure_not_finalized`,
`appendix_missing`, `appendix_not_confirmed`. Het predicaat is bewust
**pad-vrij en antwoord-gebaseerd**: `completed = true` garandeert dat elke
gestelde vraag een antwoordrij heeft, dus AI-gaten buiten het vragenpad kunnen
nooit blokkeren en het register kan nooit met de server van mening verschillen.
`computeQuestionPath` blijft puur een weergave-hulp. `admin_reset_session`
hoeft niet aangepast; bestaande Unknown-antwoorden worden bewust NIET als
bevestigd gebackfilld.

### Migratieset (volgorde, als supabase_admin via az vm run-command; types.ts handmatig)
M1 antwoord-resolutiekolommen + wis-trigger + `atad2_answer_events` +
`finalized_by`; M2 prefill-hartslag; M3 open-vragen-register (§3); M4
rapportkolommen + total_risk numeric + RLS-aanscherping (rapport-INSERT alleen
service_role; gebruikers-DELETE vervalt, archiveren ervoor in de plaats) +
assessment_log-uitbreiding (nieuwe event-typen `interim_generated` /
`final_generated`; het 'completed'-event gaat af bij de eerste gereede
definitieve memo); M5 de view + `final_report_gate` + admin-SELECT-policies op
prefills/jobs/charts (zodat adminschermen door de view juiste statussen zien).
De view verwijst naar `atad2_appendix`; die tabellen staan al op de VM, dus M5
kan vóór de appendix-merge worden toegepast (repo-hygiëne-melding in §6).

---

## 3. De open-vragen-lus

### Twee lagen, één waarheid
`atad2_answers` is de poort-waarheid (bevestigingskolommen); het nieuwe
register **`atad2_open_questions`** is de werklaag die het paneel, de export en
de klant-lus aandrijft. Het register poort nooit; databasetriggers houden de
lagen in de pas zodat ze niet kunnen driften.

### Het register
`atad2_open_questions`: id, session_id (FK cascade), question_id,
UNIQUE(session_id, question_id), status (`open`, `taken_to_client`,
`answered`, `resolved`, `confirmed_unknown`, `dismissed`), source (`swarm`,
`advisor`, `reopen`), `client_question` (één gewone-mensen-zin voor de klant),
`why_it_matters` (uit contextual_hint), `client_answer` + `client_answer_at`,
`taken_to_client_at`, `resolution_note`, `reopen_reason`, `resolved_at`,
tijdstempels. Begeleidend append-only **`atad2_open_question_events`**;
UI-gebeurtenissen (geëxporteerd, gekopieerd, antwoord opgeslagen) lopen via een
kleine SECURITY DEFINER-RPC `log_open_question_event` die actor en tijd
server-side stempelt, zodat de gecontroleerde partij het spoor niet kan
fabriceren of antedateren. RLS: standaard sessie-eigenaar + admin-SELECT.

### Hoe rijen ontstaan (geen extra AI-ronde)
Een trigger op `atad2_question_prefills` vuurt in dezelfde transactie als elke
swarm-upsert: (A) suggestie 'unknown' zonder definitief antwoord → open rij
(source swarm), formulering ververst zolang de rij open/taken_to_client is;
(B) definitieve suggestie spreekt een vastgelegd Ja/Nee tegen bij confidence
≥ 60 → rij op open met source 'reopen' en een gegenereerde reopen_reason,
ZONDER `atad2_answers` aan te raken; (C) idem tegen een bevestigd-onbekend.
**Een heropen-vlag is alleen werkstroom**: hij verschijnt in "Needs attention"
en in het begeleidingspaneel, maar wist nooit de bevestiging aan de
antwoordenkant en herblokkeert nooit de poort. Alleen de adviseur die het
antwoord bewerkt (waardoor de antwoorden-trigger de bevestiging wist) beweegt
de poort. De AI zwaait met een vlag; de adviseur houdt de pen.

Een tweede trigger op `atad2_answers`: een Ja/Nee-antwoord lost registerrijen
in open/taken_to_client/answered automatisch op; een Unknown-antwoord maakt of
heropent een rij; bevestiging zetten flipt de rij naar confirmed_unknown (met
notitie); bevestiging wissen heropent. Beide schrijfpaden (vragenflow én
EditableAnswer) zijn gedekt zonder dat iemand iets hoeft te onthouden.

### Streamen
De trigger draait in de transactie van de swarm-upsert en de tabel zit in de
realtime-publicatie (DO-blok dat beide publicatievormen op de VM aankan), dus
de eerste open vragen verschijnen 5 à 15 seconden na de start van de analyse.
Hook `useOpenQuestions` kloont het bewezen useAllPrefills-patroon
(usePrefill.ts:82-94). Een compacte stream-variant rendert onder de
AnalyzeProgress-kaart.

### Backfill
Gekeyd op "geen niet-gearchiveerde rapportrij bestaat" (NIET op
sessiestatus, want Assessment.tsx zet status 'completed' zodra het vragenpad
eindigt, lang vóór een memo). Lopende dossiers krijgen hun Unknowns en
AI-gaten in het register; echt opgeleverde dossiers blijven met rust.

### De export (de klant vragen, offline)
Twee paneelacties: **"Export to Word"** (docxtemplater + pizzip tegen een
nieuw `open_questions_list.docx` in de bestaande templates-bucket, volledig
client-side) en **"Copy as text"** (genummerde platte lijst voor e-mail).
Beide bevatten de op-pad-rijen in open/taken_to_client, met een checkbox voor
de "May become relevant later"-groep. De status flipt pas naar
taken_to_client als de download of klembord-schrijf is gelukt, gelogd via de
events-RPC. Per rij bestaat "Mark as sent to client" voor ad-hoc-gevallen.

### Antwoorden komen terug
Elke onopgeloste rij klapt uit naar "What did the client say?". Opslaan zet
`client_answer` en status 'answered' (blokkeert de definitieve memo nog
steeds: het onderliggende antwoord is een onbevestigde Unknown tot het is
verwerkt). **"Re-check with AI"** bundelt de klantantwoorden tot één
platte-tekst-document "Client responses recorded by the advisor on <date>",
slaat dat op via het bestaande upload-pad als categorie
`client_correspondence`, en vuurt de bestaande analyze_one-actie per vraag
(concurrency 4). De woorden van de klant worden citeerbaar dossier-bewijs; de
prompt en het grounding-blok blijven onaangeraakt. Landt de re-check
definitief, dan legt de adviseur het antwoord vast in het Vragen-blok en lost
de trigger de registerrij op.

### Bewust als onbekend bevestigen
Dialoog met verplichte korte reden. Voor een op-pad-vraag met
Unknown-antwoord schrijft hij `atad2_answers` (bevestiging + actor + notitie);
de trigger synct het register. Voor een buiten-pad-rij (geen antwoordrij) zet
hij alleen de registerstatus, wat veilig is omdat buiten-pad-rijen de poort
nooit raken. **"Not relevant" (dismissed)** wordt alleen aangeboden voor
buiten-pad-rijen; voor op-pad-rijen zou het de suggestie wekken iets te
sluiten dat de poort niet sluit.

### Klantvriendelijke formulering
De swarm-prompt krijgt één extra outputveld `client_question` (max 300
tekens, alleen bij unknowns, rijdt mee in de bestaande per-vraag-JSON, nul
extra aanroepen; zod-default null houdt oude promptversies parsebaar).
Deterministische terugval: de officiële vraagtekst, en de vaste zin "The
documents did not provide enough information to answer this question."

### Waar het woont
De paginavariant van het paneel mount in de Vragen-bewerker als
`?focus=open`-ingang; de hub toont de live strook; de OpenQuestionsButton zit
in de schil-subheader. "Go to question"-deeplinks dragen `&q=`, en de
doorverwijzingen behouden query-parameters zodat die links de hub-overgang
overleven.

---

## 4. De hub en navigatie

### Vier lagen, één klik uit elkaar
`/clients` (lijst) → `/clients/:clientId` (werkruimte met tabs) →
`/assessments/:sessionId` (de jaardossier-HUB) → `/assessments/:sessionId/<blok>`
(blok-bewerkers = de bestaande pagina's, verhuisd). De hub-URL is
sessie-geworteld, niet onder de klant genest: alle kindtabellen sleutelen op
session_id, sessies kunnen tijdens de overgang een lege client_id hebben, en
elke oude link wordt zo een zuivere tekst-herschrijving. De klant staat in de
broodkruimel, dus de gebruiker ervaart wél de nesting.

### De hub-pagina (src/pages/dossier/DossierHub.tsx)
Van boven naar beneden: (1) kop met belastingplichtige, boekjaar, klantnaam en
een "Assessment details"-dialoog; (2) het **begeleidingspaneel**: één kaart,
één gewone zin, één primaire knop en maximaal twee stille links, berekend door
de pure functie `suggestNextStep` in `src/lib/dossier/guidance.ts`
(unit-getest, 11 eerste-match-regels: documenten uploaden → analyse draaien →
meekijken terwijl de analyse loopt → vragenlijst vervolgen → open vragen
oplossen of tussenstand genereren → structuur finaliseren → bijlage beoordelen
→ uitkomst bevestigen → definitieve memo → verouderde memo bijwerken → klaar).
Het paneel adviseert en blokkeert nooit; (3) de **live open-vragen-strook**
(teller, spinner met "Analysis running, new questions appear as they are
found", eerste paar vragen als chips, "View all"); (4) **vijf blokkaarten**
met status-pil uit het zes-status-vocabulaire, één detailregel, één
laatst-bewerkt-regel, altijd klikbaar, nooit grijs. Meer niet in v1;
activiteitenfeed en jaar-op-jaar wonen in de klantwerkruimte.

### Data
Eén hook `useDossierSnapshot(sessionId)` op `atad2_dossier_blocks`,
geïnvalideerd door realtime-events op prefills, jobs, antwoorden, charts,
bijlage en rapporten, met een 5-seconden-polling-terugval alleen zolang iets
genereert. Paneel, schil-chip en blokkaarten consumeren dezelfde hook en
kunnen dus nooit van mening verschillen.

### De schil
AssessmentShell wordt **DossierShell**: zelfde frame, footer-portal, focus- en
bewegingsgedrag; de stepper-subheader wordt een broodkruimel (Clients /
klantnaam / FY-jaar / blok) plus een compacte volgende-stap-chip rechts
(verborgen als die naar het huidige blok wijst). `steps.ts` wordt vervangen
door een `DOSSIER_BLOCKS`-register in `src/lib/dossier/blocks.ts`. De
broodkruimel degradeert netjes voor sessies zonder client_id. De
verlaat-waarschuwing geldt alleen nog voor blok-bewerker-paden, niet voor de
leesbare hub.

### Lot van elke bestaande pagina
- **AssessmentUpload** → Documenten-bewerker (footer: "Run analysis" + "Back
  to dossier"; het blokkerende wachtscherm vervalt, AnalyzeProgress rendert
  inline).
- **Assessment.tsx** splitst: de intake blijft op `/assessment` (navigeert na
  de insert naar `/assessments/:id/documents`); de vragenmodus wordt de
  Vragen-bewerker met `?focus=open` (paginavariant open-vragen) en
  `?q=`-spring-ondersteuning; de laatste vraag afronden navigeert naar de hub.
- **AssessmentConfirmation overleeft NIET als blok**: de
  bevestig/override-kaart wordt het `OutcomeConfirmationPanel` bovenin de
  Rapport-bewerker (klapt na bevestiging in tot één regel). De uitkomst is de
  poortwachter van de definitieve memo, geen fase van het beantwoorden. De
  route verwijst door naar `/assessments/:id/report`.
- **AssessmentStructure** → Structuur-bewerker; finalize-navigaties wijzen
  naar de hub.
- **De bijlagepagina's** (na de merge) → Bijlage-bewerker met de twee
  subpagina's (facts/checklist).
- **AssessmentReport** → Rapport-bewerker, absorbeert het uitkomst-paneel.
- **Index** parkeert op `/sessions` en verdwijnt later; kaarten linken naar de
  hub. `resumeUrlForSession` vervalt in de laatste stap: de hub plus
  begeleiding doet dat werk live en zichtbaar.

Elke oude route krijgt een permanente doorverwijzing (kleine componenten in
App.tsx) die alle query-parameters behalve de sessie doorgeeft. De
`/assessments`-prefix begint bewust met "/assessment", zodat de bestaande
prefix-check in AppLayout ongemoeid blijft.

### Begeleidingsvolgorde
Structuur wordt vóór Bijlage gesuggereerd (een gefinaliseerde chart geeft een
beter entiteitenregister) en de uitkomst-bevestiging schuift naar het eind
(hij poort alleen de definitieve memo; tussenstanden hebben hem niet nodig).
Niets is verplicht; de bijlage eerst openen werkt zoals vandaag en de prewarm
blijft ongewijzigd vuren.

### Overgang binnen de hub-plak
Fase A: nieuwe routes mounten dezelfde componenten (hub alleen via URL
bereikbaar). Fase B: ingangen wisselen + oude routes worden doorverwijzingen.
Fase C: bevestiging vouwt in Rapport, corridor-navigaties hergericht,
AssessmentShell/stepper/steps.ts/resumeUrl.ts verwijderd. Een gebruiker midden
in een assessment houdt bij elke deploy een werkende URL.

---

## 5. Rapporten: tussenstand en definitief

### Twee soorten uit één motor
- **Tussenstand** (`report_kind` 'interim'): altijd beschikbaar zolang er geen
  definitieve memo is; duidelijk gemarkeerd; draagt een deterministische
  sectie "Information requested from client"; vergrendelt niets; hergenereren
  is goedkoop; alleen de nieuwste blijft actief (oudere zacht gearchiveerd).
- **Definitief** ('final'): de memo van vandaag, gepoort door
  `final_report_gate`. Een geslaagde definitieve memo archiveert eerdere
  definitieve versies ÉN alle actieve tussenstanden: er kan nooit een
  tegenstrijdig paar circuleren.

### Opslag en taakmodel
De rapportrij is de generatietaak (zie §2). `report_json` wordt eindelijk
gevuld: schema_version + zes benoemde secties (introduction, risk_outcome,
executive_summary, general_background, technical_assessment, conclusion),
spiegelend aan de bestaande DOCX-template-tags, elk met content, input_hash en
generated_at. `report_md` blijft de weergavebron, deterministisch gerenderd in
Deno.

### Beveiligingsaanscherping (dicht het poort-gat)
In dezelfde migratie: de open "Service role can insert reports"-policy
(geverifieerd: WITH CHECK (true), geen rolbeperking) wordt vervangen door een
service_role-only-variant, en de gebruikers-DELETE-policy vervalt (archiveren
vervangt verwijderen; de delete-knop in ReportDetail wordt Archive). Zonder
dit kon elke ingelogde gebruiker een rij invoegen die niet van een gepoorte
definitieve memo te onderscheiden was. De migratie bevat een controle dat een
authenticated-insert faalt.

### De poort, drie keer afgedwongen
De UI roept `final_report_gate` aan voor de knop en een
klare-taal-checklist-popover ("Resolve 3 open questions", "Finalize the
structure chart", "Generate and confirm the technical appendix", "Confirm the
assessment outcome"); de nieuwe generate-report-functie roept hem aan vóór
elke definitieve memo (409 met de onvervulde lijst); en de bestaande
n8n-report-functie (repo-eigen Deno) krijgt dezelfde aanroep van ~tien regels,
zodat het venster waarin de poort alleen een frontend-knop was, verdwijnt
zodra de poort-UI live gaat. Tussenstanden kennen geen poort behalve
sessie-eigendom.

### Gedrag ná een definitieve memo
Het harde slot vervalt. Antwoorden, redeneringen en context blijven overal
bewerkbaar; alleen een actief genererend rapport vergrendelt de
Rapport-pagina. Drift na een definitieve memo toont het label "Inputs changed
since this memorandum was generated" met twee knoppen: **"Update
memorandum"** (toont de verouderde secties) en **"Regenerate fully"**. Zonder
deze versoepeling zou de late-antwoorden-flow (gebruikersbeslissing 4)
onbereikbaar zijn.

### De motor
`supabase/functions/generate-report/`, gekloond van generate-appendix
(verifyAuth, claude.ts met prompt-caching, EdgeRuntime.waitUntil, direct
antwoord, frontend polt de rij elke 4 seconden; de fragiele
10-minuten-open-fetch verdwijnt). Generatie = twee parallelle Claude-aanroepen
met één gedeeld gecachet systeemblok: groep A (introduction,
general_background, technical_assessment) en groep B (het risicotrio:
risk_outcome, executive_summary, conclusion; nooit gesplitst zodat de memo
zijn eigen uitkomst niet kan tegenspreken). Dubbelklik-veilig: een verse
genererende rij van dezelfde soort kortsluit; verouderde of fout-rijen worden
hergebruikt, nooit gedupliceerd.

### Tussenstand-identificatie
De markdown is zelf-identificerend: de renderer zet er een vaste kop boven
(soort, datum, de mededeling "This is an interim report. Information has been
requested from the client. Findings are preliminary and may change.", en de
genummerde open-vragenlijst uit de bevroren jsonb), zodat elke kopieer-plak de
markering meedraagt. ReportDetail krijgt een soort-badge en banner. De
DOCX-export gebruikt een nieuw template `memo_atad2_interim.docx` (diagonaal
INTERIM-watermerk, mededeling, open-vragen-lus met lege-lijst-terugval). De
kaart op het scherm toont live "N of these questions have been resolved since
this report was generated". Als `report_json.sections` bestaat, bouwt de
download direct uit de secties en vervalt de n8n-parse-omweg (die blijft
alleen voor oude rijen).

### Stuksgewijs bijwerken (alleen definitief)
Per-sectie-vingerafdrukken (antwoordwaarden + toelichtingen van gemapte
vragen, uitkomstvelden, chart-tijdstempels, bijlage-tijdstempel +
reviewstatus, gesorteerde document-ids), eenmalig gedefinieerd in
`src/lib/memo/sectionDependencies.ts` met een Deno-spiegel (sync-waarschuwing
erin). Update-modus hergenereert alleen verouderde secties (risicotrio
alles-of-niets) via een `memo_update_system`-prompt met de onaangeraakte
secties als alleen-lezen context, schrijft een NIEUWE rij met
parent_report_id en regenerated_sections, en archiveert de ouder.
Tussenstanden hergenereren altijd volledig (goedkoop). Oude n8n-memo's bieden
alleen "Regenerate fully". Een geaccepteerde "Improve memo"-revisie maakt een
NIEUWE rij met gearchiveerde ouder, muteert nooit report_md ter plekke.

### Prompts en n8n-overgang
Drie nieuwe prompt-keys (`memo_sections_system` v1 met
{{CONFIRMED_APPENDIX_BLOCK}} ingebouwd, `memo_interim_system` v1,
`memo_update_system` v1); de migratie verbreedt eerst de key-CHECK-constraint
volgens het vaste patroon. De live `memo_system` v3 blijft onaangeraakt; n8n
leest hem tot pensionering. Volgorde: migratie eerst (n8n-rijen landen correct
via defaults) → tussenstand-only op de edge function (bewijst de hele motor
op een gloednieuw artefact) → definitief achter een
`FINAL_MEMO_VIA_EDGE`-constante, zij-aan-zij gevalideerd op 2 à 3 echte
sessies → omzetten; webhook als noodrem; ontmantelen na rustige inwerkperiode.
De niet-toegepaste memo-v4-migratie wordt nooit toegepast en krijgt een
"superseded"-markering.

### Audit-trail
De motor schrijft assessment_log-events (interim_generated /
final_generated met rapport-id, soort, titel, risicofeiten); de
event-type-CHECK wordt in de fundamentmigratie verbreed; het
'completed'-event gaat af bij de eerste gereede definitieve memo (een
geleverde definitieve memo is in de dossierwereld de enige eerlijke definitie
van "klaar").

---

## 6. De technische bijlage als blok

De bijlage is vanaf dag één het vijfde blok; haar bestaande twee-assige status
mapt zuiver op het gedeelde vocabulaire en dat patroon wordt het huisstijl-
taakmodel voor de rapportmotor.

**Merge-timing (aangepast op besluit van Lennart, 2026-06-10): de tak gaat pas
naar main wanneer hij er inhoudelijk klaar voor is.** Consequenties, verwerkt
in de routekaart (§8): (a) plakken die alleen database of nieuwe bestanden
raken gaan gewoon vooruit; (b) de zware schermplakken (hub, rapport-bewerker)
wachten tot ná de merge, omdat de tak exact die bestanden herschreef; (c)
kleine fixes aan gedeelde bestanden (zoals de documentbehoud-fix) worden
meteen óók op de appendix-tak gezet (cherry-pick); (d) main wordt regelmatig
in de appendix-tak gevoegd zodat de uiteindelijke samenvoeging behapbaar
blijft; (e) alle regelnummer-ankers worden ná de merge herijkt.

**Poort en Skip**: de poort eist review_status 'confirmed'
(appendix_missing / appendix_not_confirmed). Een heel-bijlage-'skipped'-status
komt er NIET (zou de poort passeren zonder wie/wanneer). De legitieme
ontsnapping voor een dossier zonder bijlage-inhoud is de al gebouwde
per-pagina Skip, gevolgd door Confirm (op naam, gelogd in
atad2_appendix_edits). De hub-kaart toont dan Confirmed met detailregel "All
pages skipped".

**De bijlage komt server-side de memo in**: het openstaande memo-v4-punt lost
zichzelf op. De nieuwe memo-prompt bevat de placeholder ingebouwd en de
generate-report-functie injecteert het bevestigde bijlageblok zelf, consistent
met de beweging weg van n8n. De CLAUDE.md-OPENSTAAND-bullet wordt herschreven
zodra die plak levert. `sectionDependencies.ts` neemt de bijlage mee als
inputbron, zodat een bijlagewijziging na een definitieve memo correct "Update
memorandum" aanzet.

**Repo-hygiëne**: de view-migratie (M5) verwijst naar `atad2_appendix`, dat al
op de VM staat maar waarvan het migratiebestand nog op de tak zit. Dat werkt
(de VM heeft de tabellen), maar tot de merge bevat main een migratie die naar
een elders gedefinieerde tabel verwijst; dit wordt expliciet in de
migratie-kop gedocumenteerd.

---

## 7. Wat er met de bestaande documenten gebeurt

Bij de eerstvolgende documentatieplak worden bijgewerkt zodat alles weer één
verhaal vertelt:
- **REPLATFORM.md**: "de 6-stappen-flow blijft exact zoals hij is" vervalt;
  het dossier-model, tussenstand/definitief, geen-portaal en de nieuwe
  plak-volgorde komen erin; de eigen Fase-3-vragenlijstmotor vervalt (de
  vragenlijst IS de register-export); `atad2_session_summaries` vervalt ten
  gunste van `atad2_dossier_blocks`.
- **docs/superpowers/plans/2026-06-10-client-platform-phase-0-1.md**: blijft
  geldig voor de klantmappen-onderdelen maar de stappen 0.2 (view-keuze) en
  1.6 worden herwezen naar `atad2_dossier_blocks`.
- **CLAUDE.md**: de OPENSTAAND-memo-v4-bullet wordt herschreven zodra de
  rapportmotor-plak levert.

---

## 8. Routekaart: elf plakken, elk los leverbaar

Volgorde aangepast aan het uitstel van de appendix-merge. Dezelfde inhoud,
andere volgorde: al het donkere fundament eerst, schermverbouwingen die met de
appendix-tak botsen erna.

| # | Plak | Maat | Afhankelijk van |
|---|------|------|-----------------|
| 1 | **Documentverlies stoppen**: cleanup-aanroep weg uit AssessmentReport.tsx; zelfde fix als cherry-pick op de appendix-tak; revenue-kolommen op de VM verifiëren | S | – |
| 2 | **Stil voorwerk**: dashboard-N+1-fix; sectionDependencies.ts + hash-helper; klant-dedup read-only ter controle | S | – |
| 3 | **Dossier-fundament in de database** (migratieset M1-M5, donker geleverd; swarm-hartslag-tik in usePrefill.ts rijdt mee) | M | – |
| 4 | **Klantmappen in de database** (atad2_clients + RLS; nullable client_id op sessies en documenten; backfill na controle; log-kolommen; ?clientId= in de intake-insert; storage-policy voor het bibliotheekpad `{user}/clients/{client_id}/...`) | M | 2 (dedup-controle) |
| 5 | **De open-vragen-lus live** (hook, paneelvarianten, streaming onder AnalyzeProgress, Keep as unknown, export Word/tekst, klantantwoord + re-check, client_question-promptveld als laatste) | M | 3 |
| 6 | **Appendix-merge naar main** — wanneer Lennart de bijlage klaar verklaart; tot die tijd: main regelmatig de tak in voegen, fixes aan gedeelde bestanden dubbel zetten; alle regelankers herijken na de merge | M | Lennarts go |
| 7 | **De hub; de corridor verdwijnt** (DossierShell, DossierHub, guidance.ts, useDossierSnapshot, doorverwijzingen, bevestiging vouwt in Rapport, stepper/steps.ts/resumeUrl.ts weg) | L | 3, 6 |
| 8 | **Tussenstand + afdwingbare poort** (generate-report-functie interim-only; poort-UI; tien-regel-poortcheck in de n8n-report-functie; post-final-sloten vervangen door drift-labels; interim-template) | M/L | 3, 6, 7 |
| 9 | **Klantwerkruimte-UI** (klantenlijst, werkruimte-tabs, documentbibliotheek, "Generate questionnaire" = register-export, / redirect; daarna NOT NULL op client_id) | L | 4, 5, 7 |
| 10 | **Definitieve memo op de eigen motor + stuksgewijs bijwerken** (sectie- en update-prompts; FINAL_MEMO_VIA_EDGE; zij-aan-zij-validatie; n8n-pensioen; CLAUDE.md-bullet herschrijven) | L | 8 |
| 11 | **Jaar-op-jaar overzetten** (rollover-RPC naar admin_reset_session-model; twee-bakjes-bevestigscherm; documenten nooit gekopieerd, bibliotheek blijft staan; bijlage vers gegenereerd; rapport leeg) | M | 9 |

Plakken 1-5 raken de betwiste bestanden niet of nauwelijks en kunnen volledig
vóór de appendix-merge. De backfill-volgordes binnen 3 en 4 (nullable →
vullen → controleren → NOT NULL pas na plak 9) blijven zoals in §2 en het
fase-plan.

---

## 9. Risico's

1. **Regelnummer-drift na de appendix-merge**: alle ankers zijn hints, geen
   contracten; herijking is onderdeel van plak 6.
2. **Merge-zwaarte groeit met de tijd** nu de appendix-merge is uitgesteld.
   Rem: main regelmatig de tak in voegen; gedeelde-bestand-fixes dubbel
   zetten; zware schermplakken pas na de merge.
3. **Promptport-kwaliteit**: memo_sections_system v1 is een port van de live
   memo_system v3 naar JSON-secties; regressies waarschijnlijk bij de eerste
   poging. Rem: zij-aan-zij-validatie achter de vlag, n8n als
   één-commit-terugval, inwerkperiode vóór ontmanteling.
4. **Realtime-publicatie op de VM** staat buiten repo-migraties en kan voor
   (nieuwe) tabellen ontbreken. Rem: DO-blokken voor beide publicatievormen;
   UI degradeert naar refetch-bij-focus; per tabel verifiëren bij de
   fundament-deploy.
5. **Handmatige artefacten**: de twee Word-templates (open-vragenlijst en
   interim-memo) zijn handwerk in huisstijl. Rem: copy-as-text en de
   officiële-vraagtekst-terugval leveren hoe dan ook; een laat template
   blokkeert geen plak.
6. **Re-analyse zet user_action terug op 'pending'** op prefill-rijen
   (analyze.ts hardcodet dat), waardoor geaccepteerde suggesties opnieuw ter
   review verschijnen. Ontworpen als het gewenste review-moment; in de gaten
   houden na plak 5; herontwerp is een afgebakende vervolgstap.
7. **Afstelconstanten zijn schattingen** (2-minuten-hartslag,
   10-minuten-versheid, confidence ≥ 60 voor heropenen): benoemde constanten
   met commentaar; herzien na de eerste echte dossiers.
8. **Twee bestandsspiegels blijven** (bijlage-skelet; fingerprints-Deno-
   spiegel): sync-waarschuwingen erin; drift veroorzaakt te ruime
   hergeneratie (veilig maar verspillend).
9. **De n8n-webhook accepteert ontbrekende handtekeningen** en de URL is
   publiek. Vanaf plak 8 gedempt door de server-poortcheck en de
   service-role-only-insert; volledig opgelost door pensionering in plak 10.
   Tot plak 8 gedragen definitieve memo's zich exact als vandaag (aanvaarde,
   tijdgebonden status quo).
10. **Vóór plak 1 vernietigde documenten zijn definitief weg**; de bibliotheek
    werkt alleen vooruit.
11. **Adminpagina's blijven sessie-centrisch** tot een vervolgplak
    klantgroepering toevoegt; de admin-SELECT-policies uit plak 3 houden hun
    statussen intussen waarheidsgetrouw.
12. **De backfill kan naamvarianten fout groeperen** (Acme BV vs Acme B.V.):
    read-only-controle vooraf, Lennart keurt de lijst, varianten worden nooit
    automatisch samengevoegd.

---

## 10. Vastgelegde eigenaarsbeslissingen

1. **Appendix-merge**: pas wanneer Lennart de bijlage klaar verklaart (besluit
   2026-06-10); routekaart en drift-rem daarop ingericht.
2. **Klant-zichtbare teksten** (client_question-instructie, interim-mededeling,
   INTERIM-watermerkwoord): concepten zoals geschreven, terugvallen leveren
   hoe dan ook; definitieve woordkeus bij de betreffende plak ter goedkeuring.
3. **Twee Word-templates** in huisstijl nodig vóór plakken 5 en 8 (ongeveer
   één uur Word-werk; nooit blokkerend dankzij de terugvallen).
4. **Begeleidingsvolgorde**: uitkomst-bevestiging ná structuur en bijlage (hij
   poort alleen de definitieve memo); één-regel-wijziging in guidance.ts als
   het in de praktijk niet bevalt.
5. **Heropenen van bevestigde onbekenden**: AI vlagt (amber, met reden) maar
   wist nooit een bevestiging en herblokkeert nooit; alleen de adviseur die
   het antwoord bewerkt.
6. **n8n-inwerkperiode**: webhook aanroepbaar houden gedurende twee volledige
   engagements of een paar rustige weken (wat langer is), daarna ontmantelen.
7. **Het 'completed'-logevent** gaat af bij de eerste gereede definitieve memo
   in plaats van bij uitkomst-bevestiging; interim/final-generatie wordt
   sowieso apart gelogd.
