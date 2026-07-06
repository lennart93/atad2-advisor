# Factsheet pipeline — WMC dossier eval checklist

Manual acceptance checklist for a **real** run of the factsheet pipeline on the
WMC group dossier (July 2026). The pure-function plumbing is regression-tested in
`src/lib/factsheet/__tests__/wmcFixture.test.ts`; the items below are the
model-quality assertions that need a live `extract-docfacts` → `build-factsheet`
→ swarm v18 run to verify. Tick each after inspecting the built fact sheet
(documents step → "Group fact sheet" panel) and the resulting prefills/letter.

## Fact sheet (build-factsheet output)

1. [ ] Deduplicates **WMC Project Holding B.V. ↔ Liminal Holding B.V.** via TIN
       `8652 85 135` — one entity, both names in `aliases`.
2. [ ] Senior loans (USD 37.5m, **Sun Life**, 4–5%, 2027) sit with **Joshua
       Energy One DAC**, not WMC Energy B.V. or Helios I B.V.
3. [ ] Helios facility: lender **Société Générale** identified via the general
       ledger (`0630 Loan Societe Generale`), USD 70.5m, 7.94%; `unusual_terms`
       carries the loss-absorption above USD 50k.
4. [ ] Flows include the cost-plus recharge USD 1,906,863 **and** the 0.25% fee
       USD 30,154, direction NL → US, `included_at_recipient = yes` with US-tax
       evidence.
5. [ ] Elections: Global Services executed 2023; WMC Energy B.V. `to_verify`;
       Partners Holding `to_verify`.
6. [ ] Evidenced negatives: no foreign PE (objectvrijstelling nil per return),
       no repos, no dual residence, no dividend 2024 — each with a `loc`.
7. [ ] `inconsistencies` contains the SBIE-payroll-to-PE allocation from the
       CbCR workbook.
8. [ ] Joshua marked **related** via consolidation / de-facto control despite a
       0% shareholding.
11. [ ] The facility drawdown (70,444,475) is matched to the near-equal turnover
        elimination (70,444,486) and read as a **trading** flow, not on-lending
        (back-to-back node distinguishes it).

## Downstream prefills / client letter (swarm v18)

9. [ ] The prefill for the "payments to associated enterprises" node names the
       cross-border fees (not only domestic flows).
10. [ ] 4b-type nodes answer **"No"** with the pick-up reasoning (v17 direction
        check stays green; v18 does not regress it).
12. [ ] The WMC open-questions letter **shrinks**: the lender-identity and
        Corp-fee questions disappear (answerable from the docs); what remains is
        foreign-treatment confirmations and negative confirmations.

## Notes for the reviewer

- Run order matters: upload the WMC docs, let `useDocFactsPrewarm` extract each,
  then `useFactsheetPrewarm` builds the sheet. Rebuild once if a doc was still
  extracting at build time (the panel shows "Out of date, rebuild").
- The progressive re-run only re-touches **pending** prefills that were weak
  (unknown or confidence < 60). Accept/dismiss a suggestion and it is frozen.
- Every hard decision rule in swarm v18 is **DRAFT, pending tax review** until
  signed off (spec section 8).
