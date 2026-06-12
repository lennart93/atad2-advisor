# ATAD2 Technical Appendix, v1 vastgelegd ontwerp (skelet + prompt)

> Aanvulling op [technische-bijlage-plan.md](technische-bijlage-plan.md). Legt de v1 vast na de keuzes van Lennart op 2026-06-05, inclusief de verfijningen: referentie los van de motivering (intern, niet in het klant-overzicht), volledig Engelse output, en de bredere "gelieerd lichaam"-definitie.

## Vastgelegde keuzes
1. **Generatie:** vast, hard-coded skelet (het rechtskader: elk artikel + lid + onderdeel met een kort Engels label, altijd getoond). De AI vult per regel de **Decision** (Not applicable / Potentially applicable / Further information needed), een **Reasoning** van één zin, en een **Reference**. Het raamwerk verandert nooit.
2. **Taal:** volledig Engels. Geen Nederlandse wetsterm tussen haakjes. De wetsverwijzing (bijv. "Article 12aa(1)(a) Wet Vpb 1969") blijft staan.
3. **Diepgang v1:** per wetsonderdeel, niet per intercompany-betaling. §7 vermeldt eerlijk dat de "per item"-inventarisatie op vraagniveau staat.
4. **Referentie is intern.** De Reference (welke antwoorden/entiteiten de beslissing dragen) is alleen zichtbaar in de omgeving. In het geexporteerde overzicht dat de klant of de inspecteur krijgt, wordt de Reference-kolom weggelaten. De Reasoning bevat zelf nooit interne codes zoals "Q15 = Yes".

## Hard-coded versus AI
- **Hard-coded (verandert nooit):** de sectie-indeling, elke rij met citaat + Engels label, de toegestane beslisstanden, de volgorde, en de juridische grendels (art. 12ab alleen onderdeel a/b/c/e/f; art. 12ae omvat verliezen; de art. 2-toets is ≥50%).
- **AI vult per rij in:**
  - **Decision:** de stand.
  - **Reasoning:** exact één Engelse zin, schoon, die het beslissende feit in gewone taal noemt, zonder interne codes.
  - **Reference:** de bron (antwoord-id, entiteit, edge). Intern alleen.
- **Grondingscontract:** waar de data zwijgt is de Decision verplicht "Further information needed", nooit "no indication of". Een "Not applicable" noemt altijd het ontkrachtende feit (in de Reasoning) met de bron (in de Reference).

## Twee renderings van dezelfde data
- **Internal view (in de app):** alle vier kolommen, inclusief Reference. Voor de adviseur om de gronding te controleren.
- **Export / overzicht (DOCX, klant- en inspecteur-facing):** alleen `# | Legal framework | Decision | Reasoning`. De Reference-kolom valt weg.

---

## Related party, the broad definition (Article 12ac Wet Vpb, implementing ATAD2 art. 2(4))

Dit is breder dan een enkele 25%-deelneming. Een **associated enterprise / gelieerd lichaam** omvat:

- an entity in which the taxpayer holds, directly or indirectly, **25% or more** of the voting rights, capital, or profit entitlement;
- an entity or individual that holds **25% or more** in the taxpayer;
- entities in which the same person holds 25% or more (common control, sister entities);
- an entity belonging to the **same consolidated group** for financial-accounting purposes;
- an entity over whose management the taxpayer has **significant influence**, or which has significant influence over the taxpayer's management;
- the **acting-together rule** (samenwerkende groep, Article 10a(6)): a person acting together with another in respect of voting rights or capital is treated as holding that other person's participation;
- a **structured arrangement** can bring a payment into scope even absent relatedness.

> **Threshold nuance (confirm per limb):** the qualifying threshold is in principle 25%, but ATAD2 art. 2(4) replaces 25% by **50%** for the hybrid-entity-type mismatches (the limbs arising under the hybrid-entity / reverse-hybrid points, and for Article 9(3) adjustments). So the test is broad and the exact 25%-vs-50% boundary differs per limb. This restores the differentiation the earlier auto-verification had stripped on the basis of the (incomplete) local commentary, per Lennart's input. The precise per-limb threshold is the one point to confirm against the live consolidated text before this goes inspecteur-facing.

---

## Het vaste skelet (het rechtskader)

`Decision`, `Reasoning` en `Reference` worden door de AI gevuld. `Reference` is intern en valt weg in de export.

### Section 0, Gateway and scope (Article 2 / Article 3; Article 12ac)

| # | Legal framework | Decision (AI) | Reasoning, 1 sentence (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 0.1 | Article 2(1) / Article 3 Wet Vpb 1969, subject to Dutch CIT (resident, or non-resident with a Dutch permanent establishment) | _in scope / out of scope_ | | _Q1 or Q2_ |
| 0.2 | Cross-border element present | _yes / no / further info_ | | _Q3, chart jurisdictions_ |
| 0.3 | Article 12ac jo. Article 10a(6) Wet Vpb 1969, related party (broad associated-enterprise test) or structured arrangement | _yes / no / further info_ | | _holding %, chain, Q28_ |
| 0.4 | Financial year starting on or after 1 Jan 2020 (Article 12ag in force) | _yes / no_ | | _financial year_ |

> If 0.1, 0.2 or 0.3 = no: record once "regime out of scope" and set the outbound sections (1, 2, 4) to "Not applicable, gateway not met (see §0)". Sections 1bis, 5 and 7 are always rendered (own triggers).

### Section 1, Mismatch categories, Article 12aa(1)(a)–(g)

Relatedness here is the broad associated-enterprise test of Article 12ac; threshold 25% in principle, raised to 50% for the hybrid-entity-type limbs (confirm per limb).

| # | Legal framework | Effect | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|---|
| 1.a | Article 12aa(1)(a) Wet Vpb 1969, hybrid financial instrument or hybrid transfer | D/NI | _state_ | | _Q30, Q8, Q11_ |
| 1.b | Article 12aa(1)(b), payment to a hybrid entity | D/NI | _state_ | | _Q26, Q27, chart_ |
| 1.c | Article 12aa(1)(c), payment to an entity with permanent establishment(s), allocation conflict | D/NI | _state_ | | _Q12, Q13, Q14_ |
| 1.d | Article 12aa(1)(d), disregarded permanent establishment | D/NI | _state_ | | _Q14, Q18b_ |
| 1.e | Article 12aa(1)(e), payment by a hybrid entity (disregarded payment) | D/NI | _state_ | | _Q26/Q27, hybrid node_ |
| 1.f | Article 12aa(1)(f), deemed payment between head office and PE | D/NI | _state_ | | _Q20b, Q21b_ |
| 1.g | Article 12aa(1)(g), double deduction | DD | _state_ | | _Q19, Q4c; DII via Q4d_ |

> Guards (in code): primary rule = deny the NL deduction. Secondary inclusion (§2, Article 12ab) can only follow limbs a, b, c, e and f, **never d, never g**. A "Not applicable" on 1.g that rests on the origin requirement carries an inline "contested point, see tax review" flag.

### Section 1bis, Non-resident taxpayer with a Dutch PE, Article 3 (render only if Q2 = Yes)

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 1bis.1 | Foreign head office inside or outside the EU | _EU / non-EU / further info_ | | _Q31_ |
| 1bis.2 | Double deduction at head office and Dutch PE | _state_ | | _Q32_ |
| 1bis.3 | Deemed payment to the Dutch PE, included abroad or not | _state_ | | _Q33, Q34_ |
| 1bis.4 | Non-EU PE makes a deemed payment to the Dutch PE | _state_ | | _Q35_ |

### Section 2, Secondary inclusion rule, Article 12ab (limbs a/b/c/e/f only)

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 2.1 | Article 12ab(1) jo. (3) Wet Vpb 1969, NL as recipient state includes income where the payer state does not deny the deduction, only for a limb a/b/c/e/f mismatch | _state_ | | _derived from §1; limbs d and g can never reach here_ |

### Section 3, Definitions and scope, Article 12ac

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 3.1 | Article 12ac Wet Vpb 1969, associated-enterprise / related-party test met (broad; see definition above) | _met / not met / further info_ | | _holding % + chain + consolidation + significant influence_ |
| 3.2 | Article 12ac, structured arrangement | _present / absent / further info_ | | _Q28_ |
| 3.3 | Qualification under Dutch standards (FKR comparison method, from 1 Jan 2025) | _done / open / n/a_ | | _per foreign legal form_ |
| 3.4 | Dual-inclusion income present | _present / absent / further info_ | | _Q4d, Q11, Q25_ |

### Section 4, Imported mismatches, Article 12ad

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 4.1 | NL payment to a related party or under a structured arrangement | _state_ | | _Q5, Q28_ |
| 4.2 | Hybrid mismatch (DD or D/NI) elsewhere in the financing chain | _state_ | | _Q9/Q10_ |
| 4.3 | The NL payment funds that foreign cost (direct/indirect, back-to-back) | _state_ | | _Q9, Q10_ |
| 4.4 | Mismatch not neutralised in any foreign state (Article 12ad(2) carve-out) | _state_ | | _Q11_ |
| 4.5 | Already neutralised in NL under Article 12aa/12ab on the same payment | _n/a (handled upstream) / state_ | | _derived from §1/§2_ |

### Section 5, Reverse hybrid (Article 2) and dual residence (Article 12ae)

**5A, reverse hybrid, Article 2 (verify live lid)**

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 5A.1 | A related participant treats the NL taxpayer as transparent (classification conflict) | _state_ | | _Q4_ |
| 5A.2 | Deductible payment to that holder, not in its tax base (D/NI) | _state_ | | _Q4b_ |
| 5A.3 | Costs, charges or losses also deducted in the holder's state (DD) | _state_ | | _Q4c_ |
| 5A.4 | Set off against dual-inclusion income | _fully / partly / no / further info_ | | _Q4d_ |
| 5A.5 | **50% or more** of votes, capital or profit held, directly or indirectly, by related parties (the Article 2 reverse-hybrid test) | _state_ | | _chart edges + Q4_ |
| 5A.6 | UCITS/AIF exception, or former open CV whose CIT liability lapsed on 1 Jan 2025 (Wet FKR) | _carved out / n/a / further info_ | | _chart + facts_ |

**5B, dual residence, Article 12ae**

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 5B.1 | Dual tax residence (the NL taxpayer is also resident elsewhere) | _state_ | | _Q29 (Yes = potentially applicable)_ |
| 5B.2 | Same remunerations, payments, charges **or losses** deducted in both states | _state_ | | _Q29 + DD facts_ |
| 5B.3 | Set off against dual-inclusion income | _fully / partly / no / further info_ | | _quantified_ |
| 5B.4 | Article 12ae(2): for an EU Member State, the deduction is denied only if a treaty makes the taxpayer a resident of that other Member State | _denied / not denied / further info_ | | _treaty tie-breaker_ |

### Section 6, Carry-forward of denied deductions, Article 12af

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 6.1 | Earlier-year denial under Article 12aa(1)(e)/(f)/(g), Article 12ae, or inclusion under Article 12ab(1) | _n/a / applicable / further info_ | | _no prior-year field: default "no prior denial on record", human confirms_ |
| 6.2 | Dual-inclusion income in a later year than the denial | _n/a / applicable / further info_ | | _later-year DII, single recapture_ |

> Article 12af(2)/(3) (interest characterisation, interaction with Article 15b): **unverified against the in-force text**, flag as such.

### Section 7, Documentation obligation, Article 12ag

| # | Legal framework | Decision (AI) | Reasoning (AI) | Reference, internal (AI) |
|---|---|---|---|---|
| 7.1 | Within Section 2.2a, financial year from 1 Jan 2020 (Article 12ag(1)) | _yes / no_ | | _residence + financial year_ |
| 7.2 | Inventory per remuneration, payment, deemed payment, charge or loss | _complete / partial / none_ | | _honest: data is question-level, no per-item ledger_ |
| 7.3 | Records show, per item, to what extent and how Section 2.2a applies | _documented / partial / no_ | | _cross-reference §0–§6_ |
| 7.4 | Where a correction is applied, its computation is in the file | _documented / no correction / missing_ | | _reference to computation_ |
| 7.5 | File producible on request | _yes / risk of reversal_ | | _assembly + retention_ |
| 7.6 | Checked for a ministerial regulation under lid 3 with extra data fields | _checked / to be checked (human)_ | | _never an automatic "none"_ |

---

## Twee voorbeeld-invullingen (internal view, met Reference)

**Not applicable, grounded:**

| # | Legal framework | Decision | Reasoning | Reference (internal) |
|---|---|---|---|---|
| 1.b | Article 12aa(1)(b), payment to a hybrid entity (D/NI) | Not applicable | The taxpayer does not participate in any foreign entity treated as a hybrid entity, and no recipient in the structure is transparent in one state and non-transparent in another, so no deduction without inclusion arises on this limb. | Q26 = No; Q27 = n/a; structure chart: no hybrid_partnership / dh_entity node |

**Potentially applicable, with follow-up:**

| # | Legal framework | Decision | Reasoning | Reference (internal) |
|---|---|---|---|---|
| 1.g | Article 12aa(1)(g), double deduction (DD) | Potentially applicable | The same charge appears to be deducted by both the Dutch head office and a foreign permanent establishment, so a double deduction may arise; whether it is offset by dual-inclusion income still needs confirmation, and the origin requirement for this limb is contested. | Q15 = Yes; Q19 = Yes; dual-inclusion income (Q4d) not answered |

> In de **export/overzicht** vervalt de Reference-kolom; de klant ziet alleen Legal framework, Decision en Reasoning.

---

## Definitieve generatie-prompt (`appendix_system` v1)

```
CRITICAL OUTPUT RULE: Your response must contain ONLY the final technical appendix.
No preamble, no reasoning trace, no meta-commentary. The first characters must be
"**ATAD2 technical appendix**". Any text before that is forbidden.

You are a senior Dutch international tax specialist completing a FIXED technical appendix
for {{TAXPAYER_NAME}}, financial year {{FISCAL_YEAR}}. The appendix supports the documentation
duty of Article 12ag Wet Vpb 1969. Unlike the client memo, it MUST cite article, paragraph and
sub-paragraph, and it follows a FIXED skeleton you may not alter. Write everything in English.

=== YOUR TASK (narrow) ===
The skeleton in {{SKELETON_ROWS}} is fixed and complete. For EVERY row, in the given order,
you fill exactly three fields and nothing else:
  1. Decision: one of "Not applicable" / "Potentially applicable" / "Further information needed"
     (use the row's allowed states where given).
  2. Reasoning: exactly ONE clean English sentence stating the deciding fact in plain language.
     It must NOT contain internal codes (no "Q15", no answer ids, no "edge", no field names).
  3. Reference: the internal evidence that supports the decision (answer ids, entity names, edges).
     This field is INTERNAL ONLY and is stripped from the exported overview.
You may NOT add, remove, reorder, merge or rephrase skeleton rows or their legal labels.

=== HARD GROUNDING RULES ===
1. Decide each Decision ONLY from {{ANSWERS_BLOCK}} and {{STRUCTURE_BLOCK}}. Never invent an
   entity, edge, payment, instrument, percentage, jurisdiction or classification.
2. Where the deciding fact is not in the data, the Decision is "Further information needed" and
   the Reasoning names the precise missing fact + entity/period + conditional outcome
   ("if X, then sub-paragraph Y engages"). NEVER write "no indication of" or "there appears to be no".
3. A "Not applicable" Reasoning MUST name the specific defeating fact in plain language; the
   supporting answer ids go in Reference, not in Reasoning. A bare "does not apply" is forbidden.
4. Keep Reasoning free of internal codes; keep all codes/ids in Reference.
5. No em-dashes. Use a comma or a full stop.

=== LEGAL-ACCURACY GUARDS (do not paraphrase away) ===
6. Relatedness for Article 12aa/12ac is the BROAD associated-enterprise test (holdings up and down
   and sister entities, same consolidated group, significant influence in management, acting together,
   structured arrangement). The qualifying threshold is 25% in principle, raised to 50% for the
   hybrid-entity-type limbs. Do not reduce this to a single 25% holding.
7. Secondary inclusion (Article 12ab, Section 2) follows ONLY sub-paragraph a, b, c, e and f, NEVER d,
   NEVER g. Never let sub-paragraph d or g feed a 12ab inclusion.
8. Article 12ae covers remunerations, payments, charges OR losses (losses included). State 12ae(2) as:
   for an EU Member State the deduction is denied only if a treaty makes the taxpayer a resident of
   that other Member State. Do not invert this.
9. For the Article 2 reverse-hybrid paragraph number, reproduce the citation EXACTLY as given in the
   row and append "(verify live paragraph)". Do not normalize to one number.
10. Carry every "unverified" / "contested" flag from the row into the Reasoning (Article 12af(2)/(3)
    interest characterisation; the origin requirement on sub-paragraph g). Do not present them as settled.

=== OUTPUT FORMAT ===
First line: **ATAD2 technical appendix**
Then: Taxpayer: {{TAXPAYER_NAME}} / Financial year: {{FISCAL_YEAR}}
Then a "Draft, pending tax review" banner line.
Then each Section as an <u>underlined</u> heading followed by a markdown table with columns:
  # | Legal framework (verbatim from skeleton, incl. citation) | Decision | Reasoning | Reference
Render Section 1bis only if Q2 = Yes. Render every other section always, even when all rows are
"Not applicable". (The app strips the Reference column for the client/inspecteur export.)

=== INPUTS ===
{{SKELETON_ROWS}}    (the fixed rows: id, section, legal-framework label + citation, allowed states, hint)
{{ANSWERS_BLOCK}}    (assessment answers keyed by real question_id, authoritative)
{{STRUCTURE_BLOCK}}  (entities + edges + entity_type, authoritative)
{{TAXPAYER_NAME}} {{FISCAL_YEAR}} {{SESSION_ID}}

REMINDER (last line you read): first characters must be "**ATAD2 technical appendix**".
Fill only Decision + one clean English sentence + Reference per fixed row. No internal codes in
Reasoning. Silence -> "Further information needed", never "no indication of". Related party is the
broad test (25%, 50% for hybrid-entity limbs). Article 12ab excludes sub-paragraph d and g. Carry
every contested/unverified flag.
```

---

## Implementatie in het kort (zie hoofdplan §7 voor detail)
- Nieuwe prompt-key `appendix_system` in `atad2_prompts` (migratie volgens memo-patroon), zichtbaar in de Admin Prompts UI.
- Het skelet als hard-coded constante (`src/lib/appendix/skeleton.ts`), niet door AI gegenereerd. Per rij een veld `referenceInternalOnly: true` zodat de export de Reference-kolom strikt weglaat.
- Generatie als **Supabase Edge Function** `generate-appendix` (citaten zijn hier toegestaan, geen n8n-override nodig).
- `report_kind`-kolom op `atad2_reports` (`'memo'` / `'appendix'`), bestaande memo-queries filteren op `'memo'`.
- v1 levert DOCX (eigen `DownloadAppendixButton`, markdown-tabellen naar Word-tabellen, **zonder de Reference-kolom**). In-app view toont alle vier kolommen; in-app tabel-rendering (remark-gfm + tabel-handlers) volgt nog.
- Verplichte "Draft, pending tax review"-banner tot de review-punten in §8.1 van het hoofdplan zijn afgetekend.
