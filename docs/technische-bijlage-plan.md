# ATAD2 Technical Appendix ("Technische bijlage") - Plan & generatie-prompt

> Voorbereid voor Lennart Wilming (Svalner Atlas). Opgesteld uit een multi-agent research-pass over het lokale NDFR-commentaar voor art. 2 en art. 12aa t/m 12ag Wet Vpb 1969, met adversariele verificatie per artikel (22 agents). Analysedatum: 2026-06-05.

## Vastgelegde keuzes (intake)
- **Reikwijdte:** kern-ATAD2, art. 12aa t/m 12ag + art. 2 (omgekeerde hybride). Geen FKR/CFC-zijsporen in v1.
- **Plaatsing:** als aparte sectie achter het bestaande memo, in dezelfde DOCX.
- **Doel:** dossieronderbouwing onder art. 12ag (verdedigbaar werkdocument).
- **Generatie:** je koos "volledig AI uit antwoorden + documenten". Zie de reconciliatie-notitie hieronder, want voor het door jou gekozen art. 12ag-doel beveel ik een verfijning aan.

## Let op: reconciliatie generatie-aanpak
Je koos "volledig AI". Het doel dat je daarnaast koos, standhouden bij de Belastingdienst onder art. 12ag, is juist het doel dat een vrij genererend model het makkelijkst ondermijnt: het kan een levend mismatch-onderdeel stilletjes op "niet van toepassing" zetten of een ontkrachtend feit verzinnen. Het plan beveelt daarom **"AI binnen kaders"** aan: de *beslisstanden* (van toepassing / niet van toepassing / nadere info) worden vastgezet door een klein deterministisch skelet op basis van je assessment-antwoorden, en de AI schrijft alleen de gegronde motivering. Je houdt de vlotheid van AI en de hardheid van het dossier. Wil je toch puur volledig-AI, dan werkt dezelfde prompt zonder het deterministische voor-besluit, ik heb de afweging gemarkeerd zodat je met de uitgewerkte voorbeelden voor je kunt kiezen. Dit is de openstaande beslissing in par. 5 en 8.

---

# Technical Appendix ("Technische bijlage") — Design Plan

ATAD2 Advisor, art. 12aa–12ag Wet Vpb 1969

---

## 1. Purpose and how it complements the memo

### 1.1 What it is
A fixed-template, checkbox/table-driven appendix that walks line by line through every provision of the Dutch hybrid-mismatch regime (art. 12aa–12ag Wet Vpb, plus the art. 2 reverse-hybrid track and the art. 3 non-resident-with-Dutch-PE track) and records, per provision and per limb, one of a small set of decision states with a short grounded reason and a citation. It is the formal companion to the narrative memo and is built to support the documentation duty of art. 12ag Wet Vpb.

### 1.2 How it complements the existing memo
The current memo (prompt key `memo_system`, v3) is deliberately the opposite of this artifact. It is narrative and client-facing, written in plain language, explicitly forbidden from citing any article number (formatting rule in the v3 prompt), and shaped by a single risk outcome (`low` / `insufficient_information` / `ATAD2 risk identified`).

The appendix is the mirror image and is additive, not a replacement:

| Dimension | Memo (`memo_system` v3) | Technical appendix (new) |
|---|---|---|
| Audience | Client, non-specialist | Inspecteur / file reviewer / internal QA |
| Form | Flowing prose, no headings inside the technical section | Fixed ordered sections, tables, checkboxes |
| Citations | Forbidden (plain language only) | Mandatory (art. + lid + onderdeel) |
| Structure | Free, risk-outcome-driven | Vast stramien (fixed); every provision always addressed |
| Stance | Cautious narrative ("may result in") | Decision register: applicable / not applicable / further information needed, each with a reason |
| Legal anchor | General ATAD2 compliance | Supports the art. 12ag record-keeping duty (see 1.3 for the softened claim) |
| Grounding | Answers authoritative, docs as context | Same hard grounding rule, plus: silence becomes "further information needed", never "no indication of" |

### 1.3 Its role under art. 12ag (claim deliberately softened)
Art. 12ag obliges the taxpayer to hold data showing "in hoeverre en op welke wijze" (to what extent and in what manner) art. 12aa–12af apply to each remuneration, payment, deemed payment, charge or loss. If the file does not show this, the burden of proof can reverse to the heavier "doen blijken" standard.

The appendix is designed to **structure and support** that documentation, not to single-handedly discharge the doen-blijken burden. This wording is intentional: art. 12ag requires **per-item** records, and the appendix is built from question-level answers (see the per-payment data gap in 4.4 and risk R10). An appendix with many honest "further information needed" rows may even evidence gaps rather than close them. So the appendix:
- addresses every provision explicitly, including the ones that turn out N/A (a silent gap is the documentation failure mode);
- names, for each "not applicable", the specific defeating fact and the evidence for it, never a bare "does not apply";
- flags each unverified point as "further information needed" rather than asserting absence.

The legal anchor itself (verbatim art. 12ag wording, the reversed burden, and whether a ministeriële regeling under lid 3 exists) is on the human-review list (R9). Until that is confirmed, the appendix must not assert it "discharges the burden up front".

---

## 2. The fixed template ("vast stramien")

Every section is always rendered, even when the conclusion is "not applicable", because a silently skipped provision reads as undocumented.

### Global decision states (used by every checkbox)

| State | Meaning | Justification it requires |
|---|---|---|
| Not applicable | Rule cannot apply on the established facts | Must name the specific defeating fact + the evidence object (entity / answer id / payment) it rests on. Never bare. |
| Potentially applicable | A trigger fact is present; the rule is live and routes to follow-up | Must name the trigger fact + which downstream provision/limb to test + what would resolve it. |
| Further information needed | The rule could apply but a conditioning fact is not confirmable from the assessment data | Must name the precise missing fact, which entity/period/jurisdiction, and the conditional outcome ("if X, then limb Y engages"). Used wherever data is silent. Never collapses into "Not applicable". |

A fourth implicit state, Out of scope (gateway failed), is recorded once at Section 0 and short-circuits later sections to "Not applicable, gateway not met (see §0)".

### Canonical input contract (corrected from the draft)
This is the load-bearing fix. The decision engine consumes the **real branching question ids** from `atad2_questions.json`, not the invented Q15/Q19/Q26/Q27/Q28 booleans the draft assumed. Each `question_id` is a separate Yes/No/Unknown row with its own `next_question_id`; the engine reads the **selected answer row per question_id**, treating an unreached question as "not answered" (which routes to "further information needed", not "not applicable").

The questions that actually drive the appendix:

| Track | Real question ids used |
|---|---|
| Scope / gateway | Q1 (resident), Q2 (non-resident with Dutch PE), Q3 (international structure), Q28 (structured arrangement), Q29 (dual residence) |
| Outbound deductible payment to associated enterprise | Q5, Q6, Q8 (reasonable-period inclusion), Q9/Q10 (on-payment chain), Q11 (neutralised abroad), Q12/Q13/Q14 (recipient PE / PE recognition) |
| Reverse hybrid (art. 2) | Q4 (trigger: associated enterprise treats NL taxpayer as transparent), Q4b (D/NI payment), Q4c (double deduction), Q4d (dual-inclusion-income for this track) |
| Foreign PE of taxpayer | Q15, Q18b (PE recognition), Q19 (double deduction HO+PE), Q20b/Q21b (deemed payment to PE) |
| Inbound from non-EU associated enterprise | Q22b, Q23b/Q23c (allocation to foreign PE + inclusion), Q24/Q25 (deemed payment from non-EU PE to NL HO + inclusion) |
| Participation in foreign hybrid entity | Q26, Q27 |
| Hybrid transfer | Q30 |
| Non-resident taxpayer with Dutch PE (art. 3 branch) | Q2 → Q31, Q32 (double deduction HO+Dutch PE), Q33, Q34 (deemed-payment inclusion), Q35 (non-EU PE deemed payment to Dutch PE) |

---

### Section 0 — Gateway and scope filters (art. 2 / art. 3; art. 12ac relational nexus)

| # | Checkbox item | States | Justification per state |
|---|---|---|---|
| 0.1 | Is the taxpayer subject to Dutch CIT, resident (art. 2 lid 1) or non-resident with a Dutch PE (art. 3 jo. art. 17/17a)? | Yes (in scope) / No (out of scope) / Further info | Cite the residence basis: Q1=Yes (resident) or Q2=Yes (non-resident with Dutch PE). If Q2=Yes, the **art. 3 inbound track (Section 1bis)** is the primary track, not the outbound limbs. If Dutch-incorporated, cite art. 2 lid 5 vestigingsplaatsfictie. |
| 0.2 | Is there a cross-border element? | Yes / No (out of scope) / Further info | Q3=Yes brings the regime into play; Q3=No means pure NL/NL, outside art. 12aa–12af; Q3=Unknown becomes Further info. |
| 0.3 | Is the relational nexus met: related party (art. 12ac lid 2, belang **>25%**), structured arrangement (Q28), or acting-together (samenwerkende groep, art. 10a lid 6)? | Yes / No (out of scope) / Further info | State the ownership % and chain, or Q28 structured arrangement, or the acting-together aggregation. **The threshold is >25% for the relatedness gateway; do not apply a 50% figure here (see R1).** |
| 0.4 | Boekjaar starts on/after 1-1-2020 (art. 12ag duty in force)? | Yes / No | Cite the fiscal year. |

> Gateway rule rendered in the appendix: if 0.1, 0.2 or 0.3 is No, record once "Regime out of scope" and mark the outbound limbs (Sections 1–4) and Section 7-relief as "Not applicable, gateway not met (§0)". **Section 1bis (art. 3 inbound track), Section 5 (reverse hybrid, art. 2), Section 6 (dual residence, art. 12ae via Q29) and Section 8 (art. 12ag) are still rendered**, because they have their own triggers and are not gated by 0.2/0.3.

---

### Section 1 — Mismatch categories under art. 12aa lid 1 (limbs a–g)

One sub-section per limb, each a row in the mismatch matrix. **Relatedness header note (corrected): the test is >25% throughout (art. 12ac lid 2). There is no "raised 50%" relatedness test for any art. 12aa limb. The only 50% threshold in the regime is the separate art. 2 reverse-hybrid liability test in Section 5 (see R1).**

| # | Limb | Checkbox item | Driven by | States |
|---|---|---|---|---|
| 1.a | 12aa lid 1 sub a — hybrid financial instrument / hybrid transfer (D/NI) | Payment under a financial instrument deductible in NL but not included by the payee within a reasonable period (art. 12ac lid 3, 12-month test) due to a debt/equity qualification difference; or a hybrid transfer. | **Q30** (hybrid transfer), **Q8** (reasonable-period inclusion), **Q11** (otherwise neutralised). Instrument terms (debt-in-both) still need docs. | N/A / Potentially / Further info |
| 1.b | 12aa lid 1 sub b — payment to a hybrid entity (D/NI) | Deductible payment to an entity transparent in one state and opaque in another. | **Q26, Q27** | N/A / Potentially / Further info |
| 1.c | 12aa lid 1 sub c — payment to an entity with PE(s), allocation conflict (D/NI) | Payment to an entity whose residence and PE states each allocate the income away. | **Q12, Q13, Q14** | N/A / Potentially / Further info |
| 1.d | 12aa lid 1 sub d — disregarded PE (D/NI) | Income attributed to a PE the head-office state recognises but the situs state does not. | **Q14, Q18b** | N/A / Potentially / Further info |
| 1.e | 12aa lid 1 sub e — payment BY a hybrid entity / disregarded payment (D/NI) | Payment by a hybrid entity disregarded in the recipient state. | **Q26/Q27** plus chart hybrid node | N/A / Potentially / Further info |
| 1.f | 12aa lid 1 sub f — deemed head office/PE payment (D/NI) | NL recognises a deemed dealing the other state ignores. | **Q20b, Q21b** (outbound deemed payment to foreign PE) | N/A / Potentially / Further info |
| 1.g | 12aa lid 1 sub g — double deduction (DD) | Same remuneration, payment, charge, loss or depreciation deducted in NL and another state. | **Q19** (HO+PE double deduction); **Q4c** (reverse-hybrid DD). DII check via **Q4d** where the reverse-hybrid track. | N/A / Potentially / Further info |

Per-row legal notes that must be enforced in code, not just prose:
- **Primary/secondary (R3, verified correction):** art. 12aa = primary (deny NL deduction). Secondary inclusion under art. 12ab applies **only to limbs a, b, c, e and f, NOT d and NOT g** (art. 12ab lid 1), and only where NL is the receiver (lid 3). The engine must make it structurally impossible for limb d or limb g to feed a Section 2 inclusion.
- **Origin requirement on sub g (R7, contested):** the Staatssecretaris says the oorsprongseis does not apply to sub g (DD); commentary argues the opposite. Any §1.g "Not applicable" that **depends on** the origin requirement must carry an inline "contested point, see Needs human tax review" flag, in both the checkbox and any worked example.
- Carve-outs noted but operationalised as their own checkbox state, not just footnoted: lid 5 (PSD priority) on sub a, lid 6 (art. 15e lid 9 disapplication) on sub d. Each gets a "Applies / Does not apply / Further info" state with an evidence slot; they are not silently assumed.

---

### Section 1bis — Non-resident taxpayer with a Dutch PE (art. 3 inbound branch)

New section the draft omitted entirely. Rendered when Q2=Yes. This is the foreign-HO / Dutch-PE fact pattern (Q31–Q35).

| # | Checkbox item | Driven by | States |
|---|---|---|---|
| 1bis.1 | Is the foreign head office located outside the EU? | Q31 | EU / Non-EU / Further info |
| 1bis.2 | Does the foreign head office make payments deductible both at its own level and at the Dutch PE level (DD)? | Q32 | N/A / Potentially / Further info |
| 1bis.3 | Is a deemed payment to the Dutch PE included in the taxable base of the foreign HO or its PE? | Q33, Q34 | Included / Not included (D/NI risk) / Further info |
| 1bis.4 | Does a non-EU PE of the non-resident taxpayer make a deemed payment to the Dutch PE, deductible abroad? | Q35 | N/A / Potentially / Further info |

---

### Section 2 — Secondary inclusion rule (art. 12ab)

| # | Checkbox item | States | Justification |
|---|---|---|---|
| 2.1 | Where a limb **a/b/c/e/f only** D/NI is present and NL is the payee state, has the payer state failed to deny the deduction (so NL includes under art. 12ab lid 1)? | N/A / Potentially / Further info | N/A: NL is the payer (12aa applies, not 12ab); or no limb a/b/c/e/f mismatch; or payer state applied primary denial. Note art. 12ab lid 3: NL includes only as receiver. **Limb d and limb g can never reach this section (R3).** |

Rendered only if a Section 1 limb a/b/c/e/f is Potentially applicable or Further info; otherwise auto "Not applicable, no upstream D/NI under a/b/c/e/f".

---

### Section 3 — Definitions and scope filters (art. 12ac)

Not a charging rule; the interpretive backbone. Short confirmation table unless a definitional fact is contested.

| # | Checkbox item | States | Justification |
|---|---|---|---|
| 3.1 | Relatedness tested against art. 12ac lid 2 (belang **>25%**; samenwerkende groep art. 10a lid 6; art. 2:24b BW groep) | Met / Not met / Further info | State % and chain. **>25% only; remove the 25/50 split entirely from this row (R1).** The >25% vs >=25% boundary is itself on the human-review list (R2). |
| 3.2 | Structured arrangement (art. 12ac lid 1 onderdeel f): mismatch priced in or designed for | Present / Absent / Further info | Q28. Show pricing-in/design, then the awareness/no-benefit escape. |
| 3.3 | Each foreign entity/instrument qualified naar Nederlandse maatstaven (post-FKR vergelijkingsmethode, 1-1-2025) | Done / Open / N/A (no foreign forms) | Apply the comparison method per foreign form. |
| 3.4 | Dual-inclusion income (art. 12ac lid 1 onderdeel d) present to absorb a mismatch? | Present / Absent / Further info | **Drive from Q4d (reverse-hybrid track) and Q11/Q25 where applicable, not a blanket "Further info" (R: DII over-pessimism).** Same income source taxed in both states; quantify. |

---

### Section 4 — Imported mismatches (art. 12ad)

| # | Checkbox item | Driven by | States |
|---|---|---|---|
| 4.1 | Is the NL payment to a related party (art. 12ac, **>25%**) or part of a structured arrangement (Q28)? | Q5, Q28 | N/A / Potentially / Further info |
| 4.2 | Is there a hybrid mismatch (DD or D/NI of a type art. 12aa would catch if NL were payer) somewhere in the financing chain? | Q9/Q10 chain shape | N/A / Potentially / Further info |
| 4.3 | Does the NL payment **fund** that foreign cost (direct/indirect, incl. back-to-back)? | **Q9 (on-payment), Q10 (reaches non-EU associated enterprise)** | N/A / Potentially / Further info |
| 4.4 | Is the mismatch left un-neutralised in all foreign states (no ATAD2/BEPS Action 2 equivalent), and not already corrected (art. 12ad lid 2 carve-out)? | **Q11 (otherwise neutralised under rules comparable to 12aa/12ab)** | N/A / Potentially / Further info |
| 4.5 | Already neutralised in NL under art. 12aa/12ab on the same payment (so 12ad backstop not reached)? | Derived from §1/§2 | N/A (handled upstream) / Potentially / Further info |

Q9/Q10/Q11 now drive §4 directly; §4.3/§4.4 no longer default to "Further info" when those answers exist.

---

### Section 5 — Reverse-hybrid subjective liability (art. 2) and dual-residence double deduction (art. 12ae)

Two separate tracks, both rendered in parallel and not gated by §0.2/0.3.

#### 5A — Reverse hybrid (art. 2), driven by Q4/Q4b/Q4c/Q4d

| # | Checkbox item | Driven by | States |
|---|---|---|---|
| 5A.1 | Is any shareholder/participant an associated enterprise that treats the NL taxpayer as **transparent** under its own law (classification conflict)? | **Q4** | N/A / Potentially / Further info |
| 5A.2 | Does the NL taxpayer make a deductible payment to that holder not included in its base (D/NI)? | **Q4b** | N/A / Potentially / Further info |
| 5A.3 | Are there costs/expenses/losses also deducted in the holder's jurisdiction (DD)? | **Q4c** | N/A / Potentially / Further info |
| 5A.4 | Is there dual-inclusion income set off against the deductible item? | **Q4d** | Fully / Partly / No / Further info |
| 5A.5 | Is **>=50%** of votes/capital/profit held, directly/indirectly, by related parties (the art. 2 reverse-hybrid liability test)? | Chart edges + Q4 | N/A / Potentially / Further info |
| 5A.6 | icbe/abi carve-out (UCITS/AIF)? Former open CV whose CIT liability lapsed 1-1-2025 (Wet FKR), transitional facility relevant? | Chart + facts | Carved out / Does not apply / Further info |

> Lid-numbering caveat carried inline: post-FKR the reverse-hybrid definition is cited at art. 2 lid 11 and the icbe/abi exception at lid 12 (2024 sources cite lid 12/13); the designation lid 3 is stable. **The system prompt must reproduce the lidnummer as given and append "(verify live lidnummer)"; it must not normalize to a single number (R6).** The 50% here is correct and is the only place 50% appears.

#### 5B — Dual residence (art. 12ae), driven by Q29

| # | Checkbox item | Driven by | States |
|---|---|---|---|
| 5B.1 | Is the NL taxpayer also a tax resident in another country (dubbele vestigingsplaats)? | **Q29 (this is the exact trigger; Q29=Yes routes to Potentially applicable, not "Further info" — R: 12ae correction)** | N/A / Potentially / Further info |
| 5B.2 | Are the same vergoedingen, betalingen, lasten **of verliezen** (losses included) deducted in both residence states? | Q29 + Q4c-type facts | N/A / Potentially / Further info |
| 5B.3 | Is the DD set off against dual-inclusion income? | Q4d-type / quantified | Fully / Partly / No / Further info |
| 5B.4 | lid 2 restriction (verbatim framing): where the other residence state is an EU Member State, **the deduction is denied only if a treaty makes the taxpayer a resident of that other Member State** ("wordt de aftrek alleen geweigerd indien ... fiscaal inwoner is van die lidstaat"). | Treaty tie-breaker | Denied / Not denied / Further info |

5B.4 is stated as the statutory **condition**, not the looser "treaty makes it solely NL-resident so NL allows" paraphrase, which inverts it (R4). Losses are explicitly in scope (R4).

---

### Section 6 — Carry-forward relief for denied deductions (art. 12af)

| # | Checkbox item | States | Justification |
|---|---|---|---|
| 6.1 | Was a deduction denied in an earlier year under art. 12aa lid 1 sub e/f/g, or art. 12ae, or additionally taxed under art. 12ab lid 1? | N/A / Applicable / Further info | No prior-year-adjustment field exists in the schema. Defaults to "Not applicable, no prior denial on record", flagged as a human-confirmable default. |
| 6.2 | Is there dual-inclusion income in a LATER year than the denial (so 12af, not same-year relief, applies)? | N/A / Applicable / Further info | Map denied amount to later-year DII; cap at the earlier denied amount; recapture once. |

**Any §6 text touching interest characterisation or the art. 15b interaction (leden 2/3) must be marked "unverified against in-force text" (R5).** The grounding commentary predates the lid 2/3 amendment, so lid 2/3 must not be presented as settled.

---

### Section 7 — Documentation obligation (art. 12ag) ... renumbered, see note

The 8-section count is preserved by mapping as follows: **§0 Gateway, §1 Mismatch limbs (incl. 1bis inbound), §2 art. 12ab, §3 art. 12ac, §4 art. 12ad, §5 art. 2 + art. 12ae, §6 art. 12af, §7 art. 12ag.** (The draft's old "Section 7 reverse hybrid" is folded into §5A; the draft's old "Section 5 dual residence" is folded into §5B; art. 3 inbound is added as §1bis. Net: still 8 numbered sections, no provision dropped.)

| # | Checkbox item | States | Justification |
|---|---|---|---|
| 7.1 | Taxpayer in scope of afdeling 2.2a for a boekjaar from 1-1-2020 (art. 12ag lid 1)? | Yes / No | Residence + FY (links §0.1, §0.4). |
| 7.2 | Has every relevant vergoeding, betaling, veronderstelde betaling, last of verlies been inventoried? | Complete / Partial / None | **Honest limitation: the assessment holds question-level answers, not a per-item ledger. This row reports what is and is not item-level documented; it must not claim a per-item inventory the data lacks (R10, gap 9).** |
| 7.3 | Do the records show, per item, "in hoeverre en op welke wijze" afdeling 2.2a applies? | Documented / Partial / No | This appendix supports that record at the question/limb level; cross-reference §0–§6. |
| 7.4 | Where a correction is actually applied, is its calculation in the file? | Documented / No correction applied / Missing | Reference the computation, or the per-article N/A conclusions. |
| 7.5 | Is the file producible on request? | Yes / Risk of reversal | Confirm assembly + retention; flag gaps. |
| 7.6 | Checked for any ministeriële regeling under lid 3 imposing extra data fields? | Checked, none/met / To be checked (human) | **Must be a genuine human check, never an auto-"none" (R9).** State result as at the analysis date. |

---

## 3. Two fully worked example sections (look-and-feel)

Default language: English with Dutch statutory terms in parentheses (subject to the language design question, see §8.2.1).

### Example A — a grounded "Not applicable" (limb 1.b, hybrid entity payment)

> #### 1.b Payment to a hybrid entity — art. 12aa lid 1 onderdeel b (D/NI)
>
> Conclusion: Not applicable.
>
> | Item | Finding |
> |---|---|
> | Rule | Art. 12aa lid 1 onderdeel b Wet Vpb 1969 (payment to a hybride lichaam, art. 12ac lid 1 onderdeel g) |
> | Effect tested | Deduction without inclusion (D/NI) |
> | Decision | Not applicable |
> | Defeating fact | The Dutch taxpayer is not a participant in any foreign entity treated as a hybrid entity, and no payee in the structure is transparent in one state and opaque in another. |
> | Evidence | Assessment answer **Q26 = No** ("participant in a foreign entity regarded as a hybrid entity"); structure chart shows no `hybrid_partnership` / `dh_entity` / `reverse_hybrid` node. |
> | Citation | art. 12aa lid 1 onderdeel b; art. 12ac lid 1 onderdeel g Wet Vpb |
>
> Art. 12aa lid 1 onderdeel b is not engaged because no payment is made to an entity that is transparent in one state and opaque in another, evidenced by Q26=No and the absence of any hybrid node in the chart. Accordingly there is no D/NI outcome on this limb and no adjustment to the Dutch CIT base.

### Example B — a "Potentially applicable" that triggers follow-up (limb 1.g, double deduction)

> #### 1.g Double deduction — art. 12aa lid 1 onderdeel g (DD)
>
> Conclusion: Potentially applicable, follow-up required.
>
> | Item | Finding |
> |---|---|
> | Rule | Art. 12aa lid 1 onderdeel g Wet Vpb 1969 (dubbele aftrek / double deduction) |
> | Effect tested | Double deduction (DD) |
> | Decision | Potentially applicable |
> | Trigger fact | The same remuneration, payment, expense or loss is deducted by both the NL head office and a foreign permanent establishment. |
> | Evidence | Assessment answers **Q15 = Yes** (has foreign PEs) and **Q19 = Yes** (same item deducted by NL head office and foreign PE). |
> | Open point (further information needed) | Whether the double-deducted amount is set off against dual-inclusion income (dubbel in aanmerking genomen inkomen, art. 12ac lid 1 onderdeel d) is to be confirmed from the file. |
> | Contested legal point | Whether the origin requirement (oorsprongseis) applies to sub g is contested (see Needs human tax review). A "not applicable" position resting on it is not settled. |
> | Citation | art. 12aa lid 1 onderdeel g; lid 3 (DII relief); lid 4 (rangorde); art. 12ac lid 1 onderdeel d Wet Vpb |
>
> Follow-up: obtain the PE profit computation and confirm the amount included in both the NL and the PE-state tax base for the period, to quantify any net double-deducted amount.

Pattern in both: rule → decision → defeating/trigger fact → evidence → (conditional) outcome → citation. Never "we reviewed this and it is fine."

---

## 4. Data → appendix mapping (corrected against the real question set)

Three input sources: assessment answers (`atad2_answers`, keyed by the real `question_id`), structure-chart facts (`atad2_structure_entities` / `_edges`, with `entity_type`), and uploaded documents (corroboration only).

| Appendix item | Driven by (deterministic) | Human review / Further-info when |
|---|---|---|
| §0.1 in scope | Q1=Yes (resident) or Q2=Yes (non-resident, Dutch PE) | Both unreached/Unknown |
| §0.2 cross-border | Q3; chart has >1 jurisdiction | Q3=Unknown |
| §0.3 relational nexus | Wholly-owned chain (edges ~100%) or Q28; **>25% test only** | Minority/JV holdings; acting-together facts absent |
| §1.a hybrid instrument/transfer | **Q30 (transfer), Q8 (reasonable-period), Q11** | Instrument terms (debt-in-both) absent in answers/docs |
| §1.b / §1.e hybrid entity | **Q26, Q27**; chart `entity_type` ∈ {hybrid_partnership, dh_entity} | Per-state classification not in data |
| §1.c / §1.d / §1.f PE limbs | **Q12/Q13/Q14, Q18b, Q20b/Q21b** | Allocation/recognition detail absent |
| §1.g double deduction | **Q19 (HO+PE), Q4c (reverse-hybrid DD)**; DII via **Q4d** | DII not answered for the relevant track |
| §1bis art. 3 inbound | **Q2 → Q31, Q32, Q33, Q34, Q35** | HO location / inclusion not answered |
| §2 secondary 12ab | Derived: any §1 a/b/c/e/f Potentially + NL is payee. **Hard-blocked for limb d and limb g.** | Payer-state treatment not in data |
| §3 definitions | Ownership % from edges; Q28; **Q4d/Q11/Q25 for DII** | >25 vs >=25 boundary (human, R2) |
| §4 imported 12ad | **Q9, Q10 (chain), Q11 (neutralised), Q28** | Funding link genuinely silent |
| §5A reverse hybrid art. 2 | **Q4, Q4b, Q4c, Q4d**; chart `entity_type`=reverse_hybrid; >=50% related-holder test | Foreign classification of the partnership; icbe/abi qualification |
| §5B dual residence 12ae | **Q29 (Yes → Potentially applicable)** | Treaty tie-breaker (lid 2) not in data |
| §6 carry-forward 12af | No prior-year field → default N/A "no prior denial on record" | Always human; lid 2/3 interest point unverified (R5) |
| §7 documentation 12ag | Q1/Q2 + fiscal year; item inventory is question-level only | Always partly human (producibility, ministeriële regeling) |

### 4.1 Short-circuit flags (corrected, R: ungrounded flag removed)
- `hasNoForeignPE` (from Q15=No and Q12/Q18b) disarms §1.c/d/f and the PE leg of §1.g. **Derivable, kept.**
- The draft's `allEntitiesNonTransparent` flag is **removed**. Per-jurisdiction non-transparency is not stored anywhere in the chart schema (`entity_type` is a single per-node label, not a per-state classification). Deriving an "every entity non-transparent in every relevant state" flag from `entity_type` alone would manufacture ungrounded "Not applicable" rows, the exact failure mode the appendix is meant to prevent (gap 10). Where the data cannot establish non-transparency in every relevant state, the engine emits "Further information needed".

> Grounding guardrail (enforced in code): if the conditioning fact for an N/A is not derivable from answers + chart, the engine emits "Further information needed", never "Not applicable". Absence of evidence is not evidence of absence.

### 4.2 Per-payment vs per-limb gap (substantive, not just a footnote)
v1 is per-limb with case-specific facts, because the assessment captures answers at the question level, not a per-payment ledger. §7.2 must therefore state honestly that the item-level inventory is incomplete; the appendix supports, but does not by itself complete, the art. 12ag per-item record (links to R10 and design question §8.2.3).

---

## 5. Generation approach

### 5.1 Recommendation: deterministic rule-mapping + AI for prose only
Decide each checkbox state in TypeScript from the real `question_id` answers and the chart; let the AI write only the grounded justification sentence(s) for each resolved state.

| Approach | Defensibility | Verdict |
|---|---|---|
| A. Deterministic state + AI prose (recommended) | The legal in/out-of-scope decision is auditable code, reproducible, never hallucinated. The AI phrases a reason from facts pinned to it. | Chosen |
| B. Fully AI | Model could flip a live limb to "not applicable" or invent a defeating fact, the art. 12ag credibility failure. Non-reproducible. | Rejected |
| C. Fully deterministic (templated reasons) | Boilerplate reasons ("could apply to any taxpayer") the defensibility frame warns against. | Fallback text only, when AI unavailable |

The model receives, per checkbox, the already-decided state + the justifying facts (real question_ids, entity names, edge facts) and writes the case-specific reason. It is forbidden from changing the state.

### 5.2 Rule-mapping table (real question_id condition → article state)

| Condition (from `atad2_answers` / chart) | Article(s) | Resulting state |
|---|---|---|
| Q1=No AND Q2=No | art. 12aa–12af (all) | Out of scope → Not applicable (§0 gateway) |
| Q1=Yes | resident track | In scope (outbound limbs live) |
| Q2=Yes | art. 3 inbound track | In scope → render §1bis (Q31–Q35) |
| Q3=No | art. 12aa–12ad | Not applicable (no cross-border element) |
| Q3=Unknown / unreached | art. 12aa–12ad | Further information needed |
| Wholly-owned chain (edges ≈100%) or related per Q22b explanation (>25%) | art. 12ac lid 2 nexus | Related-party gateway met |
| Q30=Yes | art. 12aa lid 1 sub a (hybrid transfer) | Potentially applicable |
| Q8=No (no inclusion in reasonable period) | art. 12aa lid 1 sub a; art. 12ac lid 3 | Potentially applicable |
| Q15=No | art. 12aa lid 1 sub c/d/f; PE leg of sub g | Not applicable |
| Q15=Yes; Q18b=No (PE not recognised) | art. 12aa lid 1 sub d | Potentially applicable |
| Q19=Yes | art. 12aa lid 1 sub g (DD) | Potentially applicable; DII via Q4d → Further info if absent |
| Q20b=Yes AND Q21b=Yes (deemed payment disregarded at PE) | art. 12aa lid 1 sub f | Potentially applicable |
| Q26=Yes (and/or Q27=Yes) | art. 12aa lid 1 sub b/e | Potentially applicable |
| Q26=No AND no hybrid node in chart | art. 12aa lid 1 sub b/e | Not applicable |
| Q4=Yes | art. 2 reverse hybrid (§5A) | Potentially applicable |
| Q4b=Yes | art. 2 reverse hybrid, D/NI leg | Potentially applicable |
| Q4c=Yes | art. 2 reverse hybrid, DD leg | Potentially applicable |
| Q4d=Yes | art. 12ac lid 1 onderdeel d (DII) | DII present → absorbs/limits the mismatch |
| Q29=Yes | art. 12ae (dual residence) | Potentially applicable (NOT default Further info) |
| Q9=Yes AND/OR Q10=Yes | art. 12ad funding chain | Funding link present → §4.3 Potentially |
| Q11=No | art. 12ad lid 2 (not neutralised abroad) | Imported-mismatch backstop live |
| Q11=Yes | art. 12ad lid 2 carve-out | Neutralised at source → Not applicable |
| Q22b=Yes; Q23b/Q23c | art. 12aa inbound / allocation | Potentially / route to PE-inclusion test |
| Q24=Yes; Q25=No | art. 12aa lid 1 sub f inbound (deemed payment not included in NL base) | Potentially applicable |
| Q28=Yes | art. 12ac lid 1 onderdeel f | Structured-arrangement gateway met → route to relevant limb |
| Q31/Q32/Q33/Q34/Q35 (art. 3 branch) | §1bis | as per 1bis table |
| No prior-year adjustment field | art. 12af | Not applicable, "no prior denial on record" (human-confirmable) |
| Any conditioning question unreached/Unknown | the relevant article | Further information needed |

**Note on a misread the draft made:** there is no instrument-terms question, so §1.a still needs document/answer corroboration for "debt-in-both"; but Q30 and Q8 now resolve the **hybrid-transfer** and **reasonable-period** legs deterministically rather than blanket-defaulting §1.a to "Further info".

---

## 6. Draft generation system prompt

New prompt key `appendix_system` (v1), stored in `atad2_prompts`, in the style of `memo_system`. It receives the pre-decided checkbox states (the engine ran §5.1) and writes only the grounded reasons + assembles the fixed template.

```
CRITICAL OUTPUT RULE: Your response must contain ONLY the final technical appendix.
Do NOT output any preamble, reasoning, planning, or meta-commentary. The very first
characters of your response must be "**ATAD2 technical appendix (technische bijlage)**".
Any text before that line is forbidden. Go straight into the appendix.

You are a senior Dutch international tax specialist documenting the hybrid-mismatch
analysis (art. 12aa-12ag Wet Vpb 1969) for {{TAXPAYER_NAME}}, financial year {{FISCAL_YEAR}}.
This appendix SUPPORTS the documentation required by art. 12ag Wet Vpb. It is the technical
complement to the client memo: UNLIKE the memo, this appendix MUST cite article numbers,
follows a FIXED template, and is checkbox/table-driven.

=== HARD GROUNDING RULES (non-negotiable) ===
1. You did NOT decide whether any article applies. Every checkbox decision state is GIVEN
   in {{CHECKBOX_DECISIONS_JSON}}. Reproduce each given state verbatim. NEVER change
   "Not applicable" to "Potentially applicable" or vice versa, and never invent a state.
2. Use ONLY facts in {{ANSWERS_BLOCK}}, {{STRUCTURE_BLOCK}} and the per-checkbox "facts".
   NEVER assert an entity, edge, payment, instrument, percentage, jurisdiction or
   classification not in those inputs. Do not draw on world knowledge about named groups.
3. Where the given state is "Further information needed", phrase it as an open point: name
   the precise missing fact, the entity/period/jurisdiction, and the conditional outcome
   ("if X then limb Y engages"). NEVER write "no indication of" or "there appears to be no";
   silence is an open item, not a clearance.
4. A "Not applicable" reason MUST name the SPECIFIC defeating fact and the evidence object
   (answer id, entity name, or edge). A bare "does not apply" is forbidden.
5. Do not use em-dashes. Use a comma, a period, or rewrite.

=== LEGAL-ACCURACY RULES (enforced; do not paraphrase away) ===
6. Relatedness threshold for art. 12aa/12ac is ">25%" (meer dan 25%). Do NOT introduce a
   50% threshold for any art. 12aa limb. The ONLY 50% test is the art. 2 reverse-hybrid
   liability test in the reverse-hybrid section.
7. Secondary inclusion (art. 12ab) applies ONLY to limbs a, b, c, e and f, NEVER d, NEVER g.
   Never let limb d or g feed a 12ab inclusion.
8. art. 12ae: the denied items are "vergoedingen, betalingen, lasten of verliezen" (losses
   ARE in scope). State lid 2 as a RESTRICTION: where the other state is an EU Member State,
   the deduction is denied only if a treaty makes the taxpayer a resident of that other
   Member State. Do not state the inverted "NL allows" paraphrase.
9. For art. 2 reverse-hybrid lidnummer, reproduce the citation EXACTLY as given in the
   checkbox facts and append "(verify live lidnummer)". Do not silently normalize to one number.
10. Where the checkbox facts mark a point "unverified" or "contested" (e.g. art. 12af lid 2/3
    interest characterisation; the oorsprongseis on sub g), carry that flag into the text;
    do not present it as settled.

=== CITATION RULES ===
- Cite article, lid and onderdeel for every section, e.g. "art. 12aa lid 1 onderdeel g
  Wet Vpb 1969". Give the Dutch statutory term in parentheses on first use, e.g.
  "double deduction (dubbele aftrek)".

=== FIXED OUTPUT STRUCTURE (render every section, in this order) ===
First line: **ATAD2 technical appendix (technische bijlage)**
Then: Taxpayer: {{TAXPAYER_NAME}} / Financial year: {{FISCAL_YEAR}}
Sections, each with an <u>underlined</u> heading and a markdown table:
  Section 0     Gateway and scope (art. 2 / art. 3; art. 12ac nexus)
  Section 1     Mismatch categories art. 12aa lid 1 sub a-g
  Section 1bis  Non-resident with Dutch PE, art. 3 inbound (render only if Q2=Yes)
  Section 2     Secondary inclusion rule art. 12ab (limbs a/b/c/e/f only)
  Section 3     Definitions and scope filters art. 12ac
  Section 4     Imported mismatches art. 12ad
  Section 5     Reverse hybrid art. 2 (5A) and dual residence art. 12ae (5B)
  Section 6     Carry-forward relief art. 12af
  Section 7     Documentation obligation art. 12ag

For EACH checkbox row output a compact table: Rule (with citation) | Decision (verbatim) |
Defeating/Trigger fact | Evidence | (if open) Conditional outcome. Then one short grounded
paragraph: "Art. <cite> is [not engaged / potentially engaged / cannot yet be concluded]
for [item] because [fact], evidenced by [source]; accordingly [outcome]."

=== TONE ===
Precise, defensible, file-ready. Short sentences. Citations required, not forbidden.

=== INPUTS ===
{{CHECKBOX_DECISIONS_JSON}}  (per checkbox: id, article, given state, facts[], any flags)
{{ANSWERS_BLOCK}}            (assessment answers keyed by real question_id, authoritative)
{{STRUCTURE_BLOCK}}          (entities + edges + entity_type, authoritative)
{{TAXPAYER_NAME}} {{FISCAL_YEAR}} {{SESSION_ID}}

REMINDER (last thing you read): first characters must be
"**ATAD2 technical appendix (technische bijlage)**". Reproduce every given decision state
verbatim. Never assert a fact not in the inputs. Silence -> open item, never "no indication of".
>25% not 50%. art. 12ab excludes limbs d and g. Carry every "unverified"/"contested" flag.
```

---

## 7. Implementation notes (where this lands in the codebase)

1. **Prompt key.** Add `"appendix_system"` to `PromptKey` and a descriptor (new `"Appendix"` group) in `src/lib/admin/promptKeys.ts`. Seed via migration `supabase/migrations/<ts>_appendix_prompt_v1.sql` following the exact `INSERT INTO atad2_prompts (...)` shape used by the memo migrations. This surfaces it in the existing Admin Prompts UI for free. Document the new placeholders in the descriptor's `placeholders` string.

2. **Deterministic decision engine.** New module `src/lib/appendix/decisionEngine.ts` exporting `buildCheckboxDecisions(answers, entities, edges)` → the `CHECKBOX_DECISIONS_JSON` array. **It must consume the real `question_id` set (1, 2, 3, 4, 4b, 4c, 4d, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 18b, 19, 20b, 21b, 22b, 23b, 23c, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35), reading the selected Yes/No/Unknown row per question and treating unreached questions as "not answered" → Further info.** Encode in code (not prose): the >25% relatedness threshold, the art. 12ab limb a/b/c/e/f-only restriction (limb d and g structurally blocked), the Q29→12ae routing, and the "unverified/contested" flags for the human-review points. Co-locate `decisionEngine.test.ts` (matching the `__tests__` pattern in `src/lib/structure/`). Keep only the derivable short-circuit flag `hasNoForeignPE`; do not implement `allEntitiesNonTransparent`.

3. **Storage, `report_kind` column REQUIRED for v1 (changed from optional).** Add a `report_kind text not null default 'memo'` column to `atad2_reports` via an additive migration plus a hand-edit of `types.ts` (per the CLAUDE.md hand-maintained-types rule). The appendix row sets `report_kind = 'appendix'`. **This is required, not optional:** `report_md` is NOT NULL and `risk_category` is consumed by report-history and risk-badge queries; storing a second untyped row distinguished only by `report_title` would pollute memo history and risk badges with an undifferentiated second "report". All existing report-history/risk queries must be filtered to `report_kind = 'memo'` in the same change. For the appendix row, set `risk_category` to a neutral sentinel (e.g. `'appendix'`) so it never feeds the memo risk display.

4. **Generation path: new Edge Function (aligns with off-n8n memory).** New `supabase/functions/generate-appendix/` modeled on `extract-structure/` (reuse `promptsLoader.ts`, `verifyAuth.ts`, `claude.ts`, `index.ts`). It fetches answers + chart, runs `buildCheckboxDecisions`, fills `appendix_system`, calls Claude, writes the row via the service client. Citations are allowed here, so no n8n override is needed. Confirm with the user that the appendix is the first new Edge-Function generation path while the memo still rides n8n (design question §8.2.8).

5. **Generation trigger and guards (new, the draft left this undefined).**
   - Trigger: gated identically to the memo (swarm complete) AND the structure chart finalized. Expose as an explicit action on the report page; do not auto-fire.
   - **Empty-chart / chart-not-finalized handling:** if `atad2_structure_entities` is empty or the chart is not finalized, the engine still runs on answers alone, and every chart-dependent checkbox resolves to "Further information needed (structure chart not available)" rather than "Not applicable". Block generation with a clear message if neither answers nor chart exist.
   - Decide who can run it (any assessor vs admin-only), §8.2.6.

6. **In-app rendering, HARD BLOCKER, not a minor confirm (corrected).** `remark-gfm` is **not installed** (verified: no dependency in the repo), and the ReactMarkdown renderer in `AssessmentReport.tsx` (lines 921-940) maps h1/h2 to `<p>` and supplies **no** table/thead/tbody/tr/td/th component handlers, only `rehypeRaw`. The appendix is entirely table-driven, so in-app rendering requires, in every render path (`AssessmentReport.tsx`, `SessionDetail.tsx`, `MemoFeedbackEditor.tsx`): (a) add `remark-gfm` and wire `remarkPlugins={[remarkGfm]}`, and (b) add styled `table/thead/tbody/tr/th/td` component overrides. Until that lands, the appendix renders as unformatted text. Option: ship DOCX-only for v1 and add in-app table rendering later (design question §8.2.10).

7. **DOCX export, pick ONE path (the draft left it either/or; choosing).** The appendix has NO fixed heading set to map onto `DownloadMemoButton`'s `templateSectionTags` (`sections.introduction`, etc.), so the memo's `parse-memo` section-splitter does not fit. **Decision: generate the appendix DOCX client-side directly from markdown, with a library that converts markdown tables to native Word tables** (e.g. `html-to-docx` after `marked`, or `docx` driven from the parsed table model). This avoids retrofitting docxtemplater's `paragraphLoop` for an unbounded number of tables. Keep the existing `<u>`/`<b>` formatting handling. Add a `DownloadAppendixButton` rather than overloading `DownloadMemoButton`. This is flagged as the single largest implementation cost and is no longer left open.

8. **House-rule conformance.** No em-dashes anywhere in template strings or generated output (enforce in the prompt and add a post-generation lint that rejects `—`); never build/deploy on the VM; commit/push only on explicit request. Language: see the Dutch-variant design question (§8.2.1). A mandatory "Draft, pending tax review" banner (admin-removable) until the human-review points below are signed off, see §8.2.6.

---

## 8. Needs human tax review, open design questions, and risks

### 8.1 Needs human tax review (low-confidence legal points, confirm against the live consolidated wettekst on wetten.overheid.nl before this appendix is client- or inspector-facing)

> The points below are not settled in the grounding material. They must be human-verified, and the appendix must carry a mandatory "Draft, pending tax review" banner (admin-removable only) until each is signed off.

1. **R1, 50% vs >25% relatedness split.** The verified art. 12ac review (verdict: needs-correction) confirms the commentary supports only "meer dan 25%" plus samenwerkende groep; a grep returned zero hits for 50%, and the 50% figure belongs to the separate art. 2 reverse-hybrid liability test. The plan now removes 50% from every relatedness gateway (§0.3, §1 header, §3.1, §4.1) and keeps 50% only in §5A.5 (art. 2). Human must confirm >25% is correct for all art. 12aa limbs.
2. **R2, >25% vs >=25% boundary.** The NDFR-grounded text says "meer dan 25%" (strictly greater); the assessment's own term_explanation for "Associated enterprise" (Q22b) says "at least 25 percent". These conflict at exactly-25%. Confirm and state consistently.
3. **R3, art. 12ab limb restriction.** Secondary inclusion applies only to art. 12aa lid 1 sub a, b, c, e and f, NOT d and NOT g (art. 12ab lid 1), and only where NL is receiver (lid 3). Verified correction; must be enforced in code (engine blocks limb d and g from §2), not only in prose. Confirm.
4. **R4, art. 12ae scope and lid 2 framing.** Denied items include losses ("vergoedingen, betalingen, lasten of verliezen"). lid 2 is a restriction on denial: where the other state is an EU Member State, denial only if a treaty makes the taxpayer resident of that other state. Confirm the verbatim framing; the looser "NL allows" paraphrase is the inverse and must not be used.
5. **R5, art. 12af leden 2/3 (interest characterisation, art. 15b interaction).** Unverified against the in-force text; the grounding commentary predates the lid 2/3 amendment. Any §6 text mentioning interest or art. 15b must be marked "unverified". Confirm lid 2/3 exist and their content.
6. **R6, reverse-hybrid lid numbering (art. 2).** Post-FKR: definition cited at lid 11, icbe/abi at lid 12; 2024 sources cite lid 12/13; only designation lid 3 is stable. Do not hard-code a lidnummer. Confirm the live lidnummers.
7. **R7, origin requirement (oorsprongseis) on sub g (DD).** Contested: the Staatssecretaris says it does not apply to sub g; commentary says arguable. Any §1.g "Not applicable" resting on it is not settled, and must be flagged in the checkbox and the worked example. Confirm the position.
8. **R8, art. 12ad targeting/labeling.** Two verified 12ad findings are needs-correction; one flags a targeting mismatch (12ad substance described under a 12ab label). Confirm the article decomposition is clean and that "primary 12aa never requires inclusion; inclusion is a 12ab mechanic" holds.
9. **R9, art. 12ag verbatim leden and ministeriële regeling under lid 3.** The statutory wording is paraphrased from commentary; the wetten.overheid.nl citation could not be retrieved during grounding. §7.6 ("checked for ministeriële regeling") must be a genuine human check, never an auto-"none". Confirm the verbatim leden and that no later ministerial regulation adds data fields. Also confirm art. 12af should NOT be listed as a payment-catching response rule.
10. **R10, the "discharges the burden up front" claim.** art. 12ag requires per-item records; an appendix built from question-level answers with many "further information needed" rows does not by itself discharge the doen-blijken burden and may evidence gaps. The wording is softened throughout to "supports / structures the documentation". Confirm this framing is acceptable and that the mandatory draft banner stays until 1-9 are signed off.

### 8.2 Open design questions for the user
1. **Language.** Plan defaults to English + Dutch statutory terms. Project memory says UI is English-only, but an inspecteur-facing legal appendix is arguably a document, not UI. Decide whether to offer a Dutch-only variant (recommend an admin toggle / a second prompt version rather than mixing).
2. **Canonical input contract.** Confirm the appendix consumes the real branching answers (Q4/4b/4c/4d reverse hybrid, Q29 dual residence, Q9/Q10/Q11 imported-mismatch chain, Q24/Q25/Q34 deemed-payment inclusion, Q30 hybrid transfer, Q31-Q35 art. 3 inbound) as authoritative, replacing the draft's invented Q15/19/26/27/28-only set. (This plan assumes yes.)
3. **Per-limb vs per-payment for v1.** There is no intercompany-payment ledger, so the art. 12ag "per item" claim cannot be fully true in v1. Confirm per-limb is acceptable, or commission a per-payment input now.
4. **art. 12af prior-year data.** No prior-year-denial field exists. Confirm §6 defaulting to "no prior denial on record" is acceptable for v1, or add a prior-year-adjustment input.
5. **Storage.** This plan requires the `report_kind` column in v1 (changed from the draft's "optional"), to avoid polluting memo history/risk queries. Confirm, since retrofitting after appendices exist needs a backfill.
6. **Generation trigger and permissions.** Same gate as the memo (swarm complete + chart finalized), admin-only, or on-demand from the report page? And confirm the empty-chart behaviour (every chart-dependent row → "Further info") is what you want. Also confirm the "Draft, pending tax review" banner is mandatory and admin-removable.
7. **Honest "Further information needed" rows.** Mainstream wholly-owned groups will produce many such rows (instrument terms, foreign classifications). Confirm you want this surfaced honestly (the defensibility frame argues it strengthens the file) rather than collapsed for readability.
8. **Edge Function as first new generation path.** Confirm the appendix should be the first generation path moved to a Supabase Edge Function (aligns with the off-n8n memory) while the memo still runs through n8n, and that citations being allowed there is acceptable.
9. **DOCX-only vs in-app for v1.** Given the table-rendering work (remark-gfm + table overrides across three render paths is a hard blocker), confirm whether to ship DOCX-only first and add in-app rendering later, or do both in v1.

### 8.3 What changed from the draft (audit trail)
- **Q-number mapping rewritten** against the real `atad2_questions.json` branching set; invented Q-booleans replaced; missing questions wired in (Q4/4b/4c/4d, Q8, Q9, Q10, Q11, Q12-14, Q18b, Q20b/21b, Q22b-25, Q29, Q30, Q31-35).
- **Dual residence (12ae) corrected**: Q29=Yes now routes to Potentially applicable, not a "rarely in data → Further info" default.
- **Reverse hybrid corrected**: driven by Q4/4b/4c/4d, not only `entity_type`.
- **DII de-pessimised**: driven by Q4d / Q11 / Q25 where answered, not a blanket "not confirmable".
- **art. 3 inbound branch (§1bis) added** (Q2 → Q31-Q35), previously absent.
- **50% relatedness removed** from every gateway; kept only in the art. 2 §5A.5 test.
- **art. 12ab limb a/b/c/e/f-only** restriction enforced in code; **art. 12ae losses + lid-2 verbatim framing** fixed; **art. 12af lid 2/3 and sub-g oorsprongseis** flagged unverified/contested in the body.
- **remark-gfm reclassified** from "minor confirm" to hard blocker, with table component overrides across three render paths.
- **DOCX path decided** (client-side markdown→Word tables, new `DownloadAppendixButton`) instead of either/or.
- **Storage `report_kind` column made required**, with memo queries filtered.
- **Generation trigger, permissions, and empty-chart behaviour defined.**
- **`allEntitiesNonTransparent` short-circuit removed** as ungrounded; only `hasNoForeignPE` kept.
- **art. 12ag "discharges the burden" softened to "supports/structures"**, mandatory draft banner.

**Key files referenced** (all absolute):
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\atad2_questions.json` (the authoritative branching question set the engine must consume)
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\src\lib\admin\promptKeys.ts` (prompt registry to extend)
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\supabase\migrations\20260604100000_memo_prompt_v3_no_preamble.sql` (prompt-seed migration pattern)
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\src\integrations\supabase\types.ts` (atad2_reports / atad2_answers / atad2_prompts schemas; hand-maintained; add `report_kind`)
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\src\lib\structure\types.ts` (`EntityType` enum incl. `hybrid_partnership`, `dh_entity`, `reverse_hybrid`)
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\src\pages\AssessmentReport.tsx` (lines 921-940: ReactMarkdown renderer, no table handlers, no remark-gfm; in-app blocker)
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\src\components\DownloadMemoButton.tsx` (DOCX render path + `templateSectionTags`; appendix needs a separate button)
- `c:\Users\adn356\OneDrive - Svalner Atlas\Documenten\Claude code\atad2-advisor\supabase\functions\extract-structure\` (edge-function pattern for the new `generate-appendix` function)

---

# Bijlage B - Per-artikel verificatielog

Resultaat van de adversariele verificatiestap per artikel. "needs-correction" betekent niet "fout in het plan" (die correcties zijn al verwerkt), maar dat de exacte wettekst niet verbatim online opgehaald kon worden en/of dat er een betwist/post-FKR punt speelt dat je als fiscalist nog moet bevestigen.

## art2-wet-vpb-1969 - Domestic CIT liability and entity classification gateway, incl. reverse hybrid (Artikel 2 Wet op de vennootschapsbelasting 1969)

**Verdict:** confirmed  |  **Confidence:** high

**Onzekerheden:**
- Lid numbering renumbered by Wet FKR per 1-1-2025: the NDFR commentary (April 2025) and 2025 secondary sources place the reverse-hybrid DEFINITION in lid 11 and the icbe/abi exception in lid 12, whereas 2024 Belastingdienst kennisgroep publications still cite lid 12 (definition) and lid 13 (exception). The DESIGNATION lid (lid 3) is stable. Verify the live consolidated text on wetten.overheid.nl for the exact deal date before quoting a lid number in a memo.
- The relatedness test is delegated to art. 12ac, lid 2 (>=50% / acting-together / control). Its precise mechanics are outside art. 2 and must be applied from that article's own commentary.
- The Wet modernisering personenvennootschappen (giving openbare personenvennootschappen legal personality while preserving fiscal transparency) was still at consultation/voorontwerp stage and not enacted as of the commentary date; a future enactment could alter how partnerships interact with art. 2 leden 1(e), 3 and 11.
- I could not load the fully rendered current art. 2 text from wetten.overheid.nl/maxius (cached/older versions returned only 10 leden without onderdeel h or the reverse-hybrid leden); the post-2025 structure is grounded on the NDFR commentary plus corroborating search summaries rather than a directly fetched consolidated statute.

**Doorgevoerde/aanbevolen correcties:**
- Optional: in the lid 1 onderdeel a description, mark the residual 'entities with capital divided into shares' wording as the (oud) framing or align it to the post-1-1-2025 onderdeel a text, to avoid implying the open-CV phrasing still appears in the statute. No legal substance changes.
- Optional: drop or footnote the word 'symmetrical' in front of 'similarity approach' in the purpose field unless a source using that exact descriptor is cited; the commentary calls it the 'similarity approach' plus 'vaste methode' without the 'symmetrical' qualifier.

## 12aa - Core anti-hybrid neutralisation rule (Hybridemismatches, art. 12aa Wet Vpb 1969)

**Verdict:** confirmed  |  **Confidence:** high

**Onzekerheden:**
- The authoritative NDFR commentary read is updated to 15 February 2022; it does not yet reflect the Wet FKR (1-1-2025) changes. The seven-onderdeel structure (a-g) of lid 1 was confirmed via InView to be unchanged, but I could not retrieve the verbatim 2025/2026 wetten.overheid.nl text of every lid (WebFetch could not render the article body), so the exact current wording of lid 2-6 is reproduced from commentary and secondary sources rather than the official consolidated text.
- The schema/prompt frames a distinct 'reverse hybrid' situation; in the Dutch statute the reverse hybrid (omgekeerde hybride) is primarily addressed by art. 2 lid 3 (taxpayer status) and the art. 12ac definitions, while art. 12aa lid 1 captures hybrid-entity mismatches under sub b and sub e. I mapped reverse-hybrid facts onto b/e plus the art. 2 lid 3 / FKR context rather than to a separate sub-onderdeel.
- The application of the origin requirement (oorsprongseis) to double deduction (sub g) is contested: the Staatssecretaris says it does not apply, but the commentary notes the opposite is arguable from the parliamentary citations. Advisors should flag this where a sub g position depends on it.
- Whether a specific cross-border consolidation regime (e.g. a non-US REIT/group regime) creates a hybrid entity for sub e is fact-specific; the Staatssecretaris's QRS/REIT view (besluit 1/11 Oct 2021) is an example, not a general rule, and each regime must be assessed on its own.

**Doorgevoerde/aanbevolen correcties:**
- In 'primarySecondary' and the primary/secondary checkbox, add that art. 12ab (secondary inclusion) applies only to art. 12aa lid 1 sub a, b, c, e and f - not to sub d and not to sub g (double deduction), per art. 12ab lid 1. Also note art. 12ab lid 3: NL only includes where NL is the state of the RECEIVER of the payment.
- Reword the Wet FKR citation to: the open CV is abolished and CVs become transparent per 1-1-2025; the FGR remains a separate (potentially non-transparent) vehicle under its own regime; the reverse hybrid stays a separate taxpayer via art. 2 lid 3. Do not present FGR/omgekeerde hybride as a single 'CV exception'.
- Add the numeric relatedness threshold for the lid 2 gateway: a gelieerd lichaam is in principle a belang of more than 25% (art. 12ac, referring to art. 13ab lid 8-10), extended by samenwerkende groep (art. 10a lid 6) and art. 2:24b BW group membership.
- Lower 'confidence' to 'medium-high' or keep 'high' but tie it explicitly to the NDFR commentary corroboration rather than to the (unverified) consolidated statute text for lid 2-6.

## 12ad - Imported hybrid mismatches (Geimporteerde hybridemismatches, art. 12ad Wet Vpb 1969)

**Verdict:** needs-correction  |  **Confidence:** medium

**Onzekerheden:**
- TARGETING DISCREPANCY: The task names art. 12ab as the TARGET, but the FOCUS it describes (imported mismatches / geimporteerde mismatches, NL deduction denied where the NL payment funds an un-neutralised hybrid mismatch elsewhere) is art. 12ad, not 12ab. Art. 12ab is a different mechanism (the secondary/defensive INCLUSION rule: NL as recipient includes income where the payer state does not deny under 12aa). I built this appendix for art. 12ad because that is the article matching the FOCUS; articleId is set to 12ad accordingly. If the app schema requires the literal id 12ab, the FOCUS text must be re-checked, because mapping the imported-mismatch substance onto 12ab would be legally wrong.
- The verbatim current statutory text of art. 12ad (lid 1 and lid 2) could not be fetched cleanly from wetten.overheid.nl (the page returned only the table of contents). The elements are grounded on the NDFR commentary plus parliamentary sources; exact statutory wording should be confirmed against wetten.overheid.nl for the 2025-01-01 / 2026 version.
- The NDFR commentary used is bijgewerkt tot 25 mei 2021 and therefore predates the Wet aanpassing fiscaal kwalificatiebeleid rechtsvormen (FKR, in force 1-1-2025). The FKR extended art. 12ad lid 1 to related natural persons (gelieerde natuurlijke personen) and changed the broader qualification regime (abolition of the open CV as non-transparent, etc.), which can change which chain entities count as hybrid. The element wording reflects this 2025 extension, but the precise renumbering/lid structure post-FKR was not verified word for word.
- The 25% relatedness threshold (gelieerd) is stated per general ATAD2/art. 12ac definitions confirmed via secondary web sources, not read directly from the art. 12ac definitions file in this session; advisors should confirm the exact gelieerdheid definition (and any acting-together / 50% control nuances) in art. 12ac for the relevant year.
- No case law on art. 12ad was reviewed (the jurisprudentie folder for 12ad was not opened); application is therefore based on statute and commentary only.

**Doorgevoerde/aanbevolen correcties:**
- Resolve the article identity before shipping: confirm with the schema/FOCUS whether the intended article is 12ad (imported hybrid mismatches) or 12ab (secondary inclusion rule). The junior's content is correct for 12ad, so if 12ad is intended, only the task label/title needs fixing; if 12ab is intended, the appendix must be rebuilt around the secondary inclusion rule.
- Verified correct against local commentary and needing no change (for a 12ad appendix): (a) the >=25% gelieerdheid threshold matches art. 12ac sec. 9 ('belang van meer dan 25%'); there is no 25-vs-50 error; (b) the primary (12aa, deny deduction) / secondary (12ab, include income) ordering is stated correctly and is not confused; (c) the hypothetical-Dutch-payer test, the funding-link / equal-amounts-only-an-indication point, the pro-rata 'voor zover' limitation, and the lid 2 neutralisation carve-out all match the art. 12ad commentary verbatim.
- The FKR 2025 extension to 'gelieerde natuurlijke personen' cannot be confirmed from the local commentary (bijgewerkt tot 25 mei 2021) but the concept of a natural person counting for gelieerdheid is supported by art. 12ac sec. 9; leave as a flagged item, confirm against the post-2025 statute.
- No applicable-when scenario is out of scope and no legal element is invented for art. 12ad; the standardReasons and checkboxItems are consistent with the 12ad statute and commentary.

## 12ac - Definitions / scope filters for the anti-hybrid rules (Artikel 12ac Wet Vpb 1969 - Definities)

**Verdict:** needs-correction  |  **Confidence:** medium

**Onzekerheden:**
- I could not retrieve the fully rendered current verbatim text of art. 12ac lid 2 from wetten.overheid.nl (dynamic pages did not expose the article body). The 25% general threshold is confirmed by the NDFR commentary and search results; the raised 50% threshold is confirmed for reverse-hybrid qualification and is the elevated test for hybrid-entity/disregarded-PE/dual-residence mismatches, but the exact statutory phrasing mapping each mismatch type to 25% vs 50% should be verified against the live wettekst before client use.
- The NDFR commentary is dated 15 February 2022 and predates the Wet FKR (in force 1-1-2025); the FKR impact on entity qualification naar Nederlandse maatstaven and on the open CV is sourced from PwC/Eerste Kamer summaries, not from updated art. 12ac commentary. Confirm whether art. 12ac wording itself was textually amended by the FKR.
- The commentary phrases the general test as 'meer dan 25%' (more than 25%) while the directive/ATAD2 and search results phrase it as 'ten minste 25%' (at least 25%). The precise boundary wording (>25% vs >=25%) should be checked against the live statute; I have stated 'at least 25%' following the ATAD2/search wording and flagged the discrepancy.
- Onderdeel g of art. 12ac lid 1 (hybride lichaam, referenced indirectly via the structured-arrangement scope 12aa lid 1 a-g) is not separately defined in the retrieved commentary; the hybrid-entity definition mechanics (qualification conflict between states) were taken from general knowledge and the FKR sources, not from a verbatim onderdeel-g quote.
- The 'overkill'/cost-plus and REIT dual-inclusion-income debate (Besluit Hybridemismatches 11-10-2021) is settled policy in the commentary but remains litigation-sensitive (possible HR/HvJ prejudicial questions); advisors should treat dual-inclusion-income conclusions in US cost-plus structures as a contested area.

**Doorgevoerde/aanbevolen correcties:**
- Replace the blanket '50% for hybrid-entity, disregarded-PE, imported and dual-residence mismatches' with the grounded test: a gelieerd lichaam exists at an interest of MORE THAN 25% (commentary: 'meer dan 25%', via art. 13ab lid 8-10), aggregated with a samenwerkende groep (art. 10a lid 6) and including any art. 2:24b BW groep member. Do NOT present a 50% art. 12ac threshold as settled; if retained, mark it explicitly as the reverse-hybrid test of art. 2 lid 12 (Dutch tax liability of an omgekeerd hybride lichaam), not the art. 12ac lid 2 relatedness gateway, and verify the exact differentiated wording against the live wettekst before client use.
- Change 'at least 25%' / '>=25%' to 'more than 25%' / '>25%' in the scope filter, the Gelieerd lichaam element, and the relatedness checkbox decisionStates, matching the commentary's 'meer dan 25%'. Keep a flag that ATAD2 phrases it as 'ten minste 25%' so the exact boundary is verified against the statute.
- Fix the onderdeel attribution: state that 'onderdeel a tot en met g' is art. 12aa lid 1 (structured-arrangement scope), and that art. 12ac lid 1 runs a, b, c, d, e, f and h (with the hybride overdracht in h). Remove the claim that art. 12ac lid 1 has an 'onderdeel g (hybride lichaam)'; the hybride lichaam concept is defined/used in art. 12aa, not via a 12ac onderdeel g.
- Add an explicit grounding caveat that the differentiated 25%/50% relatedness mechanics were NOT confirmed from the supplied art. 12ac commentary (which only gives >25%), so any checkbox or standard-reason that toggles on a 50% carve-out must be verified before relying on it in an assessment.

## 12ad - Imported hybrid mismatches (Geïmporteerde hybridemismatches)

**Verdict:** needs-correction  |  **Confidence:** high

**Onzekerheden:**
- The TASK FOCUS (dual inclusion income, DD/D-NI measurement and set-off, the 'same income taxed twice' carve-out) is NOT located in art. 12ad. Dual inclusion income (dubbel in aanmerking genomen inkomen) is defined in art. 12ac(1)(g) and the DD/D-NI set-off operates inside art. 12aa (and art. 15e lid 9 for PEs). Article 12ad imports those outcomes only by reference ('waarop art. 12aa van toepassing zou zijn'). The appendix therefore treats 12ad's own operative mechanic as the financing-link + 'voor zover' proration + lid 2 equivalent-adjustment carve-out, and flags that any dual-inclusion-income tick-box really belongs to the 12ac/12aa appendix entries.
- I could not retrieve the verbatim consolidated statutory text of art. 12ad from wetten.overheid.nl (copyright/extraction limits on the fetch). The element analysis rests on the authoritative NDFR commentary (read in full) plus the parliamentary text of the Wet FKR amendment. The lid 1/lid 2 substance is well grounded; exact current wording of every sub-clause was not machine-verified.
- The NDFR commentary is bijgewerkt tot 25 mei 2021 and predates the Wet FKR (in force 1-1-2025). The confirmed change is the widening of lid 1 to also cover related natural persons (gelieerde natuurlijke personen); I did not find any change to the lid 2 carve-out mechanics, but did not exhaustively verify the full 2025/2026 consolidated text.
- The relationship between 12ad and the dual-residence rule (art. 12ae) and the PE-related objectvrijstelling switch-off (art. 15e lid 9) is adjacent and may need its own appendix cross-reference; not elaborated here.

**Doorgevoerde/aanbevolen correcties:**
- In primarySecondary, remove the parenthetical '(or, for imported D/NI, requiring inclusion)' from the art. 12aa description. Restate the ordering as: (1) art. 12aa = primary response, denies the deduction at the Dutch payer (incl. onderdeel g for double deduction); (2) art. 12ab = secondary response, requires inclusion (winstneming) where the foreign payer state applies no primary response; (3) art. 12ad = imported-mismatch backstop, which only denies a deduction (it never requires inclusion). Inclusion is a 12ab mechanic, not a 12aa mechanic.
- Optional clarity add: the relatedness gateway runs on the art. 12ac 'gelieerd lichaam' definition, i.e. a belang of more than 25% (>25%), cross-referring to art. 13ab lid 8-10, plus samenwerkende groep (art. 10a lid 6) and art. 2:24b BW group situations. The decomposition does not misstate this, but stating the >25% threshold explicitly would harden the 'related party' element.

## 12ae - Neutralising dual-residence double deduction (Neutralisering dubbele vestigingsplaats)

**Verdict:** needs-correction  |  **Confidence:** high

**Onzekerheden:**
- The authoritative NDFR commentary is bijgewerkt tot 25 mei 2021. I could not retrieve the live verbatim statutory text from wetten.overheid.nl (the article body did not render in the fetched table-of-contents pages), so the precise current statutory wording of lid 1 and lid 2 (including exact references) is reconstructed from the commentary and general knowledge rather than quoted verbatim from the 2025/2026 consolidated text.
- I confirmed via search that the Wet aanpassing fiscaal kwalificatiebeleid rechtsvormen (Wet FKR, in force 1-1-2025) targets hybrid mismatches at their cause (entity qualification) but found no indication it amended art. 12ae specifically; a residual risk remains that minor cross-references in 12ae were renumbered by 2024/2025 legislation, which I could not verify against the live text.
- The cross-reference to 'dubbel in aanmerking genomen inkomen' relies on the definition feeding through art. 12aa lid 3; the exact statutory anchor for that term in the current text was not re-verified line by line.
- Lid 2's practical scope (EU Member State + sole-NL treaty residence) is described by the commentary as rarely triggered; whether any post-2021 case law or kennisgroepstandpunt has refined its operation was not checked.

**Doorgevoerde/aanbevolen correcties:**
- In all elements, applicableWhen, checkboxItems and standardReasons, replace 'the same costs/expenses' with the full statutory set: 'remunerations, payments, charges or losses (vergoedingen, betalingen, lasten of verliezen)'. Explicitly add that LOSSES are in scope, and update the checkbox 'Are the same costs/expenses actually deducted...' to 'Are the same vergoedingen, betalingen, lasten of verliezen deducted/deductible in both residence states'.
- Restate the lid 2 carve-out in the statute's own framing: where the other residence state is an EU Member State, NL denies the deduction only if, under the NL-Member-State tax treaty, the taxpayer is a tax resident of that OTHER Member State; conversely, if the treaty makes the taxpayer resident of the Netherlands, NL allows the deduction. Keep the practical-outcome note (deduction allowed in the treaty-residence state) but anchor it to the verbatim text 'wordt de aftrek alleen geweigerd indien ... fiscaal inwoner is van die lidstaat'.
- Add a one-line scope note that art. 12ae lid 1 imposes NO relatedness (gelieerdheid) or structured-arrangement requirement (contrast art. 12ad), so the dual-residence DD is corrected regardless of who else is involved; demote the Q28 'structured arrangement' link to an informational cross-reference rather than a condition.
- Clear the first uncertainty item: the verbatim statutory text of lid 1 and lid 2 is now confirmed (Kamerstukken 35241). Lid 1 has no lettered sub-paragraphs; lid 2 is a single sentence conditioning denial on EU-Member-State treaty residence.

## 12af - Carry-forward relief for previously denied hybrid-mismatch deductions / double-counted income (Verrekening geweigerde aftrek)

**Verdict:** needs-correction  |  **Confidence:** medium

**Onzekerheden:**
- The NDFR commentary used as primary grounding is bijgewerkt tot 25 mei 2021 and describes art. 12af as a two-sentence article (one lid). Current wetten.overheid.nl / InView indicate the article now has THREE leden, with lid 2 and lid 3 adding allocation rules that characterise the recaptured double-counted income as interest deduction / interest income for the art. 15b earningsstripping interaction. I could not retrieve the verbatim text of lid 2 and lid 3 from wetten.overheid.nl in this session (the deep-link fetch did not surface the article body); the lid 2/3 description is reconstructed from secondary sources and should be verified against the official text before being relied upon.
- I could not positively confirm the EXACT in-force date of the lid 2/3 amendment, only that it post-dates the May 2021 commentary and is in the 2025-01-01 consolidated version.
- The definition of 'dubbel in aanmerking genomen inkomen' is in art. 12ac(1)(d); this appendix references it but the precise statutory definition was not re-read in this session.
- The Wet aanpassing fiscaal kwalificatiebeleid rechtsvormen (Wet FKR, in force 1-1-2025) reduces hybrid mismatches generally (e.g. abolishing the open-CV's independent tax liability) but the sources reviewed do not show it amended art. 12af itself; this 'no direct amendment of 12af' conclusion is based on absence of evidence rather than a confirmed change log.
- The jurisprudence file for art. 12af in the knowledge base is empty (no ECLI numbers), so no case law could be cited; there appears to be little to no published case law specifically on art. 12af.

**Doorgevoerde/aanbevolen correcties:**
- Downgrade element 6 (lid 2/3 / interest deduction-income characterisation and art. 15b earningsstripping interaction) from a confirmed element to an explicitly-unverified note, or remove it from the elements list. The grounding commentary (tot 25-05-2021) treats art. 12af as a one-lid, two-sentence article; do not present lid 2/3 as established current statutory text without a verbatim wetten.overheid.nl/InView citation. Verify against the in-force consolidated text before relying on the interest-allocation rules.
- If retained, label element 6 and any 'post-2021 amendment' / 'per 1-1-2025' claims as UNVERIFIED in the body, not just in a trailing note, so the carve-out does not read as settled law.
- No other corrections needed: the (e)/(f)/(g) sub-paragraph mapping, the (a)-(d) exclusion, the cap-at-earlier-denied-amount rule, the once-only second-sentence rule, the 12aa(3) same-year vs 12af later-year timing split, and the art. 12ac(1)(d) definition of 'dubbel in aanmerking genomen inkomen' all check out against the local commentary and should be kept as-is.

## 12ag - Special documentation obligation for hybrid-mismatch rules (Bijzondere documentatieverplichting, art. 12ag Wet Vpb 1969)

**Verdict:** needs-correction  |  **Confidence:** high

**Onzekerheden:**
- The exact verbatim statutory wording of lid 1-3 could not be pulled from wetten.overheid.nl in this session (the article text did not render in the fetched fragments); the decomposition relies on the authoritative NDFR commentary, which paraphrases each lid closely. The substantive elements are reliable but the precise statutory phrasing is reproduced from commentary, not from the consolidated wettekst.
- The NDFR commentary used is bijgewerkt tot 25 mei 2021. I could not positively confirm via web fetch that no ministerial regulation under lid 3 has since been issued; the appendix should flag a current check of any art. 12ag ministeriële regeling.
- The Wet aanpassing fiscaal kwalificatiebeleid rechtsvormen (Wet FKR, in force 1-1-2025) changes how entities are qualified (CV/open CV, etc.) and thus affects WHICH situations are hybrid, but I could not web-confirm whether it textually amended art. 12ag itself; on the available evidence art. 12ag's documentation mechanics are unchanged and it remains valid per the 01-01-2026 consolidated version.
- Relationship to the informatiebeschikking (art. 52a AWR) is debated in literature (a found source questions whether lid 2 functions like an informatiebeschikking); this nuance is not fully resolved in the grounding source and is noted for advisor awareness rather than asserted.

**Doorgevoerde/aanbevolen correcties:**
- Soften or relabel the wetten.overheid.nl citation as UNVERIFIED (no statute text retrieved) so it matches the stated uncertainties; do not present it as a quoted, verified source.
- Reclassify art. 12af as the 'verrekening geweigerde aftrek' (carry-forward of a denied deduction) mechanism rather than a payment-catching response rule, to avoid implying it works like 12aa/12ab.
- Keep the explicit flag that lid 1-3 wording is paraphrased from NDFR commentary (mr. T.C. Cabollet, PwC, bijgewerkt tot 25 mei 2021) and note no consolidated wettekst was available locally to confirm lid 1's exact sub-paragraph structure.
- Retain the lid 3 ministeriele-regeling 'check current status' caveat, since the 2021 grounding source cannot confirm whether any later regulation has issued.



---

# Bijlage C - Onbewerkte juridische risico-bevindingen (critic)

- 50%-vs->25% RELATEDNESS SPLIT IS BAKED INTO THE TEMPLATE AS LAW but the verified findings explicitly DISCONFIRM it. The art. 12ac review (verdict: needs-correction) states the supplied commentary supports ONLY 'meer dan 25%' (>25%) plus samenwerkende groep, that a grep of the commentary returns ZERO hits for 50%, and that the 50% figure belongs to the art. 2 reverse-hybrid liability test, a DIFFERENT provision. The plan hard-codes a '>25% generally / raised 50% for hybrid-entity/reverse-hybrid/imported/dual-residence limbs' split in Section 1 header, Section 3.1, the §0.3 nexus, Section 7.2, and the section-5 mapping. Per ground truth this 50% mapping is ungrounded and must be removed from the relatedness gateway (the only place 50% is correct is the art. 2 reverse-hybrid >=50% test in Section 7). As drafted, the engine would apply a wrong threshold to live limbs.

- BOUNDARY >25% vs >=25% IS STATED INCONSISTENTLY. The plan writes '>25%' in some rows and the findings note the commentary says 'meer dan 25%' (strictly greater) while ATAD2/the term_explanation in Q22b says 'at least 25 percent'. Note: the actual assessment term_explanation for 'Associated enterprise' (Q22b) states 'at least 25 percent', which conflicts with the NDFR-grounded '>25%'. A checkbox toggling on exactly-25% ownership could resolve the wrong way. Must be human-verified and stated consistently.

- art. 12ab LIMB RESTRICTION (a,b,c,e,f - NOT d, NOT g) IS A VERIFIED CORRECTION the plan encodes correctly in Section 2 and 8.1, which is good - but it must be enforced in CODE in the decision engine, not just in prose, and the plan's Section 1 limb table footnote and Section 2 auto-render rule must be cross-checked so that limb d and limb g can never feed a 12ab inclusion. Any drift here is a substantive legal error per the art. 12aa review.

- art. 12ae SCOPE: LOSSES ARE IN-SCOPE AND lid 2 IS A RESTRICTION ON DENIAL. The verified 12ae review (needs-correction) says the denied items are 'vergoedingen, betalingen, lasten OF verliezen' (losses included) and that lid 2 is framed as: where the other state is an EU Member State, NL denies ONLY IF the treaty makes the taxpayer resident of the OTHER state (the contrapositive of the looser paraphrase). The plan's Section 5.2 does mention losses and 5.4 states a tie-breaker, but the lid-2 framing in 5.4 ('treaty makes the entity solely NL-resident -> NL allows') is the outcome, not the statutory condition, and risks being applied backwards. Use the verbatim 'wordt de aftrek alleen geweigerd indien ... fiscaal inwoner is van die lidstaat' framing.

- art. 12af lid 2/3 INTEREST CHARACTERISATION IS UNVERIFIED per the findings (the grounding commentary is a one-lid, two-sentence version predating the lid 2/3 amendment; the reviewer could not confirm lid 2/3 exists in the in-force text). The plan's Section 6 and 8.1 reference art. 12af leden but do not flag lid 2/3 as unverified in the body. Any §6 text mentioning interest/art. 15b interaction must be marked unverified, per ground truth.

- REVERSE-HYBRID LID NUMBERING (art. 2): the verified art. 2 finding flags post-FKR definition at lid 11 / icbe-abi at lid 12, while 2024 sources cite lid 12/13; only designation lid 3 is stable. The plan carries this caveat (Section 7 inline note + 8.1.1) which is correct, but the system prompt instruction to 'reproduce the citation as given and append (verify live lidnummer)' must be tested - there is real risk the model silently normalizes to one number. This is correctly flagged but high-risk in execution.

- ORIGIN REQUIREMENT (oorsprongseis) ON sub g (DD) IS CONTESTED per the art. 12aa review (Staatssecretaris says it does not apply to sub g; commentary says arguable). The plan flags this in 8.1.6 but does NOT surface it in the Section 1.g checkbox or worked Example B, where a DD position is actually taken. A §1.g 'Not applicable' that depends on the origin requirement would be a contestable legal position presented as settled.

- art. 12ad TARGETING/SUBSTANCE: two of the verified findings for 12ad are 'needs-correction' and one flags a TARGETING MISMATCH (the focus text described 12ad substance under a 12ab label). The plan's Section 2 (12ab) and Section 4 (12ad) keep them separate, which is correct, but the plan should not assume the underlying article decompositions are clean - it inherits the unresolved 12ab/12ad labeling confusion and the 'primary 12aa never requires inclusion; inclusion is a 12ab mechanic' correction that both 12ad reviews demand.

- art. 12ag STATUTORY WORDING IS PARAPHRASED, NOT VERBATIM, and the 'no ministeriele regeling under lid 3' claim is unconfirmed (verified 12ag finding: the wetten.overheid.nl citation was presented as sourced but could not be retrieved; art. 12af should not be listed as a payment-catching response rule). The plan's Section 8 leans heavily on the art. 12ag 'in hoeverre en op welke wijze' duty and the reversed 'doen blijken' burden as the appendix's entire justification. If the verbatim leden or the ministeriele-regeling status are wrong, the appendix's stated legal anchor is shaky. Section 8.6 ('checked for ministeriele regeling') must be a genuine human check, not an auto-'none'.

- CLAIMING THE APPENDIX 'DISCHARGES THE BURDEN OF PROOF UP FRONT' (sections 1.3, 8) IS A LEGALLY RISKY OVERSTATEMENT. art. 12ag's documentation duty requires per-item records ('per remuneration, payment, deemed payment, charge or loss'). An appendix built from question-level answers with many 'Further information needed' rows does NOT by itself discharge the doen-blijken burden; it may even evidence gaps. The plan should soften 'engineered to discharge that burden' to 'supports/structures the documentation', and the 'Draft - pending tax review' banner (8.2.6) should be mandatory, not optional, given the live 25/50% and lid-numbering uncertainties.

