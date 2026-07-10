# Prompt voor Claude Code — Appendix-hardening: bijlagefouten WMC-dossier structureel oplossen

Jij bent Claude Code in de `atad2-advisor` repo, in dezelfde sessie waarin je zojuist de **factsheet-pipeline** hebt gebouwd (spec: `docs/superpowers/specs/2026-07-06-factsheet-pipeline-spec.md`; jouw implementatie staat beschreven in CLAUDE.md onder "Factsheet-pipeline (feature)": tabellen `atad2_document_facts` + `atad2_session_factsheet`, `_shared/factsheetSchema.ts`, edge functions `extract-docfacts` + `build-factsheet`, prefill-injectie + swarm-prompt v18, hooks `useDocFactsPrewarm`/`useFactsheetPrewarm`, deploy-scripts fase 1-4). **Dit document is het vervolg**: dezelfde ziekte zit ook in de technische bijlage (`generate-appendix`), en die heb je nog niet aangepakt. Bouw voort op wat je al hebt gemaakt; introduceer géén parallel factsheet-mechanisme.

Lees eerst: `docs/superpowers/specs/2026-07-06-appendix-error-rootcauses.md` (korte versie van onderstaande analyse), `supabase/functions/generate-appendix/index.ts`, `factsBuild.ts`, `documentsLoader.ts`, `skeletonRows.ts`, `mootness.ts`, de actieve `appendix_system`- en `appendix_facts_system`-migraties, en `src/lib/appendix/*` (skeleton, status, sources, mootness, docx/memoAppendices).

---

## 1. Wat er misging in het WMC-memo (geverifieerd op het echte dossier, 2026-07-06)

Het gegenereerde memo bevatte in de bijlagen negen soorten fouten. Hieronder elk met de oorzaak in de code. Regelnummers per 2026-07-06.

**F1 — Fallback-rijen: "The model did not return a grounded answer for this row; confirm manually" (B.4.1, B.8.2, B.8.3).**
`index.ts` r261-271: de Part B-swarm doet één Claude-call per sectie. Faalt die call twee keer op parse (`callWithRetry`), dan is het resultaat `[]` en krijgt **elke rij van die sectie** de fallback-tekst (r278). Subtieler: ook een gesláágde call mag rijen weglaten — het zod-schema eist niet dat alle rowIds van de sectie terugkomen. Op het WMC-dossier kwam van sectie B.8 alleen rij 8.1 terug; 8.2 en 8.3 kregen de fallback. Er is geen per-rij retry en geen logging van wélke rowIds ontbraken.

**F2 — "⊖ N/A" gecombineerd met de fallback-tekst.**
De mootness-backstop (r296-300) draait ná de merge van modeloutput en legt N/A-statussen deterministisch over rijen heen, óók over rijen waarvan de tekst de F1-fallback is. Het resultaat oogt als een beoordeelde rij ("N/A") met een tekst die zegt dat er niets beoordeeld is. Niet fout qua status, wel verwarrend; de fallback-tekst hoort een eigen, zichtbaar "niet beoordeeld"-signaal te zijn.

**F3 — Status-coercion verstopt model-N/A's.**
r277: elke status buiten `allowed_states` wordt "Insufficient information". CLAUDE.md vermeldt dat `..._appendix_skeleton_v4_na_state.sql` (allowed_states += N/A), appendix-prompt v4/v5 en de bijbehorende edge function mogelijk nog niet op de VM staan. Draaide dit dossier op het pre-v4-skelet, dan zijn model-N/A's stilletjes platgeslagen naar amber. **Deploy-state verifiëren is werkpakket 0.**

**F4 — Status spreekt de eigen redenering tegen (B.6.1).**
De rij kreeg status "Not triggered" terwijl de gegenereerde tekst eindigde op "…so this condition is met". Er bestaat geen enkele consistentiecheck tussen `status` en `reasoning`, en de gate-polariteit (een scope-rij hoort "Applicable"/"N/A" te krijgen, geen "Not triggered") leeft alleen impliciet in de prompt. Dit is exact de bugklasse die je bij de questionnaire met swarm-prompt v17 hebt gedicht (answer/narrative-consistency + richtingcheck) — de appendix-prompt heeft die regel niet.

**F5 — Gefantaseerd feit: "WMC Group B.V., a US corporate taxpayer" (B.6.2).**
Architectuurfeit: **Part B ziet géén documentinhoud.** De sectie-calls krijgen alleen `FACTS_BLOCK` (compacte Part A-samenvatting), `ANSWERS_BLOCK`, `STRUCTURE_BLOCK`, `EVIDENCE_NOTES` en `DOCUMENTS_LIST` (labels only, `loadDocumentsList` r387-396). Ontbreekt een detail, dan reconstrueert het model het uit de antwoord-explanations — en verhaspelt het. WMC Group B.V. is een Nederlandse vennootschap die voor US-doeleinden als corporation geldt maar géén US taxpayer is; het memo beweerde het omgekeerde. Er is geen citatieplicht op feitelijke claims in Part B.

**F6 — Percentagefout: Jolivia Group LLC 37,24% i.p.v. 42,34% (bijlage A.1).**
De aandeelhouderspercentages van WMC Group Holding staan alleen in de VPB-aangifte (Jolivia 42,34 / Fossatum 37,24 / CorpFi 20,42); het structuurschema bevat geen percentages. Het facts-model (dat via `documentsLoader.ts` wél alle documentinhoud ziet) heeft bij het lezen van die tabel rijen verwisseld: Jolivia kreeg Fossatums percentage. Niets valideert dat parent-percentages ≈ 100% sommeren en niets cross-checkt tegen een tweede bron.

**F7 — Joshua Energy One DAC onder "Other · below 25%" → cascade naar transactie-assessment.**
`factsBuild.ts` `classifyExternals`: `related = pct > 25%` over de ownership-edges van de chart-graph. Joshua heeft 0% aandelen (orphan-SPV, wél de facto control + consolidatie per jaarrekening note 5) → `related=false` → "Other". Het datamodel kent geen gelieerdheidsbasis buiten percentage — geen 2:24b BW-groep (consolidatie), geen samenwerkende groep. Vervolgens zag het facts-model "unrelated" en beoordeelde het de Joshua-flow als "third-party commercial financing" — een dubbele fout, want gelieerdheid via art. 12ac lid 2 loopt óók via de 2:24b-groep.

**F8 — Fantoomtransactie "Helios I → Joshua" en senior-loan-attributie.**
De transactievoorstellen komen uit de facts-call die de gecónsolideerde jaarrekening leest. De senior loans (Sun Life) zijn verplichtingen van Joshua (IE) maar staan in de geconsolideerde note 13 van WMC Energy B.V. — zonder borrower-attributieregel plakt het model ze aan de verkeerde entiteit en verzint het een flow die niet bestaat. De enige harde funnel-regel (r550-559) is "zelfde jurisdictie = domestic" en vangt dit niet.

**F9 — Duplicaten en "To be determined".**
(a) Geen TIN/alias-veld in `FactEntity`: WMC Energy Corp en WMC USA Services Corp (zelfde entiteit, hernoemd) stonden als twee rijen; eerder gold hetzelfde voor WMC Project Holding B.V. = Liminal Holding B.V. (zelfde RSIN 8652 85 135). `mergeFacts` draagt handmatig toegevoegde entiteiten bovendien permanent mee over regeneraties. (b) Home-state classificaties blijven "To be determined" waar het model geen signaal had (HK Ltd, Irish DAC, WMC USA Services Corp) terwijl een deterministische default bestaat (per-se corporation, HK Ltd non-transparent, DAC non-transparent).

**Kern van de diagnose** — dezelfde als bij de prefill-swarm: er is geen gedeelde, geverifieerde feitenbasis en geen deterministische validatielaag. Part A extraheert single-shot uit alle ruwe docs (fouten F6-F9 ontstaan daar), Part B redeneert blind zonder docs (F4-F5), en de sectie-swarm heeft geen vangnetten (F1-F3). Jij hebt de feitenbasis inmiddels gebouwd — de factsheet — maar `generate-appendix` gebruikt hem nog nergens.

## 2. Wat er al ligt uit jouw eerdere werk (hergebruiken, niet opnieuw bouwen)

- `atad2_session_factsheet` (JSONB, `version`, async `generation_status`) + `atad2_document_facts`, RLS sessie-eigenaar, writes via service role.
- Canoniek schema: `src/lib/factsheet/schema.ts` + `supabase/functions/_shared/factsheetSchema.ts` (dual maintenance). Het schema bevat per entiteit aliases/TIN, per lening crediteur/debiteur, per flow richting + `included_at_recipient`, elections, negatives met bewijs, `inconsistencies`, `open_points`.
- `build-factsheet` (merge, Opus) en `extract-docfacts` (per doc, Sonnet); `prefill-documents` accepteert `factsheet_block` + schrijft `factsheet_version`/`evidence`.
- Deploy-scripts `supabase/deploy/deploy_factsheet_phase1/2/4.sh` + strikte volgorde in CLAUDE.md; WMC-eval-checklist `docs/factsheet-wmc-eval-checklist.md`.
- Conventies die onverkort gelden: placeholder-vuller eerder live dan de prompt; single-active flip met REPLACE-op-live-rij + anker + DO-block RAISE; dual-maintenance met BEIDE-BIJWERKEN-comments; `types.ts` handmatig; nieuwe juridische regels "DRAFT, pending tax review".

## 3. Werkpakketten

### WP0 — Deploy-state verificatie (los van code, vandaag)
Schrijf één verificatiescript (`supabase/deploy/verify_appendix_state.sh`, run via `az vm run-command`) dat rapporteert: actieve versies van `appendix_system`, `appendix_facts_system`, `prefill_swarm_system`; `allowed_states` van een paar skelet-rijen (bevat N/A?); md5 van `generate-appendix`-bestanden repo vs container. Output is input voor Lennart om te beslissen wat eerst gedeployed moet worden. Geen wijzigingen, alleen lezen.

### WP1 — `generate-appendix` gaat de factsheet gebruiken
1. **Server-side laden** (geen client-doorgifte zoals bij prefill; deze function is al volledig service-role): lees `atad2_session_factsheet` voor de sessie. `generation_status != 'complete'` of geen rij → lege string, alles werkt zoals nu (veilige deploy-volgorde onafhankelijk van factsheet-fases).
2. **Part A (facts-call)**: nieuwe placeholder `{{FACTSHEET_BLOCK}}` in `appendix_facts_system` (nieuwe versie, REPLACE-op-live). Instructie in de prompt: de factsheet is cross-document geverifieerd en wint van eigen lezing van de ruwe docs; entiteiten, percentages, leningen (mét borrower!), flows en gelieerdheidsbases komen dááruit; de ruwe docs zijn secundair bewijs.
3. **Part B (sectie-swarm)**: zelfde placeholder in `appendix_system` (nieuwe versie op de live rij — check éérst welke versie actief is op de VM; als v5-sources nog niet gedeployed is, houd de bestaande NOG-TE-DEPLOYEN-volgorde intact en bouw jouw versie daar bovenop). Plus twee promptregels naar v17-model: (a) STATUS CONSISTENT WITH YOUR OWN REASONING — de status moet volgen uit de eigen redenering; gate-rijen krijgen "Applicable"/"N/A", nooit "Not triggered" met bevestigende tekst; (b) FACTUAL CLAIMS — bedragen, partijen, buitenlandse fiscale behandeling alléén uit FACTSHEET_BLOCK, ANSWERS of EVIDENCE; wat daar niet staat, bestaat niet (verbiedt F5-improvisaties expliciet: nooit een entiteit een "US taxpayer" of andere hoedanigheid toedichten die de inputs niet geven).
4. **Ownership-bronprioriteit** in Part A: advisor-edits > factsheet > chart-edges > AI-voorstel; een AI-voorstel zonder factsheet- of chart-grond krijgt altijd een `to_verify`-markering.

### WP2 — Deterministische validatielaag
1. **Coverage-retry per rij** (fixt F1): na elke sectie-call `missing = skeletonRowIds − returnedRowIds`; één gerichte retry met alleen de ontbrekende rijen; pas daarna de fallback-tekst. Log `{section, missingRowIds}` gestructureerd. Bij totale sectie-failure: fallback zoals nu, maar mét die logging.
2. **Consistency-validator** (fixt F4): pure functie (unit-testbaar, `src/lib/appendix/` + Deno-kopie of alleen server-side — kies wat bij de bestaande dual-maintenance past) die per rij status vs reasoning checkt op harde tegenspraak (bevestigingspatronen als "condition is met" / "is applicable" / "requirement is satisfied" bij status "Not triggered", en omgekeerd ontkenningen bij "Triggered"/"Applicable"). Bij tegenspraak: **degradeer naar "Insufficient information"** + gestructureerde warning; nooit stil een inhoudelijke status flippen — de adviseur beslist. Patroonlijst is DRAFT, pending tax review.
3. **Percentage-somcheck** (fixt F6): parents met percentage sommeren op 95-105%, anders warning. Warnings landen in een nieuw veld `facts.warnings: string[]` dat op de Facts-pagina stil zichtbaar is (bestaande rustige UI-taal) en NOOIT in de client-export komt.
4. **TIN/alias-dedup** (fixt F9a): voeg `tin?` en `aliases?: string[]` toe aan `FactEntity` (gevuld vanuit de factsheet via naam/alias-match); registreer een duplicate-warning wanneer twee registerrijen dezelfde TIN of alias delen; bied in de Facts-UI een lichte "merge/hide"-actie of, minimaal in v1, alleen de warning. Handmatige entiteiten in `mergeFacts` doen mee in de dedup-check.
5. **Relatedness-basis** (fixt F7): vervang het kale `related: boolean` NIET (backward compat), maar voeg `relatednessBasis?: "pct" | "consolidation_2_24b" | "acting_together" | "manual"` toe. Consolidatie-informatie komt uit de factsheet (`related_to_taxpayers.basis` of het veld dat jouw schema daarvoor heeft — check je eigen schema en breid zo nodig BEIDE kopieën uit). Een entiteit met 0% maar consolidatie-basis is `related=true`. Rendering: A.1 toont de basis ("related via consolidation (de facto control)") en zet zo'n entiteit nooit onder "Other · below 25%". Raakt: `factsBuild.ts`, `buildFactsBlock`, Facts-UI, `memoAppendices.ts`. Juridische noot voor de prompt/basis-tekst: gelieerdheid art. 12ac lid 2 omvat de 2:24b BW-groep en de samenwerkende groep — DRAFT, pending tax review.
6. **Borrower-attributieregel** (fixt F8): harde promptregel in de facts-call ("schulden en rentelasten horen bij de lenende entiteit volgens de factsheet; een geconsolideerde jaarrekening attribueert nooit schuld aan de moeder") én deterministisch: een voorgestelde transactie waarvan de factsheet-financiering een andere debiteur noemt, krijgt een warning + `to_verify` in plaats van stil door te gaan.
7. **Classificatie-defaults** (fixt F9b): deterministische tabel (in `factsBuild.ts` of een nieuw `classificationDefaults.ts`, dual waar nodig): US Inc./Corp naar statelijk recht → per-se corporation, non-transparent (geen CTB mogelijk); US LLC single-member → default disregarded, `to_verify`; US LLC multi-member → default partnership, `to_verify`; HK Ltd → non-transparent; Irish DAC → non-transparent; CH AG → non-transparent. Toegepast wanneer het model niets voorstelt; status altijd "proposed"/`to_verify`, nooit stil bevestigd. Lijst is DRAFT, pending tax review.

### WP3 — Fallback-rijen zichtbaar maken (fixt F2)
Een rij met de fallback-tekst krijgt een expliciet veld `ungrounded: true`. UI: amber outline + "Not assessed — regenerate or edit" in plaats van een normale statuschip; mootness mag de status op N/A zetten, maar de UI toont dan "N/A (derived) — reasoning missing". Export/memo: fallback-rijen renderen met de amber "Insufficient info"-stijl, nooit als stil groen/gedempt groen.

### WP4 — Tests + eval
Unit tests voor: coverage-retry-selectie, consistency-patronen (incl. de B.6.1-casus letterlijk), somcheck, TIN-dedup, relatedness-basis, classification-defaults. Breid `docs/factsheet-wmc-eval-checklist.md` uit met appendix-asserties: (1) Joshua related via consolidation, niet "Other"; (2) geen fantoomflow Helios→Joshua; senior loans bij Joshua; (3) Jolivia 42,34% in A.1; (4) B.6.1-type gate nooit "Not triggered" met bevestigende tekst; (5) geen "US taxpayer"-claim over een NL-entiteit; (6) B.8-sectie komt volledig terug of ontbrekende rijen zijn individueel geretried; (7) E14/E19- en E2/E15-duplicaten geven een warning.

## 4. Volgorde en deploy

1. WP0 direct (alleen lezen). 2. WP1+WP2 in de code, fase-gewijs met stops voor review. 3. Deploy-volgorde: eerst de bestaande NOG-TE-DEPLOYEN-items uit CLAUDE.md (skeleton v4 N/A → appendix prompt v4 → v5 sources + edge function → factsheet fase 1-2), dán jouw nieuwe edge function (placeholder-vuller), dán de nieuwe promptversies, dán frontend. De function moet met een lege/afwezige factsheet identiek aan vandaag werken, zodat geen enkele tussenstand breekt. 4. Werk CLAUDE.md bij (appendix-sectie + NOG-TE-DEPLOYEN-lijst). 5. Na volledige deploy: WMC-dossier regenereren en de eval-checklist draaien.

## 5. Non-goals

Geen wijziging aan: het status-vocabulaire (4 waarden), de mootness-afhankelijkheden (DRAFT, pending tax review), n8n/memo-template, de compose-letter, het RAG/embeddings-mechanisme, en geen UI-redesign buiten de genoemde warnings/badges. De consistency-validator flipt nooit naar een inhoudelijke status; alleen naar "Insufficient information".
