import { describe, it, expect } from "vitest";
import { FactsheetSchema } from "../schema";
import { mergeFactsheets } from "../mergeFactsheets";

const fs = (obj: unknown) => FactsheetSchema.parse(obj);

describe("mergeFactsheets", () => {
  it("returns the single partial unchanged when there is only one", () => {
    const a = fs({ entities: [{ canonical_name: "A B.V." }] });
    expect(mergeFactsheets([a])).toBe(a);
  });

  it("dedupes an entity across chunks by TIN and unions its aliases", () => {
    const a = fs({ entities: [{ canonical_name: "WMC Project Holding B.V.", tin: "8652 85 135", jurisdiction: "NL" }] });
    const b = fs({ entities: [{ canonical_name: "Liminal Holding B.V.", tin: "865285135", role: "parent" }] });
    const m = mergeFactsheets([a, b]);
    expect(m.entities).toHaveLength(1);
    const e = m.entities[0];
    expect(e.tin).toBe("8652 85 135");
    expect(e.jurisdiction).toBe("NL");
    expect(e.role).toBe("parent");
    // The non-canonical name is carried as an alias.
    expect([e.canonical_name, ...e.aliases]).toEqual(expect.arrayContaining(["WMC Project Holding B.V.", "Liminal Holding B.V."]));
  });

  it("dedupes on a shared name/alias without a TIN", () => {
    const a = fs({ entities: [{ canonical_name: "WMC Energy Corp", aliases: ["WMC USA Services Corp"] }] });
    const b = fs({ entities: [{ canonical_name: "WMC USA Services Corp", jurisdiction: "US" }] });
    const m = mergeFactsheets([a, b]);
    expect(m.entities).toHaveLength(1);
    expect(m.entities[0].jurisdiction).toBe("US");
  });

  it("keeps distinct entities separate", () => {
    const a = fs({ entities: [{ canonical_name: "Alpha B.V.", tin: "1" }] });
    const b = fs({ entities: [{ canonical_name: "Beta B.V.", tin: "2" }] });
    expect(mergeFactsheets([a, b]).entities).toHaveLength(2);
  });

  it("prefers a related_to_taxpayers with is_related=true", () => {
    const a = fs({ entities: [{ canonical_name: "Joshua Energy One DAC", tin: "9", related_to_taxpayers: { is_related: false } }] });
    const b = fs({ entities: [{ canonical_name: "Joshua Energy One DAC", tin: "9", related_to_taxpayers: { is_related: true, basis: "consolidation" } }] });
    expect(mergeFactsheets([a, b]).entities[0].related_to_taxpayers?.is_related).toBe(true);
  });

  it("unions financing, flows, negatives, inconsistencies and open_points with dedup", () => {
    const a = fs({
      financing: { external: [{ borrower: "Helios I B.V.", lender: "Societe Generale", amount: 70500000, ccy: "USD" }], intercompany: [] },
      flows: [{ payer: "X", payee: "Y", type: "interest", amount: 100, ccy: "USD" }],
      pe_and_residence: { negatives: [{ claim: "no foreign PE", evidence: [] }] },
      inconsistencies: [{ description: "SBIE payroll", docs: ["CbCR"] }],
      open_points: [{ question: "confirm US treatment" }],
    });
    const b = fs({
      // same external loan (duplicate) + a new flow + a duplicate negative
      financing: { external: [{ borrower: "Helios I B.V.", lender: "Societe Generale", amount: 70500000, ccy: "USD" }], intercompany: [] },
      flows: [{ payer: "A", payee: "B", type: "service_fee", amount: 30154, ccy: "USD" }],
      pe_and_residence: { negatives: [{ claim: "no foreign PE", evidence: [] }] },
      inconsistencies: [],
      open_points: [{ question: "confirm US treatment" }],
    });
    const m = mergeFactsheets([a, b]);
    expect(m.financing.external).toHaveLength(1); // deduped
    expect(m.flows).toHaveLength(2); // distinct
    expect(m.pe_and_residence.negatives).toHaveLength(1); // deduped by claim
    expect(m.inconsistencies).toHaveLength(1);
    expect(m.open_points).toHaveLength(1); // deduped by question
  });

  it("produces a schema-valid factsheet", () => {
    const a = fs({ entities: [{ canonical_name: "A B.V.", tin: "1" }], flows: [{ payer: "A", payee: "B", type: "interest" }] });
    const b = fs({ entities: [{ canonical_name: "C B.V.", tin: "2" }] });
    const m = mergeFactsheets([a, b]);
    expect(() => FactsheetSchema.parse(m)).not.toThrow();
  });
});
