# CLAUDE.md — ATAD2 Advisor Project

## Over dit project
Dit is de ATAD2 Advisor applicatie van Lennart Wilming (Manager, Svalner Atlas Advisors, Amsterdam). Het is een tool voor het uitvoeren van ATAD2 compliance assessments voor belastingadvisering.

De repo is: https://github.com/lennart93/atad2-advisor

## Azure infrastructuur
- **Subscription**: `adn-atad2-prod` (ID: 791c975c-25ca-4727-9ceb-cc0acecc2626)
- **Resource group**: `rg-atad2-prod`
- **App Service**: `app-atad2-prod` (https://app-atad2-prod.azurewebsites.net)
  - Runtime: Node 22 LTS, Linux
  - Plan: Premium V3 (P0v3)
  - Startup Command: `pm2 serve /home/site/wwwroot --no-daemon --spa`
  - Deployment: GitHub Actions via `lennart93/atad2-advisor`
- **Virtual Machine**: `adn-x-s-5` (Ubuntu 24.04, 135.225.104.142, Sweden Central)
  - Friendly naam in documentatie: ATAD2; Azure-resource-naam = `adn-x-s-5`
  - Self-hosted Supabase (14 Docker containers, draaien onder root)
  - n8n workflow engine
  - SSH vanaf buiten geblokkeerd; gebruik `az vm run-command invoke --command-id RunShellScript` voor remote uitvoering (zie sectie Deployment naar self-hosted Supabase)
- **DNS**: api.atad2.tax, n8n.atad2.tax → VM IP (IONOS)
- **SSL**: Let's Encrypt certs via nginx op de VM

## Self-hosted Supabase (op VM)
- **API URL**: https://api.atad2.tax (nginx reverse proxy → localhost:8000)
- **Studio**: http://135.225.104.142:3000
- **Anon Key**: eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE2NDE3NjkyMDAsICJleHAiOiAxNzk5NTM1NjAwfQ.rnsxsFRAvsoKzOta2QUNb7D_nzd4erNRN4WyqBw99UY
- **Database**: Alle data gemigreerd vanuit cloud Supabase, inclusief 3497 vector embeddings

## n8n (op VM)
- **URL**: https://n8n.atad2.tax
- **Webhook**: https://n8n.atad2.tax/webhook/atad2/generate-report
- **Credentials**: Supabase API, Azure OpenAI, Anthropic Chat Model

## Deployment
- GitHub Actions workflow (`.github/workflows/deploy.yml`)
- Bij push naar main: checkout → override URLs → npm build → clean wwwroot → deploy via azure/webapps-deploy
- De workflow overschrijft `client.ts` en n8n URLs voor self-hosted configuratie
- **BELANGRIJK**: De startup command in Azure moet `pm2 serve /home/site/wwwroot --no-daemon --spa` zijn (NIET wwwroot/dist)

## Tech stack
- Frontend: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Supabase (self-hosted op Azure VM)
- AI: n8n workflows met Azure OpenAI + Anthropic
- Database: PostgreSQL met pgvector (v0.8.0)
- Auth: Supabase Auth met Resend SMTP (OTP-only)

## Lokaal draaien
```bash
npm install
npm run dev
```

## Belangrijke paden op de VM
Run-command voert uit als `root`, dus paden zijn absoluut vanaf `/root/`.
```
/root/supabase-docker/                              # ACTIEVE compose root (let op: DASH, geen slash)
/root/supabase-docker/volumes/functions/<name>/     # ACTIEVE edge function code (BIND-mount in supabase-edge-functions)
/root/supabase/docker/volumes/functions/            # SHADOW-folder — bestaat maar wordt nergens gemount. NIET hier deployen.
/home/azureuser/supabase/docker/volumes/functions/  # Andere oude variant — ook NIET gebruiken
/root/atad2-advisor/                                # App source (gebruikt voor migraties + edge function rsync)
/etc/nginx/sites-available/                         # Nginx configs voor api + n8n
```
**LET OP**: de mount-source van `supabase-edge-functions` is `/root/supabase-docker/volumes/functions` (dash, geen slash). Verifieer altijd met `docker inspect supabase-edge-functions --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'` voor je rsync. Een eerdere fout-deploy in deze repo synct naar `/root/supabase/docker/...` (slash) — dat is een SHADOW-folder die door niets wordt gelezen.

## Deployment naar self-hosted Supabase
Geen Supabase CLI tegen de VM — alles gaat via `az vm run-command` (run-command voert uit als root).

**`az`-toegang (LEES DIT EERST, voorkomt veel gedoe)** — alles hieronder hangt op de Azure CLI:
1. **PIM**: Lennart activeert zijn PIM-rol (VM-rechten) vóór elke VM-actie. Een venster verloopt na ~10-15 min. Bij `AuthorizationFailed` op `virtualMachines/read`, `runCommand/action` of `operations/read` (ook midden in een call): PIM opnieuw laten activeren en het commando nog eens draaien — alle deploy-scripts hier zijn idempotent.
2. **`az` valt soms uit het PATH van de Claude-omgeving** (geen normale install op de machine). Er staat een werkende, uitgepakte kopie klaar — roep die met het VOLLEDIGE pad aan:
   - `C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`
   - PowerShell: `& "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke ...`
   - Lennart is al ingelogd (tokens in `%USERPROFILE%\.azure`), dus géén `az login` nodig.
3. **Is die map weg?** Pak de CLI opnieuw uit ZONDER admin (een gewone winget/MSI-install vereist UAC en lukt niet vanuit de tool; de `/a` administratieve uitpak wél):
   ```powershell
   Invoke-WebRequest 'https://azcliprod.blob.core.windows.net/msi/azure-cli-2.87.0-x64.msi' -OutFile $env:TEMP\azcli.msi -UseBasicParsing
   Start-Process msiexec.exe -ArgumentList '/a',"$env:TEMP\azcli.msi",'/qn','TARGETDIR=C:\Users\adn356\az-extracted' -Wait
   # az.cmd staat daarna op C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd
   ```
4. Run-command vanaf Windows met spaties in paden: gebruik `--scripts "@<absoluut pad>"` en `--query "value[0].message" -o tsv`. SSH naar de VM is dicht (poort 22), dus run-command is de enige remote-route.

**DB-migraties** — tabellen zijn eigendom van `supabase_admin`, NIET `postgres`:
```bash
docker exec -i $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/<file>.sql
```
ALTER TABLE / INSERT into atad2_prompts faalt met "must be owner of table ..." als je `-U postgres` gebruikt.

**Edge functions** — sync de map en herstart de container. Gebruik de DASH-path (`supabase-docker`), niet de slash-path:
```bash
rsync -av --delete /root/atad2-advisor/supabase/functions/<name>/ \
  /root/supabase-docker/volumes/functions/<name>/
docker restart $(docker ps --filter name=supabase-edge-functions -q)
```
Controleer altijd na deploy dat het écht binnen de container is geland:
```bash
md5sum /root/atad2-advisor/supabase/functions/<name>/analyze.ts
docker exec supabase-edge-functions md5sum /home/deno/functions/<name>/analyze.ts
# beide moeten gelijk zijn
```

**Hele flow vanaf je workstation (Windows, Powershell of bash):**
```bash
# 1. Schrijf je shell-commands naar een file (quoting via --scripts inline breekt op Windows)
# 2. Voer uit op de VM:
az vm run-command invoke \
  --resource-group rg-atad2-prod --name adn-x-s-5 \
  --command-id RunShellScript --scripts @deploy.sh \
  --query "value[0].message" -o tsv
```

**Generated types-bestand** ([src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)) wordt handmatig bijgehouden omdat er geen Supabase CLI gelinkt is aan de self-hosted instance. Bij DB-schema-wijzigingen: voeg de nieuwe kolom handmatig toe in Row/Insert/Update interfaces voor de betreffende tabel.

## Technische bijlage (feature)
Artikelsgewijze ATAD2-checklist (art. 2 + 12aa t/m 12ag Wet Vpb) als aparte stap **ná Confirmation, vóór Structure**. Vast rechtskader (hard-coded skelet); de AI vult per rij beslissing + reden + referentie. De referentie is intern en valt weg in de export. Ontwerp: [docs/superpowers/specs/2026-06-07-atad2-technical-appendix-design.md](docs/superpowers/specs/2026-06-07-atad2-technical-appendix-design.md); skelet + prompt: [docs/technische-bijlage-v1-skelet.md](docs/technische-bijlage-v1-skelet.md).

- **Tabellen**: `atad2_appendix` (1 rij per sessie, `rows` als JSONB, losse `review_status` + `generation_status`) en `atad2_appendix_edits` (append-only wijzigingslog). RLS = sessie-eigenaar, net als `atad2_answers`. Migraties: `supabase/migrations/20260607174300_appendix_tables.sql` + `..._appendix_prompt_v1.sql` + `..._appendix_prompt_wording.sql` (alle toegepast op de VM).
- **Prompt**: key `appendix_system` in `atad2_prompts` (JSON-output, gevuld per sectie).
- **Edge function**: `supabase/functions/generate-appendix/` — async met `generation_status`, **swarm** (parallelle Claude-call per sectie voor snelheid), schrijft via service role, bewaart handmatige edits bij hergenereren.
- **Skelet staat DUBBEL**: `src/lib/appendix/skeleton.ts` (frontend) en `supabase/functions/generate-appendix/skeletonRows.ts` (Deno). Bij elke wijziging BEIDE bijwerken.
- **Status-vocabulaire (4 waarden, overal gelijk)**: `Not triggered` (groen vinkje), `N/A` (gedempt groen, gegrond), `Triggered` (amber, een mismatch vuurt echt), `Insufficient information` → label "Insufficient info" (amber outline). Eén set op het scherm (`AppendixTable`), in de Word-memo (`memoAppendices`) én in de print/export (`printAppendix`); labels + kleuren komen uit `src/lib/appendix/status.ts` (`statusDisplayLabel` + `statusPrintColor`). GEEN per-sectie tellingen meer, GEEN rood/blauw. De "Edit reasoning"-knop is hover-revealed en stil.
- **N/A toewijzing = prompt + deterministische backstop**: appendix-prompt **v4** (`..._appendix_prompt_v4.sql`) laat het model `N/A` zetten voor (a) een bevredigde scope/definitie-gate en (b) een moot-rij stroomafwaarts van een afwezige trigger. `mootNaRowIds` dwingt dat daarna deterministisch af in de edge function (na de swarm, vóór de merge van advisor-edits). **Mootness staat DUBBEL**: `src/lib/appendix/mootness.ts` (canoniek + tests) en `supabase/functions/generate-appendix/mootness.ts` (Deno). De rij-afhankelijkheden zijn DRAFT, pending tax review (zoals `conditionPolarity`).
- **NOG TE DEPLOYEN (niet auto-gedeployd)**: (1) `..._appendix_skeleton_v4_na_state.sql` → `allowed_states` += `N/A` (eerst, anders coerced de edge function `N/A` terug naar `Insufficient information`); (2) `..._appendix_prompt_v4.sql` → `appendix_system` v4; (3) edge function `generate-appendix` opnieuw uitrollen (nieuwe `mootness.ts` + `index.ts` + `skeletonRows.ts`); (4) frontend via Azure App Service. Bestaande dossiers pakken de nieuwe statussen pas op na een regenerate.
- **Bronnenpaneel per conditierij (handoff condition-footer-source-edit, 2 jul 2026)**: de footer onder een uitgeklapte Part B-rij heeft nu een Source-chip die een bronnenpaneel opent (tags On file / Missing / Derived / Internal), een zichtbare "Edit reasoning"-knop (inline bewerken met terracotta focusring, actief = sage "Done", commit op Done of blur) en een echte Visible/Hidden-toggle (label + oog-icoon + track wisselen mee). Paneelinhoud: `src/lib/appendix/sources.ts` (`buildSourcePanelRows`); Derived-rijen komen CLIENT-SIDE uit de mootness-set (volgen dus advisor-statuswijzigingen), Internal = de ruwe provenance-trail. AI-benoemde bronnen per rij = nieuw optioneel `sources`-veld op `AppendixRow` (JSONB, geen DB-migratie): prompt **v5** (`..._appendix_prompt_v5_sources.sql`, on_file gegrond op `{{DOCUMENTS_LIST}}` metadata, missing verplicht bij "Insufficient information") + edge function (`schemas.ts` sources, `sanitizeSources`, `loadDocumentsList`). **NOG TE DEPLOYEN, in deze volgorde**: (1) edge function `generate-appendix` (schema + placeholder eerst), (2) prompt v5-migratie, (3) frontend via Azure App Service. Oude dossiers tonen tot een regenerate alleen Derived/Internal-rijen in het paneel.
- **Prewarm**: de upload- en vragenpagina's starten de generatie via `useAppendixPrewarm` zodra de structure chart fase A klaar is, zodat de bijlage meestal al klaar is bij aankomst. De Structure-stap hersynct alleen het entity register.
- **TOEGEPAST (2026-06-13)**: memo-prompt v4 (`..._memo_prompt_v4_appendix_block.sql`, placeholder `{{CONFIRMED_APPENDIX_BLOCK}}`) is nu actief op de VM (gebouwd uit v3, de toen actieve versie), EN de n8n-node "Build prompt + metrics" vult die placeholder met `confirmed_appendix` uit de payload (of "" als die ontbreekt). Beide samen toegepast (node eerst, daarna de prompt) zodat er nooit een lege placeholder in een memo komt. Revert: heractiveer v3 in `atad2_prompts` en verwijder de twee `confirmed_appendix`-regels uit de node-jsCode.
- **Bijlagen in de Word-memo**: bijlage 1 (feiten) + bijlage 2 (voorwaarden) worden client-side als echte Word-tabellen opgebouwd (`src/lib/appendix/docx/memoAppendices.ts`) en via de raw-XML placeholder `{{@appendicesXml}}` in het sjabloon gezet. Download-opties: per-bijlage vinkjes (standaard aan). Genereren wordt geblokkeerd als de bijlage niet bevestigd/in sync is (`src/lib/appendix/memoSyncGuard.ts`).
  - **Sjabloon zonder eigen `<w:sectPr>`** (vanaf 2026-06-14): de generator levert ZELF de sectie-eigenschappen (body = decimaal, bijlage = aparte sectie met lower-roman pagina's herstart op i). `buildMemoAppendicesXml` geeft daarom ALTIJD een slot met een `<w:sectPr>` terug en moet altijd aangeroepen worden, ook zonder bijlage. Daardoor staat dit sjabloon op een **NIEUWE Storage-key `memo_atad2_with_structure_placeholder_v2.docx`** (de default `templatePath` in `DownloadMemoButton`); de oude v1-key blijft staan zodat de nu-gedeployde (oude) frontend niet breekt. **Bij deploy: frontend mee + v2-key houden.** Marges 2 cm, fixed-layout DXA-tabellen, status-badges, `cantSplit`, footer `SECTIONPAGES`, hi-res chart (pixelRatio 3) op contentbreedte, en suffix-normalisatie via `src/lib/legalName.ts`. `scripts/patch-memo-template.cjs` (download v1 → patch → repo) + `scripts/upload-memo-template.cjs` (repo → v2-key) houden het in sync.
- **Antwoord-grounding (16 jul 2026, working tree)**: dossiers met questionnaire-uitkomst "No risk identified" kregen toch "Insufficient information" op o.a. rij 3.7/6.2/6.3, omdat de Part B-swarm de antwoorden zag als kaal `Q19 answer: No` (zonder vraagtekst) en `drivenByQuestionIds` uit de skeleton-JSON werd gestript; het model kon een expliciet "No" dus niet aan zijn rij koppelen. Fix: edge function `generate-appendix` stuurt nu de volledige vraagtekst mee in `ANSWERS_BLOCK` en `drivenByQuestionIds` per skeleton-rij (kolom `driven_by_question_ids` bestond al); prompt **v10** (`20260716100000_appendix_prompt_v10_answer_grounding.sql`, INSERT vanaf live v9) laat een expliciet klant-antwoord op de aansturende vraag de rij beslissen (No = "Not triggered" als klant-bevestiging geformuleerd; "Insufficient information" alleen als de aansturende vragen onbeantwoord/unknown zijn én de feiten ook niet beslissen; documentstilte overrulet een antwoord nooit, alleen een echte tegenspraak). De `answersFingerprint` is bewust ongewijzigd (id/antwoord/toelichting), dus bestaande fingerprints blijven geldig. **NOG TE DEPLOYEN: edge function eerst, dan de v10-migratie.** DRAFT, pending tax review.
- **Juridische review-punten** (de bijlage draagt een banner "Draft, pending tax review" tot afgetekend): zie §8.1 van [docs/technische-bijlage-plan.md](docs/technische-bijlage-plan.md), o.a. gelieerdheid >25% vs 50% voor hybride-lichaam-gevallen, art. 12ab alleen onderdeel a/b/c/e/f, post-FKR lidnummers art. 2, oorsprongseis bij onderdeel g, art. 12af lid 2/3.

## Factsheet-pipeline (feature)

Cross-document dossier-synthese vóór de prefill-swarm. Per-doc feiten-extractie (Sonnet) tijdens upload → één merge-call (Opus) tot een sessie-factsheet → de swarm krijgt dat factsheet als cache-prefix, en beantwoordbare vragen gaan niet meer onnodig naar de cliënt. Spec: [docs/superpowers/specs/2026-07-06-factsheet-pipeline-spec.md](docs/superpowers/specs/2026-07-06-factsheet-pipeline-spec.md). Wordt **fase voor fase** gebouwd; hieronder staat wat er per fase klaar is en de deploy-volgorde.

- **Canoniek factsheet-schema (dual maintenance)**: `src/lib/factsheet/schema.ts` (frontend) en `supabase/functions/_shared/factsheetSchema.ts` (Deno). BEIDE bijwerken bij elke schemawijziging (zoals `skeleton.ts`/`skeletonRows.ts`). *(fase 2/3 — nog niet aangemaakt)*
- **Tabellen**: `atad2_document_facts` (1 rij/doc, `facts` JSONB, `status` pending/complete/error, uniek op `document_id`) en `atad2_session_factsheet` (1 rij/sessie, `factsheet` JSONB, `version++`, async `generation_status` idle/generating/complete/error, `source_document_ids`). RLS = sessie-eigenaar (patroon `atad2_appendix`), writes via service role. **`session_id` is TEXT** (niet uuid; de spec-schets zei uuid, maar `atad2_sessions.session_id` = text — we volgen het live schema).
- **Prefill-kolommen**: `atad2_question_prefills` krijgt `factsheet_version int` (welke factsheet-versie de draft gebruikte; re-run-selectie + observability) en `evidence jsonb` (`{doc_label, loc, quote}[]`). CHECK-verruiming: `suggested_toelichting` + `suggested_toelichting_unknown` 1000→4000, `answer_rationale` 200→300 (`client_question` blijft 450). Frontend-clamps (`worklist.ts` `clampToelichting`/`clampRationale`) en de `truncate(...)` in `prefill-documents/analyze.ts` staan op dezelfde limieten. De trigger `sync_open_questions_from_prefill` negeert de twee nieuwe kolommen (geen triggerwijziging nodig).
- **Prompts (nieuwe keys, DRAFT pending tax review)**: `docfacts_extract_system` v1 (Sonnet 5, per-doc feiten, géén juridische kwalificatie) en `factsheet_merge_system` v1 (Opus 4.8, merge met TIN-dedup / ledger↔note-identificatie / drawdown↔omzet-matching / richting + `included_at_recipient` per flow / schulden bij de lenende entiteit / evidence-backed negatives / verplichte `inconsistencies` + `open_points`). De key-CHECK is additief verruimd (union met bestaande VM-keys, branch-order-proof zoals `compose_letter_prompt_v1`).
- **Edge functions**: `extract-docfacts/` (Sonnet, per-doc, `safeParse` → `atad2_document_facts`, idempotent op `document_id`, laadt de doc-row server-side) en `build-factsheet/` (async `waitUntil`-patroon zoals `generate-appendix`; weigert te starten zolang er pending facts < 2 min zijn; folded stale/errored docs als warnings in `inconsistencies`; `version++`). `prefill-documents` accepteert nu optioneel `factsheet_block` + `factsheet_version` (geïnjecteerd vóór de docs, ín de cache-prefix; "" = no-op) en schrijft `factsheet_version`+`evidence` in een aparte, fout-tolerante follow-up (kolom-missing-safe). Zod-caps mee verruimd naar 4000 + `evidence`-veld toegevoegd. Beide nieuwe functions importeren `../_shared/factsheetSchema.ts` — **`_shared` MOET mee-rsyncen**.
- **Frontend**: `useDocFactsPrewarm` (vuurt extract-docfacts per doc), `useFactsheetPrewarm` (bouwt de factsheet zodra alle docs terminale facts hebben, pollt, en draait daarna de progressieve re-run), `runFactsheetRerun` + `selectRerunTargets` (pure: pending && zwak (unknown/conf<60) && factsheet_version<V, cap 40), `FactsheetPanel` (documents-step, read-only, stille chip + Rebuild). Gemount in `AssessmentUpload.tsx` naast `useAppendixPrewarm` (blijft mounted in de worklist-view). Tests: `src/lib/factsheet/__tests__/*` (schema, rerun-selectie, block-builder, WMC-fixture); hele suite groen (`npm run build` + `vitest run`).
- **Prompt v18**: `prefill_swarm_system` v18 (`20260706170000_...`), REPLACE-op-live-v17 met ankers + DO-block RAISE. Voegt FACT SHEET PRIMACY, EVIDENCE-BASED NEGATIVES, HARD DECISION RULES (US per-se corp / SM-vs-MM LLC default / NL-uitdeling geen D-NI / geconsolideerd≠enkelvoudig / gelieerdheid incl. 2:24b BW + samenwerkende groep / binnenlandse hybride = geen mismatch) en LENGTH (4000). Model/template/temp/max_tokens (4000) geërfd van v17. **DRAFT, pending tax review.**
- **NOG-TE-DEPLOYEN-VOLGORDE (strikt; alles idempotent)**:
  1. **Fase 1 — migraties** (`supabase_admin`, `ON_ERROR_STOP=1`), in volgorde: `20260706160000_document_facts_table` → `..161000_session_factsheet_table` → `..162000_prefill_widen_and_factsheet_columns` → `..163000_factsheet_prompt_seeds`. Script: `supabase/deploy/deploy_factsheet_phase1.sh`.
  2. **Fase 2 — edge functions** rsync naar de **DASH-pad** `/root/supabase-docker/volumes/functions/` (incl. **`_shared`**), restart + md5-verificatie. Script: `supabase/deploy/deploy_factsheet_phase2.sh` (synct `_shared`, `extract-docfacts`, `build-factsheet`, `prefill-documents`).
  3. **Fase 3 — frontend** via Azure App Service (nooit op de VM).
  4. **Fase 4 — prompt v18 flip** PAS NA fase 2 (placeholder-regel: anders keurt de oude container v18's 4000-char toelichting af). Script: `supabase/deploy/deploy_factsheet_phase4.sh`.
  Fase 5 (WMC-eval) is een handmatige checklist: [docs/factsheet-wmc-eval-checklist.md](docs/factsheet-wmc-eval-checklist.md).
- **Follow-ups (buiten v1, aparte beslissing)**: factsheet ook injecteren in `compose_client_letter` en de n8n-memo-payload. `appendix_system` = hieronder (appendix-hardening). n8n onaangeroerd.

## Appendix-hardening (feature)

Dezelfde ziekte als de swarm (geen gedeelde feitenbasis + geen validatielaag) zat ook in `generate-appendix`. Deze feature laat de bijlage de **factsheet** gebruiken en voegt een deterministische validatielaag toe. Root-cause-analyse (9 fouten F1-F9): [docs/superpowers/specs/2026-07-06-appendix-error-rootcauses.md](docs/superpowers/specs/2026-07-06-appendix-error-rootcauses.md). Eval: appendix-sectie in [docs/factsheet-wmc-eval-checklist.md](docs/factsheet-wmc-eval-checklist.md).

- **PROD-INCIDENT hersteld 7 jul**: de container-map `generate-appendix` had maar 2/15 bestanden (boot-error 500, bijlage DOWN). Hersteld via `vm_restore_ga.sh`. **Verifieer na elke edge-deploy dat de HELE map er staat (`ls | wc -l`), niet alleen 1 md5.**
- **Deterministische validatielaag (dual, `src/lib/appendix/` + Deno-mirror, bodies identiek, 21 tests)**: `appendixValidators.ts` (F1 `missingRowIds`, F4 `checkStatusReasoningConsistency` (degradeert tegenspraak naar "Insufficient information", nooit een inhoudelijke flip), F6 `checkOwnershipSum`, F9a `findDuplicateEntities`) + `classificationDefaults.ts` (F9b: US per-se corp / SM-vs-MM LLC / HK Ltd / IE DAC / CH AG, altijd `verify:true`).
- **Factsheet-koppeling (Deno-only)**: `factsheetLink.ts` (`loadSessionFactsheet` — alleen als `generation_status='complete'`; `linkFactsheetToRegister` vult TIN/aliases + upgrade't relatedness incl. **F7 2:24b consolidatie op 0%**; `borrowerAttributionWarnings` F8) + `factsheetBlock.ts` (Deno-mirror van `src/lib/factsheet/buildFactsheetBlock.ts`). `index.ts` laadt de factsheet server-side, vult `{{FACTSHEET_BLOCK}}` in Part A én Part B ("" als afwezig), draait coverage-retry per rij (F1), consistency-degrade (F4), en verzamelt warnings in `facts.warnings` (Facts-page, nooit in client-export). Ungrounded-rijen krijgen `ungrounded:true` (F2) → amber "Not assessed"-badge in `AppendixTable`.
- **FactEntity/AppendixFacts/AppendixRow uitgebreid (dual)**: `relatednessBasis`/`tin`/`aliases` op FactEntity, `warnings` op AppendixFacts, `ungrounded` op AppendixRow. BEIDE bijwerken (`src/lib/appendix/types.ts` + `generate-appendix/factsBuild.ts`).
- **Prompts (DRAFT, pending tax review)**: `appendix_facts_system` **v20** (REPLACE-op-live-v19, `{{DOCUMENTS_BLOCK}}`-anker: fact-sheet primacy + borrower-attributie + relatedness-basis + classificatie-defaults) en `appendix_system` **v7** (REPLACE-op-live-v6, `{{FACTS_BLOCK}}`-anker: fact-sheet primacy + factual-claims + status-consistency). Beide met RAISE-guard.
- **WP0 deploy-state (7 jul)**: live = facts **v19**, appendix **v6**, swarm v18; skelet **zonder N/A** in allowed_states (F3 → `appendix_skeleton_v4_na_state.sql` NOG deployen, Lennart akkoord).
- **NOG-TE-DEPLOYEN (na review; edge eerst, dan prompts — placeholder-regel)**:
  1. Skelet-N/A: `20260617140000_appendix_skeleton_v4_na_state.sql` (allowed_states += N/A, F3).
  2. Edge `generate-appendix` opnieuw (volledige map, incl. nieuwe `appendixValidators`/`classificationDefaults`/`factsheetLink`/`factsheetBlock` + `_shared`), md5 + `ls|wc -l` verificatie + boot-smoke.
  3. Prompt-migraties: `20260707100000_..._facts_prompt_v20` en `20260707101000_..._prompt_v7`.
  4. Frontend via Azure (ungrounded-badge + warnings-strip).
  Werkt met lege/afwezige factsheet identiek aan vandaag (veilige tussenstanden).
- **Deterministische classificatie-defaults + facts-prompt v21 (16 jul, working tree)**: fix voor "To be determined" op evidente rechtsvormen (Duhco S.A.-case). (a) `classificationDefaults.ts` (dual, frontend + Deno, cross-mirror-test in `crossMirror.test.ts`) heeft nu een corporate-vormen-tabel (S.A./SARL/NV/BV/GmbH/AG/Ltd/Plc/SpA/SAS/Nordics; LLC/LP/SCS(p)/KG/CV/SCA expliciet uitgesloten) + `defaultNlClassification` (NL-toets: NV/BV-vergelijkbaar, dus non-transparent, jaar-onafhankelijk); (b) frontend `effNlQualification` behandelt AI-"unknown" als GEEN beslissing en valt terug op de default (expliciete advisor-keuze wint altijd), werkt dus ook op bestaande dossiers zonder regenerate; (c) edge `generate-appendix` vult de NL-status server-side (`non_transparent` + basis in `applyClassificationDefaults`) en geeft de entiteits-NAAM mee aan de home-state defaults (statutaire suffix zit in de naam); (d) migratie `20260716100000_appendix_facts_prompt_v21_decisive_nl_classification.sql` (REPLACE-op-live-v20, RAISE-guard): classificatie van een buitenlandse vorm is BESLIST via rechtsvormvergelijking ("unknown" alleen als de vorm zelf niet te plaatsen is), status-key en reden moeten op dezelfde uitkomst landen, en het item-2-voorbeeld leidt niet meer met "no Dutch PE" (een PE bepaalt alleen wélke non-transparante status, nooit de classificatie). Deploy-volgorde: edge fn eerst, dan v21-migratie, frontend via Azure. DRAFT, pending tax review.
