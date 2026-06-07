# Design spec: ATAD2 Technical Appendix (review-werkplek + bijlage)

> Datum: 2026-06-07. Auteur-sessie: brainstorm met Lennart Wilming.
> Bouwt voort op [docs/technische-bijlage-plan.md](../../technische-bijlage-plan.md) (juridische research + per-artikel verificatie) en [docs/technische-bijlage-v1-skelet.md](../../technische-bijlage-v1-skelet.md) (vast skelet + generatie-prompt). Dit document is het ontwerp; de stap-voor-stap implementatie volgt via writing-plans.

## 1. Doel

Een technische bijlage bij het ATAD2-memo: een vast, artikelsgewijs document dat per wetsonderdeel (art. 2 + art. 12aa t/m 12ag Wet Vpb 1969) vastlegt of het van toepassing is, met een korte gegronde reden en een citaat. Het complementeert het verhalende memo en onderbouwt de documentatieverplichting van art. 12ag. De adviseur reviewt en stuurt bij in een eigen stap voordat het memo wordt gemaakt; de bevestigde bijlage voedt vervolgens het memo.

## 2. Vastgelegde keuzes

- **Nieuwe stap** in de assessment-flow: een review-werkplek voor de bijlage.
- **Volgorde** (werkelijke stappen): Intake → Documents → Questions → Confirmation → Structure → **Technical appendix** → Report (memo) → één gecombineerde DOCX. De bijlage komt dus na Structure en vóór Report.
- **De bevestigde bijlage voedt het memo.** Het memo vertelt de technische analyse na en mag die niet tegenspreken.
- **Vast skelet** (het rechtskader) staat in code; de AI vult per regel Decision + Reasoning + Reference.
- **Bewaren als gestructureerde data** (losse velden per regel), niet als één tekstblok.
- **Per-regel bewerkbaar** door de adviseur, met een apart wijzigingslogboek.
- **Bij gewijzigd antwoord:** edits blijven staan, alleen geraakte regels krijgen een "review again"-vlag.
- **Reference is intern**, valt weg in de export.
- **Output volledig Engels**; geen NL-term tussen haakjes; citaten blijven.
- **Reikwijdte v1:** art. 2 + 12aa t/m 12ag, per wetsonderdeel (geen per-betaling grootboek).
- **Generatie** via een eigen Supabase Edge Function (geen n8n).
- **Doel/toon:** dossieronderbouwing onder art. 12ag; "Draft, pending tax review"-banner tot juridische punten zijn afgetekend.

## 3. Flow en navigatie

Nieuwe pagina **Technical appendix** in de stappenbalk, tussen Structure en Report (route `/assessment-appendix/:sessionId`, in lijn met de bestaande `/assessment-confirmation/...` en `/assessment-report/...`).

1. Na het afronden van het structuurschema (Structure) komt de adviseur op de appendix-stap.
2. Eerste keer: de app genereert de bijlage automatisch, mits documentanalyse (prefill-swarm) en structuurschema klaar zijn. Anders een uitleg + (uitgeschakelde) **Generate**-knop, zelfde poort-logica als het memo nu.
3. De adviseur ziet de bijlage als bewerkbare tabel, reviewt, past aan.
4. **Confirm appendix** zet de status op bevestigd. Pas daarna is doorgaan naar het memo mogelijk.
5. De memo-stap gebruikt de bevestigde bijlage als input.

Terug naar de antwoorden kan altijd; werk blijft behouden. Wijzigen na bevestigen zet de bijlage terug op "te beoordelen" (zie §8).

## 4. Datamodel

### 4.1 Het vaste skelet (code)

`src/lib/appendix/skeleton.ts`: een geordende lijst van regel-definities. Per regel:

- `rowId` (bv. `"1.b"`)
- `sectionId` + `sectionTitle` (bv. `"1"`, "Mismatch categories, art. 12aa(1)(a)-(g)")
- `legalFramework`: citaat + kort Engels label (verbatim, bv. "art. 12aa(1)(b) Wet Vpb 1969, Payment to a hybrid entity")
- `effect`: `"D/NI" | "DD" | null`
- `allowedStates`: bv. `["Not applicable","Potentially applicable","Further information needed"]` (gateway-rijen hebben eigen set)
- `drivenByQuestionIds`: bv. `["Q26","Q27"]` (voor de vlaggen en als hints aan het model)
- `referenceInternalOnly: true`
- `renderCondition`: optioneel (Sectie 1bis alleen bij Q2=Yes)
- `flags`: optioneel `"contested" | "unverified"` (bv. 1.g oorsprongseis, art. 12af lid 2/3)

De volledige rij-inhoud staat in [technische-bijlage-v1-skelet.md](../../technische-bijlage-v1-skelet.md) en is leidend.

### 4.2 De opgeslagen bijlage (per sessie)

Nieuwe tabel `atad2_appendix` (één actuele bijlage per `session_id`):

- `id`, `session_id`, `review_status` (`"draft" | "confirmed"`), `generation_status` (`"generating" | "ready" | "error"`), `generated_at`, `model`, `prompt_version`, `confirmed_at`, `confirmed_by`
  - `review_status` = waar de adviseur staat (concept of bevestigd); `generation_status` = waar het maken staat (bezig, klaar, fout). Deze zijn los van elkaar.
- `rows` (gestructureerd, per regel een object):
  - `rowId`
  - `aiDecision`, `aiReasoning`, `aiReference` (wat het model produceerde)
  - `decision`, `reasoning`, `reference` (huidige waarde; gelijk aan AI tot een edit)
  - `source`: `"ai" | "edited"`
  - `stale`: boolean, + `staleReason` (bv. "Q15 changed Yes→Unknown")
  - `editedBy`, `editedAt` (laatste bewerking)

Nieuwe append-only tabel `atad2_appendix_edits` (wijzigingslogboek): `id`, `appendix_id`, `row_id`, `field` (`"decision" | "reasoning" | "reference"`), `old_value`, `new_value`, `edited_by`, `edited_at`.

`src/integrations/supabase/types.ts` wordt handmatig bijgewerkt (Row/Insert/Update) voor beide tabellen, conform de CLAUDE.md-regel (geen Supabase CLI tegen de self-hosted instance).

### 4.3 Skelet-evolutie

De opgeslagen rijen verwijzen via `rowId` naar het skelet. Wijzigt het skelet (nieuw onderdeel, herlabeling), dan rendert de UI door opgeslagen rijen aan het huidige skelet te koppelen op `rowId`; nieuwe skelet-rijen tonen als "nog niet gegenereerd" tot hergeneratie.

## 5. Generatie

### 5.1 Edge Function `generate-appendix`

In de stijl van `supabase/functions/extract-structure/` (hergebruik `verifyAuth.ts`, `promptsLoader.ts`, `claude.ts`, `index.ts`).

- **Input:** `session_id`, de antwoorden (`atad2_answers`), het structuurschema (`atad2_structure_entities` + `_edges`), het skelet, `taxpayer_name`, `fiscal_year`.
- **Werking:** vult per skelet-regel `decision` + `reasoning` + `reference` via prompt-key `appendix_system` (opgeslagen in `atad2_prompts`, versiebeheer, bewerkbaar in de Admin Prompts UI). De prompt staat in [technische-bijlage-v1-skelet.md](../../technische-bijlage-v1-skelet.md).
- **Gedwongen gestructureerde output** (JSON schema): per `rowId` een geldige `decision` (uit `allowedStates`) + niet-lege `reasoning` + `reference`.
- **Model:** capabel model op temperatuur 0 voor consistentie, zoals de structuur-extractie.
- **Async met voortgang:** draait als achtergrondtaak; de UI pollt `atad2_appendix.generation_status` (zoals `extract-structure` via `atad2_structure_charts.status`) en toont voortgang.

### 5.2 Validatie en fouten

- Elke skelet-regel moet een geldige stand + niet-lege reden krijgen; niet-gegronde regels worden `"Further information needed"`, nooit een geraden `"Not applicable"`.
- Malformed output: één keer opnieuw, anders nette foutmelding; niets halfs opslaan.

### 5.3 Hergenereren en samenvoegen

- `source: "edited"`-rijen: huidige `decision`/`reasoning`/`reference` blijven; `aiDecision`/`aiReasoning`/`aiReference` worden ververst (zodat drift zichtbaar is); `stale` gezet als het aansturende antwoord veranderde.
- `source: "ai"`-rijen: overschreven met nieuwe AI-waarden.

## 6. Review-werkplek (UI)

Nieuwe pagina met een bewerkbare tabel, gegroepeerd per sectie. Kolommen: **# | Legal framework | Decision | Reasoning | Reference (internal) | Source**.

- **Decision:** dropdown beperkt tot `allowedStates`.
- **Reasoning:** tekstveld; één zin, zonder interne codes.
- **Reference (internal):** aparte kolom, aan/uit te schakelen (toggle "Show references"); nooit in de export.
- **Source:** badge `AI` of `edited`; bij `edited` blijft de AI-originele waarde in het logboek.
- **Vlag:** regels met `stale=true` krijgen een amber "review again"-chip + accent; vlag verdwijnt bij hergenereren of "mark reviewed".
- **Contested/unverified** merkjes inline op de betreffende regels.
- **Werkbalk:** Regenerate, status ("X need review"), references-toggle, **Confirm appendix**.
- **Banner:** "Draft, pending tax review" tot afgetekend (zie §11).
- Rendering is een eigen React-tabelcomponent op de gestructureerde data; dus géén markdown/`remark-gfm` nodig in deze stap.

Mockup: `.superpowers/brainstorm/.../review-workspace.html` (kolom-variant, goedgekeurd).

## 7. De bijlage voedt het memo

- Bij **Confirm appendix** maakt de app uit de bevestigde rijen een compact, gegrond "technical analysis"-blok.
- Het memo wordt nog via de bestaande n8n-flow gemaakt; het blok gaat mee in de `generate-report`-payload (zoals nu het documentenblok). De memo-prompt krijgt de instructie: baseer de ATAD2-analyse op deze bevestigde bijlage en spreek die niet tegen.
- Het memo blijft gewone-taal en blijft (huisregel) zonder artikelnummers; alleen de inhoud sluit nu aan op de bijlage.
- De risico-uitkomst (low/medium/high) blijft uit de bestaande scoring komen; de bijlage verandert die niet.

## 8. Veroudering (de vlag)

- Elke skelet-regel kent zijn `drivenByQuestionIds`. Verandert zo'n antwoord (of een relevant schema-feit) na generatie, dan worden alleen de leunende regels `stale=true` met `staleReason`.
- Edits en niet-geraakte regels blijven ongemoeid.
- Wijzigen ná **Confirm**: `review_status` terug naar `draft`, vlaggen verschijnen, en de memo-stap waarschuwt dat het memo verouderd kan zijn.

## 9. Rechten

Iedereen die aan het dossier werkt mag genereren, bewerken en bevestigen. Geen aparte admin-rol. De prompt `appendix_system` is, net als het memo, alleen in de Admin Prompts UI te bewerken. Het weghalen van de "Draft, pending tax review"-banner is admin-only (§11).

## 10. Randgevallen en foutafhandeling

- Documentanalyse of schema niet klaar: uitleg + Generate uit, zelfde poort als het memo.
- Leeg of niet-afgerond schema: toch genereren uit antwoorden; schema-afhankelijke regels worden "Further information needed (structure chart not available)", niet "Not applicable".
- Generatie mislukt: retry-once, dan foutmelding; geen halve opslag.
- Doorgaan naar memo geblokkeerd tot `review_status = confirmed`.

## 11. Juridische review-poort

De bijlage draagt een verplichte "Draft, pending tax review"-banner (op scherm én in de export) tot de openstaande juridische punten door een fiscalist zijn afgetekend. Die punten staan in §8.1 van [technische-bijlage-plan.md](../../technische-bijlage-plan.md), o.a.:

- R1/R2: gelieerdheid is de brede associated-enterprise-toets; drempel 25%, opgehoogd naar 50% voor de hybride-lichaam-onderdelen (per-onderdeel bevestigen); grens 25% vs >25%.
- R3: art. 12ab alleen voor onderdeel a/b/c/e/f, nooit d/g (in code afgedwongen).
- R4: art. 12ae omvat verliezen; lid 2 als restrictie.
- R5: art. 12af lid 2/3 onbevestigd.
- R6: post-FKR lidnummers art. 2 (verifieer live).
- R7: oorsprongseis bij onderdeel g betwist.

Banner-status als veld (admin kan hem weghalen na aftekenen).

## 12. Testen

- Vlaggen: antwoord wijzigt → juiste regels `stale`.
- Samenvoegen: aangepaste regels blijven bij hergenereren; AI-velden ververst.
- Export laat de Reference-kolom weg.
- Generatie-validatie: elke skelet-regel krijgt een geldige stand uit `allowedStates` + niet-lege reden.
- Grendels: onderdeel d en g kunnen nooit een art. 12ab-bijheffing voeden.
- In de stijl van bestaande tests (bv. `src/lib/structure/__tests__`).

## 13. Buiten scope (v1) / later

- Per-betaling grootboek (de art. 12ag "per item"-eis is in v1 op vraagniveau; §7.2 van de bijlage meldt dit eerlijk).
- In-app markdown-tabelrendering voor het memo zelf (`remark-gfm` + tabel-handlers); de bijlage-stap heeft dit niet nodig (eigen tabelcomponent).
- Volledige versie-snapshots van de bijlage (v1 houdt één actuele bijlage + wijzigingslogboek).
- Aangrenzende bepalingen (Wet FKR-kwalificatie als eigen sectie, CFC, deelnemingsvrijstelling-raakvlak).

## 14. Belangrijke bestanden

- Skelet + prompt (leidend): [docs/technische-bijlage-v1-skelet.md](../../technische-bijlage-v1-skelet.md)
- Juridische research + review-punten: [docs/technische-bijlage-plan.md](../../technische-bijlage-plan.md)
- Prompt-registry om uit te breiden: `src/lib/admin/promptKeys.ts`
- Prompt-seed patroon: `supabase/migrations/20260604100000_memo_prompt_v3_no_preamble.sql`
- Types (handmatig): `src/integrations/supabase/types.ts`
- Edge Function patroon: `supabase/functions/extract-structure/`
- Memo-payload (n8n): `src/pages/AssessmentReport.tsx`
- Structuur-entiteittypes: `src/lib/structure/types.ts`
