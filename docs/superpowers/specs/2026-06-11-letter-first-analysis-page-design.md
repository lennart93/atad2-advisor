# Letter-first analysepagina

Status: door Lennart goedgekeurd op 2026-06-11 ("Precies dit", met twee
aanvullingen die hieronder verwerkt zijn). Vervangt de dialoog-plaatsing van de
briefcompositie uit plak 5c; bouwt op de live onderdelen van plakken 5/5b/5c.

## Doel

De analysepagina (waar de documenten zijn ingeladen) eindigt in de
samengestelde klantbrief. Tot dat eindbeeld klaar is verschijnt er NIETS
inhoudelijks: alleen elkaar afwisselende regels die beschrijven wat er op dat
moment echt gebeurt. De losse-vragen-stream verdwijnt volledig van deze pagina.

## De paginaflow

1. Documenten laden, "Run analysis" zoals nu.
2. Werkscherm: voortgangsbalk plus één wisselende regel tegelijk, gevoed door
   echte voortgang. Bronnen voor regels: documentcategorieën ("Reading the
   financial statements..."), tellers ("12 of 49 checks done", "3 client
   questions so far") en onderwerp-teasers uit de klantvraagtekst ("Found
   something for the client: whether the US picks up the interest income...").
   **Nooit vraagnummers of question-ids in beeld**: de gebruiker kent die niet;
   nummering bestaat pas in de brief.
3. Analyse klaar -> de pijplijn gaat automatisch door, met eigen regels:
   a. Ontbreekt voor open padvragen de klant-formulering (client_question
      leeg), dan draait eerst de formuleringsronde (de bestaande
      analyze_one-pool, concurrency 4) met regels als "Writing client
      questions...". De losse "Prepare client questions"-knop vervalt; dit is
      voortaan onderdeel van de pijplijn.
   b. Daarna de compositie (bestaande compose_client_letter-actie) met regels
      als "Merging shared context...", "Drafting your client letter...".
4. Eindbeeld: het briefblok (zie hieronder) vervangt het werkscherm.

## Het briefblok (vast paginadeel, geen dialoog)

Inhoudelijk exact de bestaande compositie-UI, verhuisd uit de dialoog:
- "We understand that:"-inleiding met de samengevoegde feiten.
- Genummerde vragen, per vraag een vinkje; uitvinken past alleen de brief aan
  (hernummert direct), de vraag blijft op de werklijst; inleiding wijzigt pas
  bij Regenerate.
- Regenerate-knop (hercomponeert met alleen de aangevinkte vragen; neemt ook
  nieuwe antwoorden/wegklikken uit het paneel mee).
- Eén "Copy letter"-knop: kopieert het geheel als platte tekst, zet de
  meegestuurde open vragen op taken_to_client (bestaand patroon) en logt het
  'copied'-event met detail {composed: true}.
- Regel "Based on the worklist as of <tijdstip>" onder het blok.

## Terugkomen en kosten

- De laatst gemaakte brief wordt lokaal bewaard (localStorage per session_id,
  met tijdstip). Terugkomen op de pagina toont hem direct, met Regenerate voor
  een verse versie.
- Automatisch componeren gebeurt ALLEEN: (a) op het moment dat de analyse
  klaarkomt, of (b) bij paginabezoek met afgeronde analyse en zonder bewaarde
  brief. Nooit stilletjes bij elk bezoek.

## Het zijpaneel wordt puur de antwoord-plek

Het paneel (en de sheet) is er enkel om de gegenereerde vragen af te handelen:
- Blijft: de gefilterde werklijst, per rij het antwoordveld ("What did the
  client say?"), Keep as unknown, Not relevant, Restore, Go to question,
  Re-check with AI, en de pad-toggle.
- Vervalt uit het paneel: "Copy as text", "Export to Word", de
  compose-dialoog en de "Prepare client questions"-knop. Versturen heeft een
  thuis: de brief op de analysepagina. (Het Word-export-codepad blijft
  bestaan voor later hergebruik vanaf de brief; alleen de paneelknoppen
  verdwijnen.)

## Randgevallen

- Nul open padvragen na analyse: vriendelijke melding "No client questions;
  the documents covered everything we needed" plus de bestaande
  volgende-stap-navigatie. Geen compositie-aanroep.
- Compositie of formuleringsronde mislukt: wisselregels stoppen, nette
  foutmelding met "Try again"; de analyse zelf is dan al afgerond en er gaat
  niets verloren. De soft-fail "not deployed yet" blijft bestaan.
- Vragen zonder klant-formulering na een mislukte formuleringsronde componeren
  mee via de bestaande terugval (officiele vraagtekst).

## Wat NIET verandert

Register, triggers, poort, events-vocabulaire, de edge-actie en de prompt
blijven zoals gedeployed; dit is een frontend-herschikking plus de
pijplijn-orkestratie. Geen migraties, geen VM-window nodig.
