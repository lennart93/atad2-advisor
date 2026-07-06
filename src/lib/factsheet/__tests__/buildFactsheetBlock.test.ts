import { describe, it, expect } from "vitest";
import { FactsheetSchema } from "../schema";
import { buildFactsheetBlock } from "../buildFactsheetBlock";

describe("buildFactsheetBlock", () => {
  it("returns empty string for a null sheet", () => {
    expect(buildFactsheetBlock(null)).toBe("");
  });

  it("renders entities, financing direction, flows and evidenced negatives", () => {
    const fs = FactsheetSchema.parse({
      entities: [{
        canonical_name: "WMC Project Holding B.V.", aliases: ["Liminal Holding B.V."], tin: "8652 85 135",
        jurisdiction: "NL", nl_classification: "non-transparent",
        related_to_taxpayers: { is_related: true, basis: "de facto control" },
        sources: [{ doc_label: "CbCR", loc: "p.21" }],
      }],
      financing: {
        external: [{ borrower: "Helios I B.V.", lender: "Société Générale", lender_identified_via: "ledger", amount: 70500000, ccy: "USD", rate: "7.94%", unusual_terms: "lender absorbs losses > USD 50k" }],
        intercompany: [],
      },
      flows: [{ payer: "WMC Energy B.V.", payee: "Global Services LLC", type: "recharge", amount: 1906863, ccy: "USD", cross_border: true, included_at_recipient: { value: "yes", basis: "US C-corp taxed" } }],
      pe_and_residence: { negatives: [{ claim: "no foreign PE claimed", evidence: [{ doc_label: "VPB 2024", loc: "item 12d = 0" }] }] },
    });
    const block = buildFactsheetBlock(fs);
    expect(block).toContain("WMC Project Holding B.V.");
    expect(block).toContain("aka Liminal Holding B.V.");
    expect(block).toContain("TIN 8652 85 135");
    expect(block).toContain("Helios I B.V. <- Société Générale");
    expect(block).toContain("lender identified via ledger");
    expect(block).toContain("WMC Energy B.V. -> Global Services LLC");
    expect(block).toContain("included at recipient: yes");
    expect(block).toContain("NEGATIVE (evidenced): no foreign PE claimed");
    expect(block).toContain("[VPB 2024 item 12d = 0]");
  });

  it("omits sections that are empty", () => {
    const fs = FactsheetSchema.parse({ entities: [{ canonical_name: "Solo B.V." }] });
    const block = buildFactsheetBlock(fs);
    expect(block).toContain("Solo B.V.");
    expect(block).not.toContain("### Financing");
    expect(block).not.toContain("### Flows");
  });
});
