// WMC dossier regression fixture (factsheet pipeline eval, spec section 7).
//
// This encodes the EXPECTED merged fact sheet for the WMC group as a fixture and
// asserts that (a) it validates, and (b) our plumbing — schema + block builder —
// faithfully carries every fact the swarm must see. It does NOT run the live
// LLM: the model-quality assertions (does build-factsheet actually produce this
// from the raw docs?) live in docs/factsheet-wmc-eval-checklist.md and are
// verified by hand against a real run. What this file guards is that a schema or
// block-builder change never silently drops one of these facts.

import { describe, it, expect } from "vitest";
import { FactsheetSchema } from "../schema";
import { buildFactsheetBlock } from "../buildFactsheetBlock";

const WMC_FIXTURE = FactsheetSchema.parse({
  entities: [
    {
      canonical_name: "WMC Project Holding B.V.",
      aliases: ["Liminal Holding B.V."],
      tin: "8652 85 135",
      jurisdiction: "NL",
      legal_form: "BV",
      role: "parent",
      nl_classification: "non-transparent",
      sources: [{ doc_label: "CbCR workbook", loc: "tab Entities" }, { doc_label: "VPB 2024 Liminal", loc: "cover" }],
    },
    {
      canonical_name: "Joshua Energy One DAC",
      aliases: [],
      jurisdiction: "IE",
      legal_form: "DAC",
      role: "subsidiary",
      related_to_taxpayers: { is_related: true, basis: "2:24b BW group (consolidation / de facto control), 0% shareholding", pct_indirect: 0 },
      sources: [{ doc_label: "Consolidated FS", loc: "note 13" }],
    },
    { canonical_name: "WMC Energy B.V.", jurisdiction: "NL", legal_form: "BV", role: "subsidiary" },
    { canonical_name: "Helios I B.V.", jurisdiction: "NL", legal_form: "BV", role: "subsidiary" },
    { canonical_name: "Global Services LLC", jurisdiction: "US", legal_form: "LLC", role: "related_other",
      foreign_classifications: [{ country: "US", classification: "corporation", basis: "CTB election executed 2023", status: "confirmed" }] },
  ],
  financing: {
    external: [
      { borrower: "Joshua Energy One DAC", lender: "Sun Life", amount: 37500000, ccy: "USD", rate: "4-5%", maturity: "2027",
        sources: [{ doc_label: "Consolidated FS", loc: "note 13" }] },
      { borrower: "Helios I B.V.", lender: "Société Générale", lender_identified_via: "ledger", amount: 70500000, ccy: "USD", rate: "7.94%", maturity: "2025",
        unusual_terms: "lender absorbs losses above USD 50k",
        sources: [{ doc_label: "General ledger", loc: "0630 Loan Societe Generale" }, { doc_label: "Financial statements", loc: "note 11" }] },
    ],
    intercompany: [],
  },
  flows: [
    { payer: "WMC Energy B.V.", payee: "Global Services LLC", type: "recharge", amount: 1906863, ccy: "USD", fy: "2024",
      cross_border: true, deductible_nl: true, included_at_recipient: { value: "yes", basis: "US C-corp, 2024 tax USD 61,667 on PBT 129,337" },
      sources: [{ doc_label: "SLA", loc: "sch. 2" }] },
    { payer: "WMC Energy B.V.", payee: "Global Services LLC", type: "service_fee", amount: 30154, ccy: "USD", fy: "2024",
      cross_border: true, deductible_nl: true, included_at_recipient: { value: "yes", basis: "0.25% fee, taxed in the US" },
      sources: [{ doc_label: "SLA", loc: "sch. 3" }] },
  ],
  elections: [
    { entity: "Global Services LLC", regime: "US CTB", target: "corporation", status: "executed", effective_date: "2023-01-01" },
    { entity: "WMC Energy B.V.", regime: "US CTB", status: "to_verify" },
    { entity: "Partners Holding", regime: "US CTB", status: "to_verify" },
  ],
  pe_and_residence: {
    foreign_pes: [],
    vat_registrations: [{ entity: "WMC Energy B.V.", country: "SE", purpose: "commodity trading" }],
    dual_residence_indications: [],
    negatives: [
      { claim: "no foreign permanent establishment claimed by any taxpayer (objectvrijstelling nil)", evidence: [{ doc_label: "VPB 2024 WMC Energy", loc: "item 12d = 0" }] },
      { claim: "no repo or securities-lending positions", evidence: [{ doc_label: "Financial statements", loc: "notes 14-16" }] },
      { claim: "no dual-residence indications", evidence: [{ doc_label: "VPB 2024 Liminal", loc: "residence section" }] },
      { claim: "no dividend distributed in 2024", evidence: [{ doc_label: "Financial statements", loc: "statement of changes in equity" }] },
    ],
  },
  instruments_transfers: { repos_seclending: [], commodity_forwards_note: "commodity forwards for trading, not financing" },
  inconsistencies: [
    { description: "SBIE sheet allocates full NL payroll to 'permanent establishments' while no PE exists anywhere", docs: ["CbCR workbook"], severity: "verify_before_final" },
  ],
  open_points: [
    { question: "Confirm the US tax treatment of Global Services LLC for 2024", why_docs_cannot_answer: "foreign-side tax treatment", suggested_addressee: "us_adviser" },
  ],
});

describe("WMC factsheet fixture", () => {
  const byName = (n: string) => WMC_FIXTURE.entities.find((e) => e.canonical_name === n)!;

  it("1. deduplicates WMC Project Holding <-> Liminal Holding via TIN 8652 85 135 (aliases filled)", () => {
    const e = byName("WMC Project Holding B.V.");
    expect(e.tin).toBe("8652 85 135");
    expect(e.aliases).toContain("Liminal Holding B.V.");
    // exactly one entity carries this TIN
    expect(WMC_FIXTURE.entities.filter((x) => x.tin === "8652 85 135")).toHaveLength(1);
  });

  it("2. senior Sun Life loan sits with Joshua Energy One DAC, not WMC Energy / Helios", () => {
    const sunLife = WMC_FIXTURE.financing.external.find((l) => l.lender === "Sun Life")!;
    expect(sunLife.borrower).toBe("Joshua Energy One DAC");
    expect(sunLife.borrower).not.toBe("WMC Energy B.V.");
    expect(sunLife.borrower).not.toBe("Helios I B.V.");
  });

  it("3. Helios facility: Société Générale identified via ledger, USD 70.5m, 7.94%, loss-absorption term", () => {
    const helios = WMC_FIXTURE.financing.external.find((l) => l.borrower === "Helios I B.V.")!;
    expect(helios.lender).toBe("Société Générale");
    expect(helios.lender_identified_via).toBe("ledger");
    expect(helios.amount).toBe(70500000);
    expect(helios.rate).toBe("7.94%");
    expect(helios.unusual_terms).toMatch(/50k/);
  });

  it("4. cross-border fees to Global Services LLC are included at the recipient", () => {
    expect(WMC_FIXTURE.flows).toHaveLength(2);
    for (const f of WMC_FIXTURE.flows) {
      expect(f.payer).toBe("WMC Energy B.V.");
      expect(f.payee).toBe("Global Services LLC");
      expect(f.cross_border).toBe(true);
      expect(f.included_at_recipient?.value).toBe("yes");
    }
    expect(WMC_FIXTURE.flows.map((f) => f.amount)).toEqual([1906863, 30154]);
  });

  it("5. elections: Global Services executed 2023; WMC Energy + Partners Holding to_verify", () => {
    const byE = (n: string) => WMC_FIXTURE.elections.find((x) => x.entity === n)!;
    expect(byE("Global Services LLC").status).toBe("executed");
    expect(byE("WMC Energy B.V.").status).toBe("to_verify");
    expect(byE("Partners Holding").status).toBe("to_verify");
  });

  it("6. every negative carries an evidence loc", () => {
    expect(WMC_FIXTURE.pe_and_residence.negatives).toHaveLength(4);
    for (const n of WMC_FIXTURE.pe_and_residence.negatives) {
      expect(n.evidence.length).toBeGreaterThan(0);
      expect(n.evidence[0].loc).toBeTruthy();
    }
  });

  it("7. inconsistencies flag the SBIE payroll-to-PE allocation from the CbCR workbook", () => {
    const sbie = WMC_FIXTURE.inconsistencies.find((i) => /SBIE/.test(i.description))!;
    expect(sbie).toBeTruthy();
    expect(sbie.docs).toContain("CbCR workbook");
  });

  it("8. Joshua is related via consolidation / de-facto control despite 0% shareholding", () => {
    const j = byName("Joshua Energy One DAC");
    expect(j.related_to_taxpayers?.is_related).toBe(true);
    expect(j.related_to_taxpayers?.basis).toMatch(/de facto control|2:24b/);
    expect(j.related_to_taxpayers?.pct_indirect).toBe(0);
  });

  it("carries all of the above into the injected swarm block (plumbing does not drop them)", () => {
    const block = buildFactsheetBlock(WMC_FIXTURE);
    expect(block).toContain("aka Liminal Holding B.V.");
    expect(block).toContain("TIN 8652 85 135");
    expect(block).toContain("Joshua Energy One DAC <- Sun Life");
    expect(block).toContain("Helios I B.V. <- Société Générale");
    expect(block).toContain("lender identified via ledger");
    expect(block).toContain("WMC Energy B.V. -> Global Services LLC");
    expect(block).toContain("included at recipient: yes");
    expect(block).toContain("NEGATIVE (evidenced): no foreign permanent establishment");
    expect(block).toContain("SBIE sheet allocates full NL payroll");
    expect(block).toMatch(/Joshua Energy One DAC.*related to taxpayer/);
  });
});
