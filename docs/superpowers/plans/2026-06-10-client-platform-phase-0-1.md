# Implementatieplan — Klantplatform Fase 0 + 1

Status: ter goedkeuring. Hoort bij [REPLATFORM.md](../../../REPLATFORM.md) (secties 5 en 6).
Tak: `feat/client-platform`. Elke stap is los te leveren en te testen; de
bestaande 6-stappen-flow blijft de hele tijd werken.

Alle ankerpunten hieronder zijn geverifieerd in de code op 2026-06-10.

---

## Fase 0 — Stille fundering (geen schemawijziging)

### Stap 0.1 — Documenten niet meer weggooien bij memo-succes
**Het probleem:** na een geslaagde memo roept
[AssessmentReport.tsx:470-473](../../../src/pages/AssessmentReport.tsx#L470-L473)
`cleanupDocs.mutateAsync()` aan (hook `useCleanupDocuments` in
[usePrefill.ts:507-518](../../../src/hooks/usePrefill.ts#L507-L518)), die de
edge function `prefill-documents` met actie `cleanup` laat draaien en alle
documentregels van de sessie verwijdert.

**De fix (frontend-only, geen deploy naar de VM nodig):**
- Verwijder de cleanup-aanroep en de bijbehorende "Source documents deleted"-toast
  uit `AssessmentReport.tsx` (regels 470-473) en de import op regel 6 + hook op
  regel 79 als die nergens anders gebruikt worden.
- Laat de `cleanup`-actie in de edge function bestaan (handmatige opschoning
  blijft mogelijk via admin), maar niets roept hem meer automatisch aan.
- `useCleanupDocuments` in usePrefill.ts laten staan maar markeren als
  "manual/admin only" in een commentaarregel.

**Test:** memo genereren in een testsessie → documenten staan er na succes nog.

### Stap 0.2 — Dashboard N+1 wegwerken
**Het probleem:** `loadCompletedSessions()` in
[Index.tsx:60-131](../../../src/pages/Index.tsx#L60-L131) haalt eerst alle
sessies op en draait daarna PER SESSIE twee queries: een antwoorden-telling op
`atad2_answers` en een rapport-lookup op `atad2_reports`.

**De fix (frontend-only):** vervang de per-sessie-queries door twee gebundelde
queries over alle sessie-ids tegelijk:
1. `atad2_answers`: één `.select('session_id').in('session_id', ids)` en tel
   client-side per sessie (volumes zijn klein; honderden rijen max).
2. `atad2_reports`: één `.select('session_id, generated_at').in('session_id', ids).is('archived_at', null)`.

Van 1+2N queries naar 3. Een echte DB-view komt pas in Fase 1 (stap 1.6), als de
homepage per klant gaat groeperen; dan is er toch een migratie.

**Test:** dashboard toont identieke kaarten (antwoorden-aantal, memo-badge) en
laadt sneller bij >5 sessies.

### Stap 0.3 — Sectie-afhankelijkheidskaart + input-hash (pure code)
Nieuw bestand `src/lib/memo/sectionDependencies.ts` + test:
- De statische kaart: welke memo-sectie (Inleiding, Risico-uitkomst,
  Samenvatting, Algemene achtergrond, Technische beoordeling, Conclusie) hangt
  aan welke inputs (vraag-ids, sessievelden, documentcategorieën, structuur).
- Een `hashSectionInputs(...)`-helper (stabiele JSON-serialisatie + hash) die per
  sectie een vingerafdruk maakt. Zelfde patroon als de bestaande
  `appendix_facts_input_hash`-aanpak.
- Wordt pas in Fase 3 gebruikt, maar kan nu al los landen en getest worden.

### Stap 0.4 — Klant-dedup in kijk-modus
Een read-only SQL (geen migratie, draaien via `az vm run-command`):
```sql
SELECT user_id, lower(trim(taxpayer_name)) AS normalized, 
       array_agg(DISTINCT taxpayer_name) AS varianten,
       count(*) AS sessies, array_agg(fiscal_year ORDER BY fiscal_year) AS jaren
FROM atad2_sessions
GROUP BY user_id, lower(trim(taxpayer_name))
ORDER BY user_id, normalized;
```
Output ter controle aan Lennart voorleggen: dit wordt de klantenlijst van de
backfill in stap 1.2. Let op varianten als "Acme BV" vs "Acme B.V." (die worden
hiermee NIET samengevoegd; samenvoegen is later een handmatige actie).

---

## Fase 1 — Klanten en de klantomgeving

### Stap 1.1 — Migratie: `atad2_clients` + `client_id`-kolommen
Eén migratie `supabase/migrations/<ts>_client_platform_tables.sql`:
- `CREATE TABLE atad2_clients` (id uuid PK, user_id uuid NOT NULL, client_name
  text NOT NULL, client_code text, jurisdiction text, notes text, created_at,
  archived_at). RLS: eigenaar-only CRUD + admin/moderator SELECT, zelfde patroon
  als `atad2_session_documents`
  ([20260423100000, regels 96-126](../../../supabase/migrations/20260423100000_document_prefill_schema.sql)).
- `ALTER TABLE atad2_sessions ADD COLUMN client_id uuid REFERENCES atad2_clients(id)` (NULLABLE).
- `ALTER TABLE atad2_session_documents ADD COLUMN client_id uuid REFERENCES atad2_clients(id)` (NULLABLE)
  + RLS-policy uitbreiden zodat klant-documenten (zonder sessie) ook onder de
  eigenaar vallen. `session_id` wordt hiermee NULLABLE (klantbibliotheek-uploads
  hebben geen sessie).
- Indexen: `atad2_sessions(client_id)`, `atad2_session_documents(client_id)`.
- Draaien als `supabase_admin` via run-command (zie CLAUDE.md), daarna
  [types.ts](../../../src/integrations/supabase/types.ts) handmatig bijwerken
  (Row/Insert/Update voor `atad2_clients`, nieuwe kolommen op sessions/documents).

### Stap 1.2 — Backfill (aparte migratie, na controle van stap 0.4)
- INSERT één klant per goedgekeurd `(user_id, taxpayer_name)`-paar.
- UPDATE alle sessies: `client_id` zetten via de naam-match.
- UPDATE alle documentregels: `client_id` erven van hun sessie.
- Verificatie-queries in dezelfde migratie (RAISE als er wezen zijn).
- NOT NULL op `atad2_sessions.client_id` pas in een latere migratie, nadat 1.4
  live is en bevestigd is dat de enige aanmaakplek
  ([Assessment.tsx:625-637](../../../src/pages/Assessment.tsx#L625-L637)) de
  kolom altijd vult.

### Stap 1.3 — Routes + klantenlijst
- [App.tsx:68-108](../../../src/App.tsx#L68-L108): nieuwe routes onder AppLayout:
  `/clients` (lijst) en `/clients/:clientId` (werkruimte). `/` redirect naar
  `/clients`; de oude Index blijft tijdelijk bereikbaar op `/sessions` als
  vangnet.
- Nieuwe pagina `src/pages/clients/ClientList.tsx`: doorzoekbare kaartenlijst
  (client_name, aantal assessments, laatste jaar + uitkomst, open jaar) +
  "New client"-dialoog (naam verplicht, rest optioneel). UI-strings Engels.
- Data via één query op `atad2_clients` + één gegroepeerde sessie-samenvatting
  (de view uit stap 1.6).

### Stap 1.4 — Klantwerkruimte (de klantmap, REPLATFORM.md §5)
Nieuwe pagina `src/pages/clients/ClientWorkspace.tsx` met header (naam,
jurisdictie, "client since", laatste uitkomst) en twee vaste knoppen:
- **"Start assessment"** → navigeert naar `/assessment?clientId=...`;
  [Assessment.tsx](../../../src/pages/Assessment.tsx) leest de query-param,
  vult `taxpayer_name` voor (bewerkbaar), vraagt alleen het jaar, en voegt
  `client_id` toe aan de bestaande insert (regels 625-637). Dit is bevestigd de
  enige aanmaakplek.
- **"Generate questionnaire"** → knop staat er, opent in Fase 1 een
  "Coming soon"-kaart die uitlegt wat hij gaat doen. Aansluiting op de
  readiness-motor is Fase 3.

Tabs (elk een eigen component onder `src/components/clients/`):
- **Overview**: jaren-tijdlijn + kerngegevens-kaart (v1: naam/jurisdictie/notes
  uit `atad2_clients`) + recente activiteit (uit `atad2_assessment_log`,
  gefilterd op client).
- **Documents**: de bibliotheek. Lijst uit `atad2_session_documents WHERE
  client_id = ...` (zowel sessie-gebonden als losse uploads). Upload hergebruikt
  `useUploadDocument` ([usePrefill.ts:104-326](../../../src/hooks/usePrefill.ts#L104-L326))
  met een klant-variant: storage-pad `{user_id}/clients/{client_id}/{doc_uuid}.{ext}`.
  De bestaande bucket-policies controleren alleen het eerste pad-segment
  (user_id), dus dit werkt ZONDER storage-migratie. Download per bestand via
  signed URL; "Download all" als zip is een nice-to-have (v2).
- **Assessments**: de bestaande sessie-kaarten uit Index.tsx, gefilterd op deze
  klant, met de bestaande hervat-logica.
- **Questionnaires**: leeg-met-uitleg in Fase 1 (vult in Fase 3).
- **Structure**: toont het meest recente afgeronde structuurschema van deze
  klant (read-only snapshot_png + link naar de sessie). Een echt klant-niveau
  schema is Fase 2+.
- **Details**: bewerkbare klantvelden + de commerciële strook (per-jaar
  sold/revenue van de sessies, alleen-lezen opgeteld).

### Stap 1.5 — Audit-log klant-bewust maken
- Migratie: `client_id uuid` + `client_name text` op `atad2_assessment_log`;
  de log-trigger bijwerken zodat hij ze meeschrijft vanaf de sessie.
- [admin/Sessions.tsx](../../../src/pages/admin/Sessions.tsx): filter/kolom op
  klant toevoegen.

### Stap 1.6 — Sessie-samenvattings-view
Migratie: view `atad2_session_summaries` (security_invoker) die per sessie
antwoorden-aantal en memo-aanwezigheid levert, plus een variant gegroepeerd per
klant. ClientList (1.3) en de Assessments-tab (1.4) gebruiken deze view; de
batched queries uit stap 0.2 kunnen daarna weg.

---

## Volgorde en afhankelijkheden

```
0.1 (docs bewaren)     → direct, los
0.2 (N+1 fix)          → direct, los
0.3 (dependency map)   → direct, los
0.4 (dedup kijk-modus) → vóór 1.2, vereist PIM + run-command
1.1 (tabellen)         → na goedkeuring plan
1.2 (backfill)         → na 0.4-controle door Lennart + 1.1
1.3 (routes + lijst)   → na 1.1 (kan met lege lijst vóór 1.2 getest)
1.4 (werkruimte)       → na 1.3
1.5 (audit-log)        → na 1.2, parallel aan 1.4
1.6 (view)             → met 1.3 mee
NOT NULL op client_id  → laatste, na 1.4 in productie
```

## Expliciete afspraken
- UI-strings Engels, geen em-dashes.
- Frontend deployt alleen via GitHub Actions naar App Service; migraties via
  `az vm run-command` als `supabase_admin`; types.ts handmatig.
- Commit/push alleen op expliciet verzoek; main = productie.
- Geen wijziging aan de n8n-memoflow in deze fasen (memo-secties zijn Fase 3).
