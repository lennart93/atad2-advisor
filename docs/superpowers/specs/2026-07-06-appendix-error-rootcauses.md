# Root-cause-analyse: fouten in de memo-bijlagen (WMC-dossier, 2026-07-06)

Elke waargenomen fout gemapt op de plek in de code. Referenties: `supabase/functions/generate-appendix/index.ts` (regelnummers per 2026-07-06), `factsBuild.ts`, `documentsLoader.ts`.

## Architectuurfeit dat bijna alles verklaart

- **Part A** (entiteiten/classificaties/transacties → memo-bijlage A.1/A.2): register komt **deterministisch uit de structure-chart-graph** (`factsBuild.ts` `classifyExternals`); daarbovenop één AI-call die **wél alle documentinhoud** ziet (`documentsLoader.ts` downloadt alles) en classificaties/transacties/acting-together voorstelt.
- **Part B** (artikelrijen → memo-bijlage 2): sectie-swarm die **géén documentinhoud** ziet — alleen het compacte `FACTS_BLOCK`, de questionnaire-antwoorden, structuur en documents-**metadata** (`loadDocumentsList` = labels only).

Dus: fouten in Part A cascaderen naar Part B, en Part B improviseert bij ontbrekend detail omdat het niets kan nalezen.

## Per fout

1. **"The model did not return a grounded answer" (B.4.1, B.8.2, B.8.3).** `index.ts` r261-271: één Claude-call per sectie; bij dubbele parse-failure `return []` → **alle** rijen van die sectie krijgen de fallback-tekst (r278). Binnen een geslaagde call kan het model bovendien rijen weglaten — er is geen rowId-coverage-check (B.8: alleen 8.1 kwam terug). Daarna kan de mootness-backstop (r296-300) een N/A-status óver een fallback-rij leggen → de combinatie "⊖ N/A + confirm manually".
2. **B.8.1 blijft "Insufficient info" na tekst-edit.** "Edit reasoning" wijzigt alleen `reasoning`; status is een aparte control. Bovendien coercet r277 elke status buiten `allowed_states` naar "Insufficient information" — als de VM nog het pre-v4-skelet draaide (de `..._appendix_skeleton_v4_na_state.sql`-migratie stond als NOG TE DEPLOYEN), zijn model-N/A's zo platgeslagen. **Actie: deploy-state op de VM verifiëren en het dossier regenereren.**
3. **B.6.1 status ("Not triggered") spreekt eigen tekst ("this condition is met") tegen.** Er bestaat geen status↔reasoning-consistencycheck; gate-polariteit (Applicable vs Not triggered) leeft alleen in de prompt en `conditionPolarity` staat als DRAFT. Zelfde bugklasse als swarm-v17 bij de questionnaire.
4. **B.6.2 "WMC Group B.V., a US corporate taxpayer".** Part B kan niets verifiëren (geen docs in context) en er is geen citatieplicht op feitelijke claims; het model reconstrueerde de blocker-redenering uit de antwoord-explanations en verhaspelde die. 
5. **A.1 Jolivia 37,24% i.p.v. 42,34%.** Percentages komen uit chart-edges + AI-afleiding uit de docs; het jan-2025-schema bevat géén percentages, dus dit is een rij-misalignment met Fossatum (die 37,24% heeft) bij het lezen van de aandeelhouderstabel in de VPB-aangifte. Nergens een validatie dat parent-percentages ≈ 100% sommeren of een cross-check tegen de aangifte.
6. **Joshua onder "Other" → cascadeert naar T6 "third-party".** `classifyExternals`: `related = pct > 25%` over ownership-edges — Joshua heeft 0%/geen edge, dus related=false. Het datamodel kent geen gelieerdheidsbasis buiten percentage (geen 2:24b-consolidatie, geen samenwerkende groep). Het facts-model ziet vervolgens "unrelated" en labelt de flow third-party.
7. **T6 fantoomflow (Helios → Joshua).** De transactievoorstellen lezen de geconsolideerde jaarrekening zonder borrower-attributieregel (geconsolideerd ≠ enkelvoudig); de enige harde funnel-regel (r550-559) is same-jurisdiction-domestic en vangt dit niet.
8. **Duplicaten E14/E19 (en eerder E2/E15).** Geen TIN/alias-veld in `FactEntity`; naamvarianten uit verschillende documenten worden nooit gereconcilieerd; `mergeFacts` draagt handmatig toegevoegde entiteiten permanent mee over regeneraties heen.
9. **"To be determined" home-state classificaties (HK/IE/CH/US).** Het facts-model vult alleen waar het signaal heeft; de KB-retrieval is NL-kwalificatie-gericht; er zijn geen deterministische defaults (per-se corporation, SMLLC-default, HK Ltd, Irish DAC).

## Aanvullingen op de factsheet-spec (`2026-07-06-factsheet-pipeline-spec.md`)

De spec lost 4-9 grotendeels op (gedeelde feitenbasis, TIN-dedup, richting/attributie, beslisregels). Voeg toe:

- **A. Part A voedt zich met de factsheet**: entiteiten mét TIN + aliases; `related`-veld wordt `relatedness: { basis: "pct" | "consolidation_2_24b" | "acting_together", pct?: number }`; rendering van A.1 groepeert daarop i.p.v. alleen >25%.
- **B. Deterministische validatielaag Part A**: parent-percentages sommeren ≈ 100% (anders flag), transacties alleen tussen bekende entiteiten met borrower-attributie uit de factsheet, duplicate-detectie op TIN.
- **C. Part B krijgt het factsheet-blok** in elke sectie-call (compact, lost de grounding op zonder de calls op te blazen) + citatieplicht per feitelijke claim.
- **D. Coverage-retry per rij**: valideer dat elke rowId van de sectie terugkomt; ontbrekende rijen individueel opnieuw proberen vóór de fallback-tekst erin gaat; log sectie-failures met rowIds.
- **E. Status↔reasoning-consistencyvalidator**: deterministische polariteitscheck per rijtype (gate-rijen mogen niet "Not triggered" zijn met bevestigende tekst) + dezelfde regel in de appendix-prompt (v17-patroon).
- **F. Classificatie-defaults met `status: "to_verify"`** voor bekende vormen (Delaware Inc. = per-se corp; SMLLC = disregarded tenzij election; HK Ltd / Irish DAC = non-transparent).
- **G. Operationeel, vandaag al doen**: `docker exec` md5-check of skeleton-v4 (N/A-state), appendix-prompt v4/v5 en de laatste edge function daadwerkelijk op de VM staan; daarna het WMC-dossier regenereren — een deel van de zichtbare gekkigheid is mogelijk gewoon stale deploy-state.
