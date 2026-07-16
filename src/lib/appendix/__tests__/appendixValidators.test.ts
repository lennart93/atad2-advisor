import { describe, it, expect } from "vitest";
import {
  missingRowIds,
  checkStatusReasoningConsistency,
  checkOwnershipSum,
  findDuplicateEntities,
} from "../appendixValidators";
import { defaultClassification } from "../classificationDefaults";

describe("missingRowIds (F1 coverage)", () => {
  it("returns skeleton rows the model did not return, order-preserving", () => {
    expect(missingRowIds(["8.1", "8.2", "8.3"], ["8.1"])).toEqual(["8.2", "8.3"]);
  });
  it("returns [] when all rows came back", () => {
    expect(missingRowIds(["8.1", "8.2"], ["8.2", "8.1"])).toEqual([]);
  });
});

describe("checkStatusReasoningConsistency (F4)", () => {
  it("flags the B.6.1 case: 'Not triggered' with text concluding the condition is met", () => {
    const r = checkStatusReasoningConsistency(
      "Not triggered",
      "The recipient deducts the payment and it is not included, so this condition is met.",
    );
    expect(r.consistent).toBe(false);
    expect(r.degradeTo).toBe("Insufficient information");
  });

  it("flags 'Triggered' with text concluding there is no mismatch", () => {
    const r = checkStatusReasoningConsistency("Triggered", "The income is picked up in full, so there is no mismatch.");
    expect(r.consistent).toBe(false);
    expect(r.degradeTo).toBe("Insufficient information");
  });

  it("passes a consistent 'Not triggered' with negating text", () => {
    expect(checkStatusReasoningConsistency("Not triggered", "The condition is not met because the income is included.").consistent).toBe(true);
  });

  it("passes a consistent 'Triggered' with confirming text", () => {
    expect(checkStatusReasoningConsistency("Triggered", "There is a deduction without inclusion, so the mismatch arises.").consistent).toBe(true);
  });

  it("does not trip 'does not apply' as a confirmation", () => {
    expect(checkStatusReasoningConsistency("Not triggered", "This provision does not apply to a domestic payment.").consistent).toBe(true);
  });

  it("stays neutral (consistent) when the text asserts nothing about the condition", () => {
    expect(checkStatusReasoningConsistency("Not triggered", "The taxpayer is a Dutch BV in the trading sector.").consistent).toBe(true);
  });
});

describe("checkOwnershipSum (F6)", () => {
  it("warns when direct shareholders do not sum to ~100%", () => {
    const w = checkOwnershipSum("WMC Group Holding", [
      { owner: "Jolivia Group LLC", pct: 37.24 },
      { owner: "Fossatum", pct: 37.24 },
      { owner: "CorpFi", pct: 20.42 },
    ]);
    expect(w).toContain("sum to 94.9");
  });
  it("passes the correct WMC split (42.34 / 37.24 / 20.42 = 100)", () => {
    expect(checkOwnershipSum("WMC Group Holding", [
      { owner: "Jolivia Group LLC", pct: 42.34 },
      { owner: "Fossatum", pct: 37.24 },
      { owner: "CorpFi", pct: 20.42 },
    ])).toBeNull();
  });
  it("does not fire with fewer than two known shares", () => {
    expect(checkOwnershipSum("X", [{ owner: "A", pct: 50 }, { owner: "B", pct: null }])).toBeNull();
  });
});

describe("findDuplicateEntities (F9a)", () => {
  it("flags a shared TIN (RSIN 8652 85 135)", () => {
    const w = findDuplicateEntities([
      { id: "E2", name: "WMC Project Holding B.V.", tin: "8652 85 135" },
      { id: "E15", name: "Liminal Holding B.V.", tin: "865285135" },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/E2, E15/);
  });
  it("flags a shared name/alias without a TIN", () => {
    const w = findDuplicateEntities([
      { id: "E14", name: "WMC Energy Corp", aliases: ["WMC USA Services Corp"] },
      { id: "E19", name: "WMC USA Services Corp" },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/E14, E19|E19, E14/);
  });
  it("does not double-report a pair matched by both TIN and name", () => {
    const w = findDuplicateEntities([
      { id: "A", name: "Same Co B.V.", tin: "111" },
      { id: "B", name: "Same Co B.V.", tin: "111" },
    ]);
    expect(w).toHaveLength(1);
  });
  it("returns [] for distinct entities", () => {
    expect(findDuplicateEntities([
      { id: "E1", name: "Alpha B.V.", tin: "1" },
      { id: "E2", name: "Beta B.V.", tin: "2" },
    ])).toEqual([]);
  });
});

describe("defaultClassification (F9b)", () => {
  it("US Inc./Corp -> per-se corporation, non-transparent, verify", () => {
    const d = defaultClassification("US", "Inc.")!;
    expect(d.homeClass).toBe("non-transparent");
    expect(d.verify).toBe(true);
    expect(d.basis).toMatch(/per-se corporation/);
  });
  it("US single-member LLC -> disregarded", () => {
    expect(defaultClassification("US", "LLC", 1)!.homeClass).toBe("disregarded");
  });
  it("US multi-member LLC -> partnership", () => {
    expect(defaultClassification("US", "LLC", 3)!.homeClass).toBe("partnership");
  });
  it("US LLC with unknown members -> disregarded default with a note", () => {
    const d = defaultClassification("US", "LLC")!;
    expect(d.homeClass).toBe("disregarded");
    expect(d.basis).toMatch(/member count unconfirmed/i);
  });
  it("HK Ltd / Irish DAC / Swiss AG -> non-transparent", () => {
    expect(defaultClassification("HK", "Ltd")!.homeClass).toBe("non-transparent");
    expect(defaultClassification("IE", "DAC")!.homeClass).toBe("non-transparent");
    expect(defaultClassification("CH", "AG")!.homeClass).toBe("non-transparent");
  });
  it("FR SARL -> non-transparent via the generic corporate-form fallback", () => {
    // Used to be null before the corporate-form table (16 jul 2026); a French
    // SARL is a well-known capital form, opaque under its own law.
    expect(defaultClassification("FR", "SARL")!.homeClass).toBe("non-transparent");
  });
  it("returns null for a Dutch entity or an unknown form", () => {
    expect(defaultClassification("NL", "BV")).toBeNull();
    expect(defaultClassification("BE", "Mystery Vorm")).toBeNull();
  });
});
