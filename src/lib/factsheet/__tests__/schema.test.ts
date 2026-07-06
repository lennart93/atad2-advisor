import { describe, it, expect } from "vitest";
import { FactsheetSchema, DocFactsSchema } from "../schema";

describe("FactsheetSchema", () => {
  it("fills every top-level key from an empty object (lenient defaults)", () => {
    const fs = FactsheetSchema.parse({});
    expect(fs.entities).toEqual([]);
    expect(fs.financing).toEqual({ external: [], intercompany: [] });
    expect(fs.flows).toEqual([]);
    expect(fs.elections).toEqual([]);
    expect(fs.pe_and_residence.negatives).toEqual([]);
    expect(fs.inconsistencies).toEqual([]);
    expect(fs.open_points).toEqual([]);
  });

  it("coerces an unknown enum value to its safe fallback instead of throwing", () => {
    const fs = FactsheetSchema.parse({
      entities: [{ canonical_name: "X", nl_classification: "banana" }],
      flows: [{ payer: "A", payee: "B", type: "weird", included_at_recipient: { value: "maybe" } }],
    });
    expect(fs.entities[0].nl_classification).toBe("unknown");
    expect(fs.flows[0].type).toBe("other");
    expect(fs.flows[0].included_at_recipient?.value).toBe("unknown");
  });

  it("keeps a well-formed entity with aliases + TIN + related basis", () => {
    const fs = FactsheetSchema.parse({
      entities: [{
        canonical_name: "WMC Project Holding B.V.",
        aliases: ["Liminal Holding B.V."],
        tin: "8652 85 135",
        jurisdiction: "NL",
        related_to_taxpayers: { is_related: true, basis: "2:24b BW group" },
        sources: [{ doc_label: "CbCR", loc: "p.21" }],
      }],
    });
    const e = fs.entities[0];
    expect(e.aliases).toContain("Liminal Holding B.V.");
    expect(e.tin).toBe("8652 85 135");
    expect(e.related_to_taxpayers?.is_related).toBe(true);
    expect(e.sources[0].loc).toBe("p.21");
  });

  it("preserves financing direction and unusual terms", () => {
    const fs = FactsheetSchema.parse({
      financing: {
        external: [{ borrower: "Helios I B.V.", lender: "Société Générale", lender_identified_via: "ledger", amount: 70500000, ccy: "USD", rate: "7.94%", unusual_terms: "lender absorbs losses > USD 50k" }],
        intercompany: [],
      },
    });
    const l = fs.financing.external[0];
    expect(l.lender).toBe("Société Générale");
    expect(l.lender_identified_via).toBe("ledger");
    expect(l.unusual_terms).toContain("50k");
  });
});

describe("DocFactsSchema", () => {
  it("accepts a per-doc subset without cross-document fields", () => {
    const d = DocFactsSchema.parse({
      entities: [{ canonical_name: "A", tin: "123" }],
      pe_and_residence: { negatives: [{ claim: "no foreign PE", evidence: [{ doc_label: "VPB 2024", loc: "item 12d = 0" }] }] },
    });
    expect(d.entities[0].tin).toBe("123");
    expect(d.pe_and_residence.negatives[0].evidence[0].loc).toBe("item 12d = 0");
    // related_to_taxpayers is omitted from the per-doc shape.
    expect((d.entities[0] as Record<string, unknown>).related_to_taxpayers).toBeUndefined();
  });
});
