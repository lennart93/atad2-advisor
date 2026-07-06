# Prompt voor Claude Code — Factsheet-pipeline (dossier-synthese) + swarm-upgrade

Jij bent Claude Code in de `atad2-advisor` repo. Implementeer onderstaande spec volledig, fase voor fase, met een stop na elke fase zodat Lennart kan reviewen en deployen. Lees eerst CLAUDE.md (deploy-conventies, VM-paden, prompt-flip-invariant) en verifieer elk schema-detail tegen de bestaande migraties voordat je SQL schrijft — deze spec bevat schetsen, geen kant-en-klare DDL.

---

## 0. Probleem (waarom dit nodig is)

De prefill-swarm vuurt één geïsoleerde single-shot call per questionnaire-vraag, elk met de volledige `documents_block`. Gevolgen, allemaal waargenomen op het WMC-dossier (juli 2026):

1. **Geen cross-document joins.** De swarm kan niet ontdekken dat TIN 8652 85 135 in het CbCR ("WMC Project Holding B.V.") en een VPB-aangifte ("Liminal Holding B.V.") dezelfde entiteit is; kan de naamloze "external lender" uit de jaarrekening niet identificeren via de grootboekkolom ("0630 Loan Societe Generale"); kan een facility-drawdown (70.444.475) niet matchen met een omzet-eliminatie (70.444.486) om on-lending van een trading flow te onderscheiden.
2. **Groepsconclusies dragen niet over tussen calls.** Swarm v15/v16/v17 (alle 2026-07-06) patchen symptomen hiervan; de wortel — geen gedeelde staat — blijft.
3. **Attributiefouten geconsolideerd vs enkelvoudig.** De client letter schreef de senior loans (Sun Life, bij Joshua Energy One DAC, Ierland) toe aan WMC Energy B.V. omdat note 13 in de geconsolideerde jaarrekening staat.
4. **Beantwoordbare vragen gaan toch naar de cliënt.** 2 van de 8 WMC-lettervragen (cost-plus SLA + 0,25%-fee; lender-identiteit) stonden in de docs. Eén onnodige cliëntvraag kost dagen.
5. **Output-budgetten knijpen kwaliteit**: `suggested_toelichting` ≤ 1000, `answer_rationale` ≤ 200 tekens.
6. **Negatives worden "unknown"** in plaats van gefundeerd "No" (bijv. objectvrijstelling overal nihil ⇒ geen buitenlandse v.i. geclaimd).

## 1. Doelarchitectuur

```
upload doc → client-extractie → classify-document
                              → extract-docfacts (NIEUW, per doc, parallel, Sonnet)
                                   ↓ atad2_document_facts (JSONB per doc)
alle docs klaar → build-factsheet (NIEUW, async status-patroon, Opus)
                                   ↓ atad2_session_factsheet (1 rij/sessie, versie++)
factsheet klaar → progressieve re-run: alleen prefills met user_action=pending
                  én (suggested_answer=unknown óf confidence<60)
swarm-call     → prefill-documents met {{FACT_SHEET}} vóór de raw docs (cache-prefix)
```

Latency-principe: **geen blokkerende stap aan de start.** De per-doc-extractie draait tijdens het uploaden (die seconden bestaan al); de merge is één korte call; de swarm vuurt op T0 exact zoals nu en de re-run haalt kwaliteit asynchroon in via de bestaande staleness/reopen-machinerie.

## 2. Factsheet JSON-schema (canoniek)

Definieer als zod-schema op één plek per runtime: `src/lib/factsheet/schema.ts` (frontend) en `supabase/functions/_shared/factsheetSchema.ts` of per-function kopie — volg het bestaande dual-maintenance-patroon (zoals `skeleton.ts` / `skeletonRows.ts`) met een "BEIDE BIJWERKEN"-comment in beide files.

```jsonc
{
  "entities": [{
    "canonical_name": "…", "aliases": ["…"], "tin": "…", "jurisdiction": "NL",
    "legal_form": "BV|Corp|LLC|DAC|Ltd|STAK|…",
    "role": "taxpayer|parent|subsidiary|related_other",
    "ownership": [{ "owner": "…", "pct": 42.34, "share_class": "ordinary|pref|…", "since": "2024-08-13" }],
    "nl_classification": "non-transparent|transparent|unknown",
    "foreign_classifications": [{ "country": "US", "classification": "disregarded|partnership|corporation|unknown",
      "basis": "CTB Form 8832 executed 2023 | per-se corporation | default …",
      "status": "confirmed|asserted|to_verify" }],
    "related_to_taxpayers": { "is_related": true, "basis": ">25% | 2:24b BW-groep (consolidatie/de facto control) | samenwerkende groep", "pct_indirect": 30.1 },
    "sources": [{ "doc_label": "…", "loc": "p. 21" }]
  }],
  "financing": {
    "external": [{ "borrower": "…", "lender": "…", "lender_identified_via": "ledger|note|return",
      "amount": 70500000, "ccy": "USD", "rate": "7.94%", "maturity": "2025",
      "security": "…", "unusual_terms": "lender absorbs losses > USD 50k", "sources": [ … ] }],
    "intercompany": [{ "lender": "…", "borrower": "…", "amount": …, "ccy": "…", "rate": "5.95%",
      "maturity": "2032", "interest_paid_fy": 151249, "sources": [ … ] }]
  },
  "flows": [{ "payer": "…", "payee": "…", "type": "interest|service_fee|recharge|dividend|lease|royalty",
    "amount": 1906863, "ccy": "USD", "fy": "2024",
    "cross_border": true, "deductible_nl": true,
    "included_at_recipient": { "value": "yes|no|unknown|n_a", "basis": "US C-corp, 2024 tax USD 61,667 on PBT 129,337" },
    "sources": [ … ] }],
  "elections": [{ "entity": "…", "regime": "US CTB", "target": "disregarded|partnership",
    "status": "executed|announced|to_verify", "effective_date": null, "sources": [ … ] }],
  "pe_and_residence": {
    "foreign_pes": [], "vat_registrations": [{ "entity": "…", "country": "SE", "purpose": "commodity trading" }],
    "dual_residence_indications": [],
    "negatives": [{ "claim": "no foreign PE claimed by any taxpayer",
      "evidence": [{ "doc_label": "VPB 2024 <entity>", "loc": "item 12d = 0" }] }]
  },
  "instruments_transfers": { "repos_seclending": [], "commodity_forwards_note": "…" },
  "inconsistencies": [{ "description": "SBIE sheet allocates full NL payroll to 'permanent establishments' while no PE exists anywhere",
    "docs": ["CbCR workbook"], "severity": "verify_before_final" }],
  "open_points": [{ "question": "…", "why_docs_cannot_answer": "foreign-side tax treatment | negative confirmation",
    "suggested_addressee": "client|us_adviser|cbcr_preparer" }]
}
```

Harde eisen aan de merge: (a) entity-dedup op TIN én naam-alias; (b) élke flow heeft een richting (payer→payee) en een `included_at_recipient`-oordeel; (c) schulden/leningen horen bij de **lenende entiteit**, nooit bij de consoliderende moeder; (d) negatives alléén met bewijsplaats per document; (e) `inconsistencies` en `open_points` zijn verplichte outputs (mogen leeg zijn, maar het veld moet er zijn).

## 3. Fase 1 — database (migraties, uitvoeren als `supabase_admin`)

1. **`atad2_document_facts`**: `id uuid pk default gen_random_uuid()`, `session_id uuid not null`, `document_id uuid not null references atad2_session_documents unique`, `facts jsonb`, `status text check in ('pending','complete','error') default 'pending'`, `error text`, `model text`, `prompt_version int`, `created_at/updated_at`. RLS: sessie-eigenaar, kopieer het policy-patroon van `atad2_answers` letterlijk (zoek de bestaande policy-migratie op).
2. **`atad2_session_factsheet`**: `session_id uuid pk`, `factsheet jsonb`, `version int not null default 0`, `generation_status text check in ('idle','generating','complete','error') default 'idle'`, `error text`, `source_document_ids uuid[]`, `model text`, `prompt_version int`, `built_at timestamptz`. Zelfde RLS; schrijven alleen via service role (patroon `atad2_appendix`).
3. **CHECK-verruiming `atad2_question_prefills`**: `suggested_toelichting` en `suggested_toelichting_unknown` 1000 → 4000; `answer_rationale` 200 → 300. Zoek de bestaande constraint-namen op in de migraties (niet gokken) en gebruik `ALTER TABLE … DROP CONSTRAINT …, ADD CONSTRAINT …`. **Koppelverkoop**: update in dezelfde PR de frontend-clamps (`clampToelichting`/`clampRationale` in `src/lib/openQuestions/worklist.ts` + tests) en de `truncate(...)`-limieten in `supabase/functions/prefill-documents/analyze.ts`. `client_question` blijft 450.
4. **Nieuwe kolommen `atad2_question_prefills`**: `factsheet_version int null` (welke factsheet-versie de draft gebruikte; observability + re-run-selectie) en `evidence jsonb null` (array van `{doc_label, loc, quote}`). Controleer dat de trigger `sync_open_questions_from_prefill` deze kolommen negeert.
5. **Prompt-seeds** in `atad2_prompts` (nieuwe keys, `is_active=true`, single-active-invariant respecteren):
   - `docfacts_extract_system` v1 — model `claude-sonnet-*` (recentste beschikbare), temperature 0. Taak: extraheer uit ÉÉN document alle entiteiten (naam+TIN+vorm+jurisdictie), eigendomspercentages, leningen (crediteur/debiteur/bedrag/rente/looptijd/zekerheden), betaalstromen mét richting en bedrag, elections, v.i.-/woonplaats-/repo-indicaties én expliciete negatives ("dit document toont X = nihil"), als JSON conform §2-subset, elk feit met `loc` (pagina/note/tab). Geen juridische kwalificatie — alleen feiten. Onbekend = weglaten, nooit raden.
   - `factsheet_merge_system` v1 — model Opus, temperature 0. Taak: merge N per-doc extracties tot één factsheet conform §2, mét de joins (TIN-dedup, ledger↔note-identificatie, drawdown↔omzet-matching), `inconsistencies` en `open_points`. Input is compacte JSON, geen ruwe docs.
6. **`types.ts`**: handmatig bijwerken (`src/integrations/supabase/types.ts`) voor beide tabellen + nieuwe kolommen — er is geen gelinkte CLI (CLAUDE.md-conventie).

**Checkpoint fase 1**: migraties lokaal syntactisch gecheckt; Lennart deployt via `az vm run-command` (psql als `supabase_admin`, `ON_ERROR_STOP=1`).

## 4. Fase 2 — edge functions

1. **`extract-docfacts` (nieuw)**: request `{ session_id, document_id, doc_text?, doc_label, category }`. Zelfde auth/CORS-boilerplate als `prefill-documents`. Voor tekst-docs stuurt de client de geëxtraheerde tekst mee (zelfde bron als `buildDocumentsBlock`); voor raw-PDF/afbeeldingen hergebruik je `fetchPdfBlocks`/`fetchImageBlocks` uit `prefill-documents` (verplaats naar een gedeelde helper of kopieer met BEIDE-BIJWERKEN-comment). Eén model-call, zod-validatie (`safeParse`, bij failure status `error` + ruwe output in `error`), upsert in `atad2_document_facts`. Idempotent per `document_id`.
2. **`build-factsheet` (nieuw)**: async status-patroon 1-op-1 gekopieerd van `generate-appendix` (`generation_status`, service-role writes, snelle 202-response, client pollt). Laadt alle `atad2_document_facts` van de sessie (weiger te starten zolang er `pending` rijen zijn jonger dan 2 min; oudere pending = negeren met warning in de factsheet `inconsistencies`), draait één merge-call, valideert met zod, schrijft `factsheet`, `version = version + 1`, `source_document_ids`, `built_at`. Volledige rebuild per run (geen incremental merge in v1).
3. **`prefill-documents` (update)**: accepteer optioneel `factsheet_block: string` + `factsheet_version: number` in de request. Injecteer als apart tekstblok **vóór** de documents-prefix (dus binnen de cache-prefix), onder een kop `## Verified group fact sheet (cross-document, pre-analysed)`. **Vul de placeholder met "" als hij ontbreekt** — de function moet live kunnen vóór prompt v18 actief wordt (zelfde les als memo-prompt v4: eerst de vuller, dan de prompt, nooit een lege placeholder in productie). Schrijf `factsheet_version` en `evidence` mee naar de prefill-rij.
4. **Re-run-veiligheid** (client-side gehandhaafd, maar documenteer het in de function-comment): re-runs overschrijven uitsluitend rijen met `user_action = 'pending'`. Rijen die de adviseur heeft geaccepteerd/dismissed of via de documents-worklist heeft geresolved blijven onaangeroerd; contradicties op recorded answers lopen via het bestaande reopen-mechanisme (≥60) en dat is gewenst gedrag.

**Checkpoint fase 2**: deploy-volgorde expliciet in de PR-beschrijving: rsync naar `/root/supabase-docker/volumes/functions/` (DASH-pad!), container-restart, md5-verificatie binnen de container (CLAUDE.md-ritueel). Functions eerst, prompts pas in fase 4.

## 5. Fase 3 — frontend

1. **`useDocFactsPrewarm`**: vuurt `extract-docfacts` per document zodra extractie+classificatie van dát document klaar is (parallel, zelfde fan-out-stijl als de swarm-orchestratie in `usePrefill.ts`). Fouten stil loggen, niet blokkeren.
2. **`useFactsheetPrewarm`**: start `build-factsheet` zodra alle docs facts hebben (of bij binnenkomst op de documents-step als fallback), pollt `generation_status` (patroon `useAppendixPrewarm`).
3. **Progressieve re-run**: wanneer `generation_status = 'complete'` en `version` > hoogste `factsheet_version` op de prefills: selecteer prefills met `user_action='pending'` én (`suggested_answer='unknown'` óf `confidence_pct < 60`), her-vuur `prefill-documents` per node mét factsheet-block. Cap op bijv. 40 nodes per run. Toon een stille voortgangsindicator ("Herbeoordelen met dossieroverzicht… 12/18").
4. **Factsheet-paneel** (minimaal, documents-step): status-chip + uitklapbaar leesbaar overzicht (entiteiten-tabel met aliases/TIN, financiering, stromen, negatives, inconsistenties, open punten) + "Rebuild"-knop. Volg de bestaande stille UI-taal (hover-revealed, geen zware kleuren; status-kleuren uit de bestaande vocabulaire). Géén edit-functionaliteit in v1.
5. **Nieuwe documenten na een eerdere run**: upload → `extract-docfacts` → factsheet is stale (toon chip "Factsheet verouderd — rebuild") → rebuild → re-run-selectie zoals hierboven. Niets automatisch destructiefs.
6. Update de worklist-clamps + tests (zie fase 1.3).

**Checkpoint fase 3**: `npm run build` + bestaande tests groen + nieuwe unit tests voor schema-validatie, re-run-selectielogica (pure functie!) en clamps.

## 6. Fase 4 — prompts (migraties, REPLACE-op-live-rij-techniek van v17 met anker + DO-block RAISE)

1. **`prefill_swarm_system` v18**, afgeleid van v17. Toevoegingen:
   - **FACT SHEET PRIMACY**: als het factsheet-blok aanwezig is, is dát de primaire feitenbron (cross-document geverifieerd); raw documents zijn secundair bewijs. Neem bronverwijzingen (`doc_label` + `loc`) uit de factsheet over in `evidence`.
   - **EVIDENCE-BASED NEGATIVES**: een "No" is verplicht (niet "unknown") wanneer de documenten het negatief aantonen — bijv. objectvrijstelling/v.i.-boxen nihil in álle aangiften, geen repo-posten, geen buitenlands adres — mits met bewijsplaats per claim in `evidence`. "Unknown" is gereserveerd voor feiten die documenten naar hun aard niet kunnen aantonen (buitenlandse fiscale behandeling bij de tegenpartij, toekomstige intenties) en voor échte tegenstrijdigheid; benoem dan in `client_question` wat de cliënt/US-adviseur moet bevestigen.
   - **Harde beslisregels** (vast blok):
     - Een naar Amerikaans statelijk recht opgerichte Inc./Corp. is een per-se corporation en kan géén check-the-box election doen.
     - Een single-member LLC is bij default disregarded; multi-member default partnership; alleen een expliciete corporate election maakt hem opaque. Status zonder bewijs = `to_verify`, nooit aangenomen.
     - Winstuitdelingen door een NL-lichaam zijn niet aftrekbaar en dus nooit zelfstandig een D/NI-betaling.
     - Geconsolideerd ≠ enkelvoudig: schrijf schulden en rentelasten toe aan de lenende entiteit volgens de factsheet, nooit aan de consoliderende moeder.
     - Gelieerdheid omvat naast ≥25% ook de 2:24b BW-groep (consolidatie, inclusief de facto control zónder aandelenbezit) en de samenwerkende groep.
     - Binnenlandse stroom naar een hybride ontvanger: als betaler- en ontvangerstaat beide NL zijn en het inkomen volledig in de NL-grondslag zit, is er geen toerekeningsmismatch (v17-richtingcheck blijft onverkort gelden).
   - Richting-check (v17), jurisdictional sanity (v14) en multi-entity/group framing (v15/v16) blijven staan.
   - Budgetinstructie aangepast: toelichting tot 4000 tekens, volledige zinnen, bedragen en tegenpartijen bij naam.
2. **Flip-volgorde**: v17 demoten → v18 activeren, pas nádat de fase-2-function met placeholder-vulling live staat op de VM.
3. **Optioneel (aparte beslissing Lennart, niet in v1)**: factsheet ook injecteren in `compose_client_letter`, `appendix_system` en de n8n-memo-payload. Documenteer als follow-up in CLAUDE.md; raak n8n in deze PR niet aan.

## 7. Fase 5 — evals en regressie (WMC-dossier als fixture)

Bouw een eval-script (patroon: bestaande tests in `src/lib/**/__tests__`, plus een handmatige checklist in `docs/`) dat op het WMC-dossier de volgende asserties controleert:

1. Factsheet dedupliceert WMC Project Holding B.V. ↔ Liminal Holding B.V. via TIN 8652 85 135 (aliases gevuld).
2. Senior loans (USD 37,5m, Sun Life, 4–5%, 2027) staan bij Joshua Energy One DAC — níet bij WMC Energy B.V. of Helios I B.V.
3. Helios-facility: lender "Société Générale" geïdentificeerd via grootboek, USD 70,5m, 7,94%; `unusual_terms` bevat de verliesabsorptie > USD 50k.
4. Flows bevatten cost-plus recharge USD 1.906.863 én 0,25%-fee USD 30.154, richting NL→US, `included_at_recipient = yes` met US-taxbewijs.
5. Elections: Global Services executed 2023; WMC Energy B.V. `to_verify`; Partners Holding `to_verify`.
6. Negatives mét bewijs: geen buitenlandse v.i. (objectvrijstelling nihil per aangifte), geen repos, geen dual residence, geen dividend 2024.
7. Inconsistencies bevat de SBIE-payroll-naar-v.i.-allocatie uit het CbCR-werkboek.
8. Joshua gemarkeerd als gelieerd via consolidatie/de facto control ondanks 0% aandelen.
9. De prefill voor de "payments to associated enterprises"-node noemt de cross-border fees (niet alleen domestic).
10. 4b-type nodes: "No" met pick-up-redenering (v17-regressie blijft groen).
11. Back-to-back-node onderscheidt de facility-drawdown→inventory-aankoop als trading flow.
12. De open-questions letter voor WMC krimpt: de lender-identiteit- en Corp-fee-vragen verdwijnen; wat overblijft zijn buitenlandse-behandeling-confirmaties en negative confirmations.

## 8. Conventies en randvoorwaarden (niet onderhandelbaar, zie CLAUDE.md)

- Migraties draaien als `supabase_admin`; edge deploys naar het DASH-pad met md5-verificatie in de container; geen Supabase CLI; PIM-vensters verlopen — alle scripts idempotent.
- Prompt-flips: single-active-invariant, demote eerst; REPLACE-op-live-rij met ankers + DO-block RAISE (v17-techniek) zodat VM-tuning behouden blijft.
- Placeholder-regel: de code die een placeholder vult gaat ALTIJD eerder live dan de prompt die hem verwacht.
- Dual-maintenance-files krijgen in beide kopieën een verwijzende comment; noem ze expliciet in de PR-beschrijving.
- `types.ts` handmatig bijwerken.
- Werk CLAUDE.md bij met een sectie "Factsheet-pipeline (feature)" inclusief de NOG-TE-DEPLOYEN-volgorde, zoals bij de technische bijlage.
- Alle nieuwe prompts dragen "DRAFT, pending tax review" in hun `notes` totdat Lennart de juridische beslisregels heeft afgetekend.

## 9. Expliciete non-goals (v1)

Geen RAG/embedding-wijzigingen; geen compose_client_letter-wijziging; geen n8n-/memo-template-wijziging; geen factsheet-editing door de adviseur; geen wijziging aan de open-questions-registertriggers; geen UI-redesign van de documents-step buiten het paneel en de voortgangsindicator.

## 10. Volgorde van werken voor jou (Claude Code)

1. Lees: CLAUDE.md; `src/hooks/usePrefill.ts`; `src/lib/prefill/*` (m.n. `buildDocumentsBlock.ts`, `types.ts`); `supabase/functions/prefill-documents/*`; `supabase/functions/generate-appendix/index.ts` (async-patroon); migraties `*swarm_prompt_v15/16/17*`, `*appendix*`, en de RLS-migraties van `atad2_answers`/`atad2_appendix`; `src/lib/openQuestions/worklist.ts`.
2. Fase 1 → stop → review. Fase 2 → stop → review. Enzovoort.
3. Per fase: PR-beschrijving met deploy-stappen in CLAUDE.md-stijl (script-file voor `az vm run-command`, verificatiecommando's, rollback).
4. Bij elke aanname die je moet doen omdat de spec en de code verschillen: kies conform bestaande patronen in de repo en noteer de keuze expliciet in de PR-beschrijving.
